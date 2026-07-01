"use server";

import { assertCanManagePool } from "@/lib/admin/assertCanManagePool";
import { logAdminRiskAction } from "@/lib/admin/adminRiskAuditLog";
import {
  applyKnockoutPickCorrection,
  KNOCKOUT_PICK_CORRECTION_ALREADY_MATCHES_SAVED,
  resolveKnockoutPickCorrectionMatch,
  resolveKnockoutPickCorrectionTeamId,
  summarizeKnockoutPickCorrectionDryRun,
  summarizeKnockoutPickStatusAuditChanges,
  validateKnockoutPickCorrectionReason,
} from "@/lib/admin/knockoutPickCorrection";
import { logKnockoutPickCorrectionAudit } from "@/lib/admin/knockoutPickCorrectionAudit";
import { createClient } from "@/lib/supabase/server";
import { recomputePoolLedgerForPool } from "@/lib/scoring/recomputePoolLedger";
import {
  buildAllParticipantPickDrafts,
  participantBonusKeysForPool,
} from "../../../../lib/predictions/buildParticipantPickDrafts";
import { applyParticipantPickSlots } from "../../../../lib/predictions/applyParticipantPickSlots";
import { validateKnockoutPickSaveInput } from "../../../../lib/predictions/validateKnockoutPickPayload";
import {
  savePicksSuccess,
  savePicksUnexpectedError,
  savePicksValidationError,
} from "../../../../lib/predictions/participantPicksSaveFlow";
import { fetchOfficialRoundOf32Complete } from "../../../../lib/tournament/fetchOfficialRoundOf32Complete";
import { fetchPublicTournamentProgress } from "../../../../lib/tournament/fetchPublicTournamentProgress";
import { mapTeamRow, mapTournamentStageRow } from "../../../../lib/results/mapRows";
import { TEAM_TABLE_SELECT } from "../../../../lib/teams/teamDbSelect";
import { fetchGroupTeamCountryCodesByLetter } from "../../../../lib/tournament/fetchGroupTeamCountryCodesByLetter";
import { mapPredictionRow } from "../../../../src/lib/scoring/mapSupabaseRows";
import type { TournamentStage } from "../../../../src/types/domain";
import { revalidatePath } from "next/cache";
import type {
  ParticipantPickSlotPayload,
  SaveKnockoutPicksResult,
} from "../../../../types/knockoutPicksSave";

function messageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

/**
 * Use from pool-scoped admin UI with `.bind(null, poolId)` so the client wizard
 * receives a serializable server action (do not wrap the save action in an
 * inline arrow in a Server Component).
 */
export async function saveParticipantKnockoutPicksForPoolAction(
  poolId: string,
  input: {
    participantId: string;
    slots: ParticipantPickSlotPayload[];
  },
): Promise<SaveKnockoutPicksResult> {
  return saveParticipantKnockoutPicksAction({
    poolId,
    participantId: input.participantId,
    slots: input.slots,
  });
}

export async function saveParticipantKnockoutPicksAction(input: {
  poolId: string;
  participantId: string;
  slots: ParticipantPickSlotPayload[];
}): Promise<SaveKnockoutPicksResult> {
  const invalid = validateKnockoutPickSaveInput({
    participantId: input.participantId,
    slots: input.slots,
  });
  if (invalid) return invalid;

  try {
    const supabase = await createClient();
    const gate = await assertCanManagePool(supabase, input.poolId);
    if (!gate.ok) return savePicksUnexpectedError(gate.error);

    const poolId = input.poolId.trim();

    const { data: participant, error: parErr } = await supabase
      .from("participants")
      .select("id")
      .eq("id", input.participantId)
      .eq("pool_id", poolId)
      .maybeSingle();

    if (parErr) return savePicksUnexpectedError(parErr.message);
    if (!participant) {
      return savePicksUnexpectedError("Participant not found in this pool.");
    }

    const applied = await applyParticipantPickSlots(supabase, {
      poolId,
      participantId: input.participantId,
      slots: input.slots,
    });
    if (!applied.ok) return savePicksUnexpectedError(applied.error);

    const ledger = await recomputePoolLedgerForPool(poolId, {
      ledgerTrigger: "admin_pick_edit",
    });
    if (ledger.error) {
      return savePicksSuccess(
        `Picks saved, but the leaderboard could not be updated: ${ledger.error}`,
      );
    }

    revalidatePath(`/admin/pools/${poolId}/picks`);
    revalidatePath(`/participant/${input.participantId}`);

    return savePicksSuccess();
  } catch (e) {
    return savePicksUnexpectedError(messageFromUnknown(e));
  }
}

