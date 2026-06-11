"use server";

import { assertCanDirectlyManagePool } from "@/lib/admin/assertCanDirectlyManagePool";
import { assertCanManagePool } from "@/lib/admin/assertCanManagePool";
import {
  gateSimulationPoolOutboundEmail,
  logSimulationPoolEmailSuccess,
} from "@/lib/admin/enforceSimulationPoolEmailForAction";
import { isSimulationEmailOverrideEnabledInProduction } from "@/lib/admin/simulationPoolEmailPolicy";
import { revalidatePoolAdminPaths } from "@/lib/admin/revalidatePoolAdminPaths";
import { createClient } from "@/lib/supabase/server";
import { joinInviteUrl } from "@/lib/site-url";
import { generateInviteToken } from "../../../../lib/invites/generateInviteToken";
import { resolveInviterLabelForPoolInvite } from "../../../../lib/invites/resolveInviterLabelForPoolInvite";
import { sendParticipantInviteEmail } from "../../../../lib/invites/sendParticipantInviteEmail";
import { logAdminRiskAction } from "@/lib/admin/adminRiskAuditLog";
import {
  formatRemoveParticipantSuccessMessage,
  REMOVE_PARTICIPANT_ALREADY_GONE_MESSAGE,
} from "@/lib/participants/removeParticipantFromPoolPolicy";
import {
  areWorldCupPoolsCompatibleForMove,
  formatMoveParticipantSuccessMessage,
  mapMoveWorldCupParticipantRpcError,
  MOVE_PARTICIPANT_DUPLICATE_BLOCKED_MESSAGE,
  participantWouldDuplicateInDestinationPool,
  poolsToRecomputeAfterParticipantMove,
  validateDirectPoolAdminMoveAccess,
  worldCupPoolMoveScopeFromManagedPool,
} from "@/lib/participants/worldCupParticipantMove";
import { fetchDirectlyManagedPoolsForCurrentUser } from "@/lib/pools/fetchDirectlyManagedPoolsForCurrentUser";
import { fetchPoolEditionScope } from "@/lib/tournament/editionScope";
import { recomputePoolLedgerForPool } from "@/lib/scoring/recomputePoolLedger";
import {
  mapParticipantRow,
  paidAtForInsert,
  type ParticipantRow,
} from "../../../../lib/participants/participantsDb";
import type { Participant } from "../../../../types/participant";

export type ParticipantActionResult =
  | {
      ok: true;
      participant?: Participant;
      inviteUrl?: string;
      emailSent?: boolean;
      emailMessage?: string;
      message?: string;
      removedDisplayName?: string;
      alreadyRemoved?: boolean;
    }
  | { ok: false; error: string };

function messageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

async function poolMetaForPool(
  supabase: Awaited<ReturnType<typeof createClient>>,
  poolId: string,
): Promise<{ name: string; isSimulation: boolean }> {
  const { data } = await supabase
    .from("pools")
    .select("name, is_simulation")
    .eq("id", poolId)
    .maybeSingle();
  return {
    name: (data?.name as string | undefined)?.trim() || "your pool",
    isSimulation: Boolean(data?.is_simulation),
  };
}

function revalidateParticipants(poolId: string) {
  revalidatePoolAdminPaths(poolId);
}

