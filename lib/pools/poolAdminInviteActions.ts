"use server";

import { assertCanManagePoolAdmins } from "@/lib/admin/assertCanManagePoolAdmins";
import {
  gateSimulationPoolOutboundEmail,
  logSimulationPoolEmailSuccess,
} from "@/lib/admin/enforceSimulationPoolEmailForAction";
import { isSimulationEmailOverrideEnabledInProduction } from "@/lib/admin/simulationPoolEmailPolicy";
import { revalidatePoolAdminPaths } from "@/lib/admin/revalidatePoolAdminPaths";
import { createClient } from "@/lib/supabase/server";
import { logPoolAdminAuditEvent } from "@/lib/pools/poolAdminAuditLog";
import { normalizePoolAdminInviteEmail } from "@/lib/pools/normalizePoolAdminInviteEmail";
import { sendPoolAdminInviteEmail } from "@/lib/pools/sendPoolAdminInviteEmail";
import type { PoolAdminActionResult } from "@/lib/pools/poolAdminMembershipActions";

function messageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

function revalidate(poolId: string) {
  revalidatePoolAdminPaths(poolId);
}

async function loadPoolMeta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  poolId: string,
): Promise<{ name: string; isSimulation: boolean }> {
  const { data } = await supabase
    .from("pools")
    .select("name, is_simulation")
    .eq("id", poolId)
    .maybeSingle();
  return {
    name: (data?.name as string | undefined)?.trim() || "Pool",
    isSimulation: Boolean(data?.is_simulation),
  };
}

export async function revokePoolAdminInviteAction(input: {
  poolId: string;
  inviteId: string;
}): Promise<PoolAdminActionResult> {
  try {
    const supabase = await createClient();
    const gate = await assertCanManagePoolAdmins(supabase, input.poolId);
    if (!gate.ok) return { ok: false, error: gate.error };

    const poolId = input.poolId.trim();
    const inviteId = input.inviteId.trim();

    const { data: row, error: fetchErr } = await supabase
      .from("pool_admin_invites")
      .select("id, invited_email, revoked_at, claimed_at")
      .eq("id", inviteId)
      .eq("pool_id", poolId)
      .maybeSingle();
    if (fetchErr) return { ok: false, error: fetchErr.message };
    if (!row) return { ok: false, error: "Invite not found." };

    if (row.claimed_at) {
      return { ok: false, error: "This invite was already accepted." };
    }
    if (row.revoked_at) {
      revalidate(poolId);
      return { ok: true, message: "Invite was already revoked." };
    }

    const { error: upErr } = await supabase
      .from("pool_admin_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", inviteId)
      .eq("pool_id", poolId);
    if (upErr) return { ok: false, error: upErr.message };

    const audit = await logPoolAdminAuditEvent(supabase, {
      poolId,
      targetEmail: row.invited_email as string,
      action: "revoke_invite",
      metadata: { invite_id: inviteId },
    });
    if (!audit.ok) console.error("[revokePoolAdminInviteAction audit]", audit.error);

    revalidate(poolId);
    return { ok: true, message: "Invite revoked." };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

export async function resendPoolAdminInviteAction(input: {
  poolId: string;
  inviteId: string;
  productionAcknowledged?: boolean;
  simulationEmailAcknowledged?: boolean;
  typedConfirmationPhrase?: string;
}): Promise<PoolAdminActionResult> {
  try {
    const supabase = await createClient();
    const gate = await assertCanManagePoolAdmins(supabase, input.poolId);
    if (!gate.ok) return { ok: false, error: gate.error };

    const poolId = input.poolId.trim();
    const inviteId = input.inviteId.trim();

    const { data: row, error: fetchErr } = await supabase
      .from("pool_admin_invites")
      .select("id, invited_email, role, revoked_at, claimed_at")
      .eq("id", inviteId)
      .eq("pool_id", poolId)
      .maybeSingle();
    if (fetchErr) return { ok: false, error: fetchErr.message };
    if (!row) return { ok: false, error: "Invite not found." };

    if (row.claimed_at) {
      return { ok: false, error: "This invite was already accepted." };
    }
    if (row.revoked_at) {
      return { ok: false, error: "This invite was revoked." };
    }

    const email = row.invited_email as string;
    const role = row.role === "owner" ? "owner" : "admin";
    const poolMeta = await loadPoolMeta(supabase, poolId);
    const {
      data: { user: actor },
    } = await supabase.auth.getUser();

    const emailGate = await gateSimulationPoolOutboundEmail({
      supabase,
      poolId,
      poolName: poolMeta.name,
      action: "pool_admin_invite_email",
      userId: actor?.id ?? null,
      userEmail: actor?.email,
      recipientCount: 1,
      productionAcknowledged: input.productionAcknowledged,
      simulationEmailAcknowledged: input.simulationEmailAcknowledged,
      typedConfirmationPhrase: input.typedConfirmationPhrase,
    });
    if (!emailGate.ok) {
      return { ok: false, error: emailGate.error };
    }

    const send = await sendPoolAdminInviteEmail({
      toEmail: email,
      poolName: poolMeta.name,
      role,
    });

    const { error: upErr } = await supabase
      .from("pool_admin_invites")
      .update({ invite_last_sent_at: new Date().toISOString() })
      .eq("id", inviteId)
      .eq("pool_id", poolId);
    if (upErr) return { ok: false, error: upErr.message };

    const audit = await logPoolAdminAuditEvent(supabase, {
      poolId,
      targetEmail: email,
      action: "resend_invite",
      metadata: {
        invite_id: inviteId,
        email_sent: send.ok,
        email_skipped: send.ok === false && "skipped" in send && send.skipped,
      },
    });
    if (!audit.ok) console.error("[resendPoolAdminInviteAction audit]", audit.error);

    revalidate(poolId);

    if (!send.ok) {
      if ("skipped" in send && send.skipped) {
        return {
          ok: true,
          message:
            "Invite updated (email is not configured — copy the pool link manually or set RESEND_API_KEY).",
        };
      }
      return {
        ok: true,
        message: `Invite noted; email failed: ${send.error}`,
      };
    }

    logSimulationPoolEmailSuccess({
      action: "pool_admin_invite_email",
      userId: actor?.id ?? null,
      userEmail: actor?.email,
      poolId,
      poolName: poolMeta.name,
      isSimulationPool: poolMeta.isSimulation,
      overrideEnabled: isSimulationEmailOverrideEnabledInProduction(),
      recipientCount: 1,
    });

    return { ok: true, message: "Invitation email sent." };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}