const CORRECTION_STAGE_CODES = [
  "group",
  "round_of_32",
  "round_of_16",
  "quarterfinal",
  "semifinal",
  "final",
] as const;

/**
 * Admin-only post-kickoff correction for a single locked knockout match pick.
 * Bound with `.bind(null, poolId)` from the admin pick editor.
 */
export async function correctParticipantKnockoutPickForPoolAction(
  poolId: string,
  input: {
    participantId: string;
    matchCode: string;
    teamId: string;
    reason: string;
  },
): Promise<SaveKnockoutPicksResult> {
  return correctParticipantKnockoutPickAction({
    poolId,
    participantId: input.participantId,
    matchCode: input.matchCode,
    teamId: input.teamId,
    reason: input.reason,
  });
}

export async function correctParticipantKnockoutPickAction(input: {
  poolId: string;
  participantId: string;
  matchCode: string;
  teamId: string;
  reason: string;
}): Promise<SaveKnockoutPicksResult> {
  const reasonErr = validateKnockoutPickCorrectionReason(input.reason);
  if (reasonErr) return savePicksValidationError(reasonErr);

  try {
    const supabase = await createClient();
    const gate = await assertCanManagePool(supabase, input.poolId);
    if (!gate.ok) return savePicksUnexpectedError(gate.error);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const poolId = input.poolId.trim();
    const participantId = input.participantId.trim();

    const { data: participant, error: parErr } = await supabase
      .from("participants")
      .select("id")
      .eq("id", participantId)
      .eq("pool_id", poolId)
      .maybeSingle();
    if (parErr) return savePicksUnexpectedError(parErr.message);
    if (!participant) {
      return savePicksUnexpectedError("Participant not found in this pool.");
    }

    const { data: poolRow, error: poolErr } = await supabase
      .from("pools")
      .select("tournament_edition_id")
      .eq("id", poolId)
      .maybeSingle();
    if (poolErr) return savePicksUnexpectedError(poolErr.message);
    if (!poolRow?.tournament_edition_id) {
      return savePicksUnexpectedError("Pool tournament edition is missing.");
    }

    const [
      { data: teamRows, error: teamErr },
      { data: stageRows, error: stageErr },
      { data: predRows, error: predErr },
      { data: scoringRows, error: scoreErr },
      groupMap,
      tournamentFetch,
    ] = await Promise.all([
      supabase.from("teams").select(TEAM_TABLE_SELECT).order("name", {
        ascending: true,
      }),
      supabase
        .from("tournament_stages")
        .select("id, code, label, sort_order, starts_at, ends_at, created_at, updated_at")
        .in("code", [...CORRECTION_STAGE_CODES])
        .order("sort_order", { ascending: true }),
      supabase
        .from("predictions")
        .select(
          "id, pool_id, participant_id, prediction_kind, team_id, tournament_stage_id, group_code, slot_key, bonus_key, value_text, created_at, updated_at",
        )
        .eq("pool_id", poolId)
        .eq("participant_id", participantId),
      supabase
        .from("scoring_rules")
        .select("bonus_key")
        .eq("pool_id", poolId)
        .eq("prediction_kind", "bonus_pick")
        .order("bonus_key", { ascending: true }),
      fetchGroupTeamCountryCodesByLetter(supabase),
      fetchPublicTournamentProgress(),
    ]);

    if (teamErr) return savePicksUnexpectedError(teamErr.message);
    if (stageErr) return savePicksUnexpectedError(stageErr.message);
    if (predErr) return savePicksUnexpectedError(predErr.message);
    if (scoreErr) return savePicksUnexpectedError(scoreErr.message);
    if (tournamentFetch.error) {
      return savePicksUnexpectedError(tournamentFetch.error);
    }

    const teams = (teamRows ?? []).map(mapTeamRow);
    const stages = (stageRows ?? []).map(mapTournamentStageRow);
    type PredRow = Parameters<typeof mapPredictionRow>[0];
    const predictions = (predRows ?? []).map((r) =>
      mapPredictionRow(r as PredRow),
    );
    const bonusKeysOrdered = participantBonusKeysForPool(
      (scoringRows ?? [])
        .map((r) => r.bonus_key as string | null)
        .filter((k): k is string => Boolean(k && k.trim())),
    );
    const stageByCode = Object.fromEntries(
      stages.map((s) => [s.code, s]),
    ) as Partial<Record<TournamentStage["code"], TournamentStage>>;
    const initialSlots = buildAllParticipantPickDrafts({
      stageByCode,
      predictions,
      participantId,
      bonusKeys: bonusKeysOrdered,
      teams,
      groupTeamCountryCodesByLetter: groupMap,
    });

    const r32Stage = stages.find((s) => s.code === "round_of_32");
    const fullRoundOf32Official = r32Stage
      ? await fetchOfficialRoundOf32Complete(
          supabase,
          r32Stage.id,
          poolRow.tournament_edition_id as string,
        )
      : true;
    const tournamentMatches = tournamentFetch.data?.matches ?? [];

    const resolved = resolveKnockoutPickCorrectionMatch({
      matchCode: input.matchCode,
      slots: initialSlots,
      teams,
      tournamentMatches,
      fullRoundOf32Official,
    });
    if ("error" in resolved) return savePicksValidationError(resolved.error);

    const teamResolved = resolveKnockoutPickCorrectionTeamId({
      teamId: input.teamId,
      teams,
      allowedTeamIds: resolved.match.allowedTeamIds,
    });
    if ("error" in teamResolved) return savePicksValidationError(teamResolved.error);

    const savedWinnerId = resolved.match.oldTeamId.trim();
    if (savedWinnerId && savedWinnerId === teamResolved.teamId) {
      return savePicksValidationError(KNOCKOUT_PICK_CORRECTION_ALREADY_MATCHES_SAVED);
    }

    const applied = applyKnockoutPickCorrection({
      slots: initialSlots,
      match: resolved.match,
      newTeamId: teamResolved.teamId,
      teams,
      tournamentMatches,
      fullRoundOf32Official,
    });

    if (applied.writePayloads.length === 0) {
      return savePicksValidationError("No pick changes were produced.");
    }

    const writeResult = await applyParticipantPickSlots(supabase, {
      poolId,
      participantId,
      slots: applied.writePayloads,
    });
    if (!writeResult.ok) return savePicksUnexpectedError(writeResult.error);

    const dryRunSummary = summarizeKnockoutPickCorrectionDryRun({
      match: resolved.match,
      newTeamId: teamResolved.teamId,
      teams,
      applyResult: applied,
    });
    const statusAudit = summarizeKnockoutPickStatusAuditChanges(
      initialSlots,
      applied.slots,
    );

    const audit = await logKnockoutPickCorrectionAudit(supabase, {
      poolId,
      participantId,
      matchCode: resolved.match.matchCode,
      oldTeamId: resolved.match.oldTeamId || null,
      newTeamId: teamResolved.teamId,
      oldTeamCountryCode: resolved.match.oldTeamId
        ? teams.find((t) => t.id === resolved.match.oldTeamId)?.countryCode ?? null
        : null,
      newTeamCountryCode: teamResolved.countryCode,
      reason: input.reason.trim(),
      clearedPickCount: applied.cleared.length,
      clearedSummary: dryRunSummary.clearedLabels,
      markedOutPicks: statusAudit.markedOut,
      restoredActivePicks: statusAudit.restoredActive,
    });
    if (!audit.ok) {
      return savePicksSuccess(
        `Correction saved, but audit logging failed: ${audit.error}`,
      );
    }

    logAdminRiskAction({
      action: "pool_recompute",
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      poolId,
      affectedParticipantCount: 1,
      detail: `admin_knockout_pick_correction ${resolved.match.matchCode}`,
    });

    const ledger = await recomputePoolLedgerForPool(poolId, {
      ledgerTrigger: "admin_pick_edit",
    });
    if (ledger.error) {
      return savePicksSuccess(
        `Correction saved, but the leaderboard could not be updated: ${ledger.error}`,
      );
    }

    revalidatePath(`/admin/pools/${poolId}/picks`);
    revalidatePath(`/participant/${participantId}`);

    const clearedNote =
      applied.cleared.length > 0
        ? ` Cleared ${applied.cleared.length} downstream pick(s) that no longer fit.`
        : "";
    return savePicksSuccess(
      `Recorded admin correction for ${resolved.match.matchCode}.${clearedNote}`,
    );
  } catch (e) {
    return savePicksUnexpectedError(messageFromUnknown(e));
  }
}