export async function createParticipantAction(input: {
  poolId: string;
  displayName: string;
  email: string;
  paid: boolean;
}): Promise<ParticipantActionResult> {
  try {
    const supabase = await createClient();
    const gate = await assertCanManagePool(supabase, input.poolId);
    if (!gate.ok) return { ok: false, error: gate.error };

    const pid = input.poolId.trim();
    const paidAt = paidAtForInsert(input.paid);
    const { data, error } = await supabase
      .from("participants")
      .insert({
        pool_id: pid,
        display_name: input.displayName.trim(),
        email: input.email.trim(),
        is_paid: input.paid,
        paid_at: paidAt,
      })
      .select(
        "id, pool_id, display_name, email, is_paid, paid_at, user_id, invite_pending, invite_last_sent_at",
      )
      .single();

    if (error) return { ok: false, error: error.message };
    revalidateParticipants(pid);
    return {
      ok: true,
      participant: mapParticipantRow(data as ParticipantRow),
    };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

export async function inviteParticipantAction(input: {
  poolId: string;
  displayName: string;
  email: string;
  paid: boolean;
  productionAcknowledged?: boolean;
  simulationEmailAcknowledged?: boolean;
  typedConfirmationPhrase?: string;
}): Promise<ParticipantActionResult> {
  try {
    const supabase = await createClient();
    const gate = await assertCanManagePool(supabase, input.poolId);
    if (!gate.ok) return { ok: false, error: gate.error };

    const pid = input.poolId.trim();
    const poolMeta = await poolMetaForPool(supabase, pid);
    const {
      data: { user: inviter },
    } = await supabase.auth.getUser();

    const emailGate = await gateSimulationPoolOutboundEmail({
      supabase,
      poolId: pid,
      poolName: poolMeta.name,
      action: "participant_invite_email",
      userId: inviter?.id ?? null,
      userEmail: inviter?.email,
      recipientCount: 1,
      productionAcknowledged: input.productionAcknowledged,
      simulationEmailAcknowledged: input.simulationEmailAcknowledged,
      typedConfirmationPhrase: input.typedConfirmationPhrase,
    });
    if (!emailGate.ok) {
      return { ok: false, error: emailGate.error };
    }

    const paidAt = paidAtForInsert(input.paid);
    const token = generateInviteToken();
    const sentAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("participants")
      .insert({
        pool_id: pid,
        display_name: input.displayName.trim(),
        email: input.email.trim(),
        is_paid: input.paid,
        paid_at: paidAt,
        invite_token: token,
        invite_last_sent_at: sentAt,
      })
      .select(
        "id, pool_id, display_name, email, is_paid, paid_at, user_id, invite_pending, invite_last_sent_at",
      )
      .single();

    if (error) return { ok: false, error: error.message };

    const inviteUrl = joinInviteUrl(token);
    const inviterLabel = inviter
      ? await resolveInviterLabelForPoolInvite(supabase, pid, inviter)
      : "Your pool organizer";
    const mail = await sendParticipantInviteEmail({
      to: input.email.trim(),
      poolName: poolMeta.name,
      displayName: input.displayName.trim(),
      inviteUrl,
      inviterLabel,
    });

    if (mail.ok) {
      logSimulationPoolEmailSuccess({
        action: "participant_invite_email",
        userId: inviter?.id ?? null,
        userEmail: inviter?.email,
        poolId: pid,
        poolName: poolMeta.name,
        isSimulationPool: poolMeta.isSimulation,
        overrideEnabled: isSimulationEmailOverrideEnabledInProduction(),
        recipientCount: 1,
      });
    }

    revalidateParticipants(pid);

    let emailMessage: string | undefined;
    if (!mail.ok) {
      emailMessage = mail.skipped
        ? "Invite link is ready — email is not configured, so copy the link below."
        : mail.error;
    }

    return {
      ok: true,
      participant: mapParticipantRow(data as ParticipantRow),
      inviteUrl,
      emailSent: mail.ok,
      emailMessage,
    };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

export async function sendParticipantInviteAction(input: {
  poolId: string;
  participantId: string;
  productionAcknowledged?: boolean;
  simulationEmailAcknowledged?: boolean;
  typedConfirmationPhrase?: string;
}): Promise<ParticipantActionResult> {
  try {
    const supabase = await createClient();
    const gate = await assertCanManagePool(supabase, input.poolId);
    if (!gate.ok) return { ok: false, error: gate.error };

    const pid = input.poolId.trim();
    const participantId = input.participantId.trim();

    const { data: row, error: fetchErr } = await supabase
      .from("participants")
      .select(
        "id, pool_id, display_name, email, user_id, invite_token, invite_last_sent_at",
      )
      .eq("id", participantId)
      .eq("pool_id", pid)
      .maybeSingle();

    if (fetchErr) return { ok: false, error: fetchErr.message };
    if (!row) return { ok: false, error: "Participant not found." };

    const userId = row.user_id as string | null;
    if (userId) {
      return { ok: false, error: "This person has already joined." };
    }

    const email = (row.email as string | null)?.trim() ?? "";
    if (!email) {
      return {
        ok: false,
        error: "Add an email address before sending an invite.",
      };
    }

    let token = row.invite_token as string | null;
    const now = new Date().toISOString();
    if (!token) {
      token = generateInviteToken();
      const { error: upErr } = await supabase
        .from("participants")
        .update({
          invite_token: token,
          invite_last_sent_at: now,
        })
        .eq("id", participantId)
        .eq("pool_id", pid);
      if (upErr) return { ok: false, error: upErr.message };
    } else {
      const { error: upErr } = await supabase
        .from("participants")
        .update({ invite_last_sent_at: now })
        .eq("id", participantId)
        .eq("pool_id", pid);
      if (upErr) return { ok: false, error: upErr.message };
    }

    const poolMeta = await poolMetaForPool(supabase, pid);
    const {
      data: { user: inviter },
    } = await supabase.auth.getUser();

    const emailGate = await gateSimulationPoolOutboundEmail({
      supabase,
      poolId: pid,
      poolName: poolMeta.name,
      action: "participant_invite_email",
      userId: inviter?.id ?? null,
      userEmail: inviter?.email,
      recipientCount: 1,
      productionAcknowledged: input.productionAcknowledged,
      simulationEmailAcknowledged: input.simulationEmailAcknowledged,
      typedConfirmationPhrase: input.typedConfirmationPhrase,
    });
    if (!emailGate.ok) {
      return { ok: false, error: emailGate.error };
    }

    const inviteUrl = joinInviteUrl(token);
    const displayName = String(row.display_name ?? "").trim();
    const inviterLabel = inviter
      ? await resolveInviterLabelForPoolInvite(supabase, pid, inviter)
      : "Your pool organizer";
    const mail = await sendParticipantInviteEmail({
      to: email,
      poolName: poolMeta.name,
      displayName,
      inviteUrl,
      inviterLabel,
    });

    if (mail.ok) {
      logSimulationPoolEmailSuccess({
        action: "participant_invite_email",
        userId: inviter?.id ?? null,
        userEmail: inviter?.email,
        poolId: pid,
        poolName: poolMeta.name,
        isSimulationPool: poolMeta.isSimulation,
        overrideEnabled: isSimulationEmailOverrideEnabledInProduction(),
        recipientCount: 1,
      });
    }

    revalidateParticipants(pid);

    const { data: fresh, error: freshErr } = await supabase
      .from("participants")
      .select(
        "id, pool_id, display_name, email, is_paid, paid_at, user_id, invite_pending, invite_last_sent_at",
      )
      .eq("id", participantId)
      .eq("pool_id", pid)
      .single();

    if (freshErr) return { ok: false, error: freshErr.message };

    let emailMessage: string | undefined;
    if (!mail.ok) {
      emailMessage = mail.skipped
        ? "Invite link is ready — email is not configured, so copy the link below."
        : mail.error;
    }

    return {
      ok: true,
      participant: mapParticipantRow(fresh as ParticipantRow),
      inviteUrl,
      emailSent: mail.ok,
      emailMessage,
    };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

export async function updateParticipantAction(input: {
  poolId: string;
  id: string;
  displayName: string;
  email: string;
  paid: boolean;
}): Promise<ParticipantActionResult> {
  try {
    const supabase = await createClient();
    const gate = await assertCanManagePool(supabase, input.poolId);
    if (!gate.ok) return { ok: false, error: gate.error };

    const pid = input.poolId.trim();

    const { data: existing, error: fetchErr } = await supabase
      .from("participants")
      .select("is_paid, paid_at")
      .eq("id", input.id)
      .eq("pool_id", pid)
      .maybeSingle();

    if (fetchErr) return { ok: false, error: fetchErr.message };
    if (!existing) return { ok: false, error: "Participant not found." };

    const wasPaid = existing.is_paid;
    let paidAt: string | null;
    if (!input.paid) {
      paidAt = null;
    } else if (!wasPaid) {
      paidAt = paidAtForInsert(true);
    } else {
      paidAt = existing.paid_at;
    }

    const { data, error } = await supabase
      .from("participants")
      .update({
        display_name: input.displayName.trim(),
        email: input.email.trim(),
        is_paid: input.paid,
        paid_at: paidAt,
      })
      .eq("id", input.id)
      .eq("pool_id", pid)
      .select(
        "id, pool_id, display_name, email, is_paid, paid_at, user_id, invite_pending, invite_last_sent_at",
      )
      .single();

    if (error) return { ok: false, error: error.message };
    revalidateParticipants(pid);
    return {
      ok: true,
      participant: mapParticipantRow(data as ParticipantRow),
    };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

/**
 * Removes a participant row for one pool only. Does not delete auth.users or
 * pool_admins rows; predictions and points_ledger for this pool cascade via FK.
 */
export async function removeParticipantFromPoolAction(input: {
  poolId: string;
  participantId: string;
}): Promise<ParticipantActionResult> {
  try {
    const supabase = await createClient();
    const gate = await assertCanManagePool(supabase, input.poolId);
    if (!gate.ok) return { ok: false, error: gate.error };

    const pid = input.poolId.trim();
    const participantId = input.participantId.trim();
    if (!participantId) {
      return { ok: false, error: "Participant is required." };
    }

    const {
      data: { user: actor },
    } = await supabase.auth.getUser();

    const { data: row, error: fetchErr } = await supabase
      .from("participants")
      .select("id, pool_id, display_name, email, user_id, is_paid")
      .eq("id", participantId)
      .eq("pool_id", pid)
      .maybeSingle();

    if (fetchErr) return { ok: false, error: fetchErr.message };
    if (!row) {
      console.info("[removeParticipantFromPool] already removed", {
        poolId: pid,
        participantId,
        actorUserId: actor?.id ?? null,
      });
      revalidateParticipants(pid);
      return {
        ok: true,
        alreadyRemoved: true,
        message: REMOVE_PARTICIPANT_ALREADY_GONE_MESSAGE,
      };
    }

    const displayName = String(row.display_name ?? "").trim();
    const email = String(row.email ?? "").trim();
    const linkedUserId = row.user_id as string | null;

    const { count: predictionCount, error: predCountErr } = await supabase
      .from("predictions")
      .select("id", { count: "exact", head: true })
      .eq("pool_id", pid)
      .eq("participant_id", participantId);
    if (predCountErr) return { ok: false, error: predCountErr.message };

    const { error: delErr } = await supabase
      .from("participants")
      .delete()
      .eq("id", participantId)
      .eq("pool_id", pid);

    if (delErr) return { ok: false, error: delErr.message };

    console.info("[removeParticipantFromPool] removed", {
      poolId: pid,
      participantId,
      displayName,
      email,
      linkedUserId,
      actorUserId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      wasPaid: Boolean(row.is_paid),
      predictionCount: predictionCount ?? 0,
    });

    revalidateParticipants(pid);

    return {
      ok: true,
      removedDisplayName: displayName || email || "Participant",
      message: formatRemoveParticipantSuccessMessage(displayName || email),
    };
  } catch (e) {
    console.error("[removeParticipantFromPool] unexpected", e);
    return { ok: false, error: messageFromUnknown(e) };
  }
}

/** @deprecated Prefer `removeParticipantFromPoolAction`. */
export async function deleteParticipantAction(input: {
  poolId: string;
  id: string;
}): Promise<ParticipantActionResult> {
  return removeParticipantFromPoolAction({
    poolId: input.poolId,
    participantId: input.id,
  });
}

export async function moveWorldCupParticipantToPoolAction(input: {
  sourcePoolId: string;
  destinationPoolId: string;
  participantId: string;
}): Promise<ParticipantActionResult> {
  try {
    const supabase = await createClient();
    const sourcePoolId = input.sourcePoolId.trim();
    const destinationPoolId = input.destinationPoolId.trim();
    const participantId = input.participantId.trim();

    if (!sourcePoolId || !destinationPoolId || !participantId) {
      return { ok: false, error: "Source pool, destination pool, and participant are required." };
    }

    if (sourcePoolId === destinationPoolId) {
      return { ok: false, error: "Choose a different destination pool." };
    }

    const sourceGate = await assertCanDirectlyManagePool(supabase, sourcePoolId);
    if (!sourceGate.ok) return { ok: false, error: sourceGate.error };

    const destinationGate = await assertCanDirectlyManagePool(supabase, destinationPoolId);
    if (!destinationGate.ok) return { ok: false, error: destinationGate.error };

    const {
      data: { user: actor },
    } = await supabase.auth.getUser();

    const { data: participantRow, error: participantErr } = await supabase
      .from("participants")
      .select("id, pool_id, display_name, email, user_id")
      .eq("id", participantId)
      .eq("pool_id", sourcePoolId)
      .maybeSingle();

    if (participantErr) return { ok: false, error: participantErr.message };
    if (!participantRow) {
      return { ok: false, error: "Participant not found in this pool." };
    }

    const managedPoolsResult = await fetchDirectlyManagedPoolsForCurrentUser(supabase);
    if (managedPoolsResult.error) {
      return { ok: false, error: managedPoolsResult.error };
    }

    const managedPools = managedPoolsResult.data ?? [];
    const directAdminAccess = validateDirectPoolAdminMoveAccess(
      sourcePoolId,
      destinationPoolId,
      managedPools.map((pool) => pool.id),
    );
    if (!directAdminAccess.ok) {
      return { ok: false, error: directAdminAccess.error };
    }

    const sourceManaged = managedPools.find((pool) => pool.id === sourcePoolId);
    const destinationManaged = managedPools.find((pool) => pool.id === destinationPoolId);

    if (!sourceManaged || !destinationManaged) {
      return { ok: false, error: "You do not have access to one of these pools." };
    }

    const sourceScope = worldCupPoolMoveScopeFromManagedPool(sourceManaged);
    const destinationScope = worldCupPoolMoveScopeFromManagedPool(destinationManaged);
    if (!areWorldCupPoolsCompatibleForMove(sourceScope, destinationScope)) {
      return { ok: false, error: "These pools cannot be used together for a move." };
    }

    const { data: destinationParticipants, error: destinationParticipantsErr } =
      await supabase
        .from("participants")
        .select("user_id, email, display_name")
        .eq("pool_id", destinationPoolId);

    if (destinationParticipantsErr) {
      return { ok: false, error: destinationParticipantsErr.message };
    }

    if (
      participantWouldDuplicateInDestinationPool(
        {
          userId: (participantRow.user_id as string | null) ?? null,
          email: String(participantRow.email ?? ""),
          displayName: String(participantRow.display_name ?? ""),
        },
        (destinationParticipants ?? []).map((row) => ({
          userId: (row.user_id as string | null) ?? null,
          email: String(row.email ?? ""),
          displayName: String(row.display_name ?? ""),
        })),
      )
    ) {
      return { ok: false, error: MOVE_PARTICIPANT_DUPLICATE_BLOCKED_MESSAGE };
    }

    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "move_world_cup_participant_to_pool",
      {
        p_participant_id: participantId,
        p_source_pool_id: sourcePoolId,
        p_destination_pool_id: destinationPoolId,
      },
    );

    if (rpcErr) {
      return { ok: false, error: mapMoveWorldCupParticipantRpcError(rpcErr.message) };
    }

    const payload = (rpcData ?? {}) as {
      display_name?: string;
      destination_pool_name?: string;
    };
    const displayName = String(payload.display_name ?? participantRow.display_name ?? "").trim();
    const destinationPoolName = String(
      payload.destination_pool_name ?? destinationManaged.name ?? "",
    ).trim();

    const editionScope = await fetchPoolEditionScope(supabase, sourcePoolId);
    for (const poolId of poolsToRecomputeAfterParticipantMove(
      sourcePoolId,
      destinationPoolId,
    )) {
      const ledgerResult = await recomputePoolLedgerForPool(poolId, {
        ledgerTrigger: "admin_manual_recompute",
      });
      if (ledgerResult.error) {
        console.error("[moveWorldCupParticipantToPool] ledger recompute failed", {
          poolId,
          error: ledgerResult.error,
        });
      }
    }

    revalidateParticipants(sourcePoolId);
    revalidateParticipants(destinationPoolId);

    logAdminRiskAction({
      action: "participant_pool_move",
      userId: actor?.id ?? null,
      userEmail: actor?.email,
      poolId: sourcePoolId,
      poolName: sourceManaged.name,
      editionId: editionScope.ok ? editionScope.edition.id : null,
      editionCode: editionScope.ok ? editionScope.edition.code : null,
      isSimulation: sourceManaged.is_simulation,
      affectedParticipantCount: 1,
      detail: `moved participant ${participantId} to pool ${destinationPoolId}`,
    });

    return {
      ok: true,
      message: formatMoveParticipantSuccessMessage(displayName, destinationPoolName),
      removedDisplayName: displayName,
    };
  } catch (e) {
    console.error("[moveWorldCupParticipantToPool] unexpected", e);
    return { ok: false, error: messageFromUnknown(e) };
  }
}
