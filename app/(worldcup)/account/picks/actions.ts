"use server";

import { createClient } from "@/lib/supabase/server";
import { isParticipantPicksCompleteForParticipant } from "../../../../lib/communications/picksCompleteness";
import { ensurePoolInsightsForPool } from "../../../../lib/poolActivity/ensurePoolInsights";
import { ensurePoolMilestonesForPool } from "../../../../lib/poolActivity/ensurePoolMilestones";
import { insertPoolActivityRow } from "../../../../lib/poolActivity/insertPoolActivity";
import { fingerprintPredictionsForParticipant } from "../../../../lib/poolActivity/predictionsFingerprint";
import { applyParticipantPickSlots } from "../../../../lib/predictions/applyParticipantPickSlots";
import { validateFrozenPicksUnchangedWhenPoolLocked } from "../../../../lib/predictions/frozenPreBracketPickKinds";
import {
  buildPostSaveSuccessResult,
  savePicksUnexpectedError,
  savePicksValidationError,
} from "../../../../lib/predictions/participantPicksSaveFlow";
import { logPicksSaveStep } from "../../../../lib/predictions/picksSaveLogging";
import { safeRevalidateParticipantPickPaths } from "../../../../lib/predictions/revalidateParticipantPickPaths";
import { validateKnockoutPickSaveInput } from "../../../../lib/predictions/validateKnockoutPickPayload";
import { applyGradualKnockoutPickSaveGuards } from "../../../../lib/predictions/validateGradualKnockoutPickSave";
import { fetchOfficialRoundOf32Complete } from "../../../../lib/tournament/fetchOfficialRoundOf32Complete";
import { fetchPublicTournamentProgress } from "../../../../lib/tournament/fetchPublicTournamentProgress";
import { mapTeamRow } from "../../../../lib/results/mapRows";
import { TEAM_TABLE_SELECT } from "../../../../lib/teams/teamDbSelect";
import { mapPredictionRow } from "../../../../src/lib/scoring/mapSupabaseRows";
import { recomputePoolLedgerForPoolAsTrustedServer } from "../../../../src/lib/scoring/recomputePoolLedger";
import type {
  ParticipantPickSlotPayload,
  SaveKnockoutPicksResult,
} from "../../../../types/knockoutPicksSave";

function messageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

function poolIsLocked(lockAt: string | null): boolean {
  if (lockAt == null || lockAt === "") return false;
  const t = new Date(lockAt).getTime();
  if (Number.isNaN(t)) return false;
  return t <= Date.now();
}

/**
 * Saves knockout picks for the signed-in user's participant row only (RLS on `predictions`).
 * Verifies ownership and pool lock server-side, then recomputes that pool's `points_ledger`
 * via the trusted service-role path so the public leaderboard matches persisted scoring.
 */
export async function saveMyKnockoutPicksAction(input: {
  participantId: string;
  slots: ParticipantPickSlotPayload[];
}): Promise<SaveKnockoutPicksResult> {
  const invalid = validateKnockoutPickSaveInput(input);
  if (invalid) return invalid;

  const logCtx = { participantId: input.participantId };
  logPicksSaveStep("save_started", logCtx);

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return savePicksUnexpectedError("You must be signed in to save picks.");
    }

    const ctx = { ...logCtx, userId: user.id };
    const { data: row, error: parErr } = await supabase
      .from("participants")
      .select("id, pool_id, display_name, picks_first_submitted_at")
      .eq("id", input.participantId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (parErr) {
      logPicksSaveStep("participant_lookup_failed", { ...ctx, error: parErr });
      return savePicksUnexpectedError(parErr.message);
    }
    if (!row) {
      return savePicksUnexpectedError(
        "That profile was not found or is not linked to your account.",
      );
    }

    const poolIdStr = row.pool_id as string;
    const fullCtx = { ...ctx, poolId: poolIdStr };

    const { data: poolRow, error: poolErr } = await supabase
      .from("pools")
      .select("lock_at, tournament_edition_id")
      .eq("id", poolIdStr)
      .maybeSingle();

    if (poolErr) {
      logPicksSaveStep("pool_lookup_failed", { ...fullCtx, error: poolErr });
      return savePicksUnexpectedError(poolErr.message);
    }
    const poolLockedNow = Boolean(poolRow && poolIsLocked(poolRow.lock_at));

    if (poolLockedNow) {
      const { data: predData, error: predFetchErr } = await supabase
        .from("predictions")
        .select(
          "id, pool_id, participant_id, prediction_kind, team_id, tournament_stage_id, group_code, slot_key, bonus_key, value_text, created_at, updated_at",
        )
        .eq("pool_id", poolIdStr)
        .eq("participant_id", input.participantId);
      if (predFetchErr) {
        logPicksSaveStep("locked_predictions_fetch_failed", {
          ...fullCtx,
          error: predFetchErr,
        });
        return savePicksUnexpectedError(predFetchErr.message);
      }
      type PredRow = Parameters<typeof mapPredictionRow>[0];
      const existing = (predData ?? []).map((r) =>
        mapPredictionRow(r as PredRow),
      );
      const freezeErr = validateFrozenPicksUnchangedWhenPoolLocked(
        existing,
        input.slots,
      );
      if (freezeErr) {
        return savePicksValidationError(freezeErr);
      }
    }

    let slots = input.slots;
    const { data: r32StageRow, error: r32StageErr } = await supabase
      .from("tournament_stages")
      .select("id")
      .eq("code", "round_of_32")
      .maybeSingle();
    if (r32StageErr) {
      logPicksSaveStep("round_of_32_stage_lookup_failed", {
        ...fullCtx,
        error: r32StageErr,
      });
      return savePicksUnexpectedError(r32StageErr.message);
    }

    let fullRoundOf32Official = true;
    if (r32StageRow?.id && poolRow?.tournament_edition_id) {
      fullRoundOf32Official = await fetchOfficialRoundOf32Complete(
        supabase,
        r32StageRow.id as string,
        poolRow.tournament_edition_id as string,
      );
    } else if (r32StageRow?.id) {
      return savePicksUnexpectedError("Pool tournament edition is missing.");
    }

    const { data: predBeforeRows, error: predBeforeErr } = await supabase
      .from("predictions")
      .select(
        "id, pool_id, participant_id, prediction_kind, team_id, tournament_stage_id, group_code, slot_key, bonus_key, value_text, created_at, updated_at",
      )
      .eq("pool_id", poolIdStr)
      .eq("participant_id", input.participantId);
    if (predBeforeErr) {
      logPicksSaveStep("predictions_before_fetch_failed", {
        ...fullCtx,
        error: predBeforeErr,
      });
      return savePicksUnexpectedError(predBeforeErr.message);
    }
    type PredRow = Parameters<typeof mapPredictionRow>[0];
    const predsBefore = (predBeforeRows ?? []).map((r) =>
      mapPredictionRow(r as PredRow),
    );

    if (!fullRoundOf32Official) {
      const [{ data: teamRows, error: teamErr }, tournamentFetch] =
        await Promise.all([
          supabase.from("teams").select(TEAM_TABLE_SELECT),
          fetchPublicTournamentProgress(),
        ]);
      if (teamErr) {
        logPicksSaveStep("teams_fetch_failed", { ...fullCtx, error: teamErr });
        return savePicksUnexpectedError(teamErr.message);
      }
      if (tournamentFetch.error) {
        logPicksSaveStep("tournament_matches_fetch_failed", {
          ...fullCtx,
          error: tournamentFetch.error,
        });
        return savePicksUnexpectedError(tournamentFetch.error);
      }
      const teams = (teamRows ?? []).map(mapTeamRow);
      const guarded = applyGradualKnockoutPickSaveGuards({
        incoming: slots,
        existing: predsBefore,
        teams,
        matches: tournamentFetch.data?.matches ?? [],
        fullRoundOf32Official,
      });
      if (guarded.error) {
        return savePicksValidationError(guarded.error);
      }
      slots = guarded.slots;
    }

    const fpBefore = fingerprintPredictionsForParticipant(
      predsBefore,
      input.participantId,
    );
    const completeBefore = await isParticipantPicksCompleteForParticipant(
      supabase,
      poolIdStr,
      input.participantId,
    );
    const hadFirstSubmittedAt = Boolean(row.picks_first_submitted_at);

    logPicksSaveStep("db_write_started", fullCtx);
    const applied = await applyParticipantPickSlots(supabase, {
      poolId: poolIdStr,
      participantId: input.participantId,
      slots,
    });
    if (!applied.ok) {
      logPicksSaveStep("db_write_failed", { ...fullCtx, error: applied.error });
      return savePicksUnexpectedError(applied.error);
    }
    logPicksSaveStep("db_write_completed", fullCtx);

    const completeAfter = await isParticipantPicksCompleteForParticipant(
      supabase,
      poolIdStr,
      input.participantId,
    );
    const { data: predAfterRows, error: predAfterErr } = await supabase
      .from("predictions")
      .select(
        "id, pool_id, participant_id, prediction_kind, team_id, tournament_stage_id, group_code, slot_key, bonus_key, value_text, created_at, updated_at",
      )
      .eq("pool_id", poolIdStr)
      .eq("participant_id", input.participantId);
    if (predAfterErr) {
      logPicksSaveStep("predictions_after_fetch_failed", {
        ...fullCtx,
        error: predAfterErr,
      });
      return savePicksUnexpectedError(predAfterErr.message);
    }
    const predsAfter = (predAfterRows ?? []).map((r) =>
      mapPredictionRow(r as PredRow),
    );
    const fpAfter = fingerprintPredictionsForParticipant(
      predsAfter,
      input.participantId,
    );

    if (completeAfter) {
      try {
        logPicksSaveStep("activity_log_started", fullCtx);
        const displayName = String(row.display_name ?? "").trim() || "Someone";
        const snapshotPath = `/participant/${input.participantId}/snapshot?from=activity`;
        if (!hadFirstSubmittedAt) {
          await supabase
            .from("participants")
            .update({ picks_first_submitted_at: new Date().toISOString() })
            .eq("id", input.participantId)
            .eq("user_id", user.id)
            .is("picks_first_submitted_at", null);
          if (!completeBefore) {
            await insertPoolActivityRow({
              poolId: poolIdStr,
              participantId: input.participantId,
              actorUserId: user.id,
              type: "participant_submitted_picks",
              bodyText: `${displayName} made their picks.`,
              metadataJson: {
                first_submission: true,
                display_name: displayName,
              },
              relatedPath: snapshotPath,
            });
          }
        } else if (fpBefore !== fpAfter) {
          await insertPoolActivityRow({
            poolId: poolIdStr,
            participantId: input.participantId,
            actorUserId: user.id,
            type: "participant_updated_picks",
            bodyText: `${displayName} updated their picks.`,
            metadataJson: { display_name: displayName },
            relatedPath: snapshotPath,
          });
        }
        logPicksSaveStep("activity_log_completed", fullCtx);
      } catch (e) {
        logPicksSaveStep("activity_log_failed", { ...fullCtx, error: e }, "error");
      }
      try {
        logPicksSaveStep("pool_milestones_started", fullCtx);
        await ensurePoolMilestonesForPool(poolIdStr);
        logPicksSaveStep("pool_milestones_completed", fullCtx);
      } catch (e) {
        logPicksSaveStep("pool_milestones_failed", { ...fullCtx, error: e }, "error");
      }
      try {
        logPicksSaveStep("pool_insights_started", fullCtx);
        await ensurePoolInsightsForPool(poolIdStr);
        logPicksSaveStep("pool_insights_completed", fullCtx);
      } catch (e) {
        logPicksSaveStep("pool_insights_failed", { ...fullCtx, error: e }, "error");
      }
    }

    logPicksSaveStep("ledger_recompute_started", fullCtx);
    const ledger = await recomputePoolLedgerForPoolAsTrustedServer(poolIdStr, {
      ledgerTrigger: "participant_save",
    });
    let ledgerError: string | null = null;
    if (ledger.error) {
      ledgerError = ledger.error;
      logPicksSaveStep("ledger_recompute_failed", { ...fullCtx, error: ledger.error }, "error");
    } else {
      logPicksSaveStep("ledger_recompute_completed", fullCtx);
    }

    logPicksSaveStep("revalidate_started", fullCtx);
    const revalidateError = safeRevalidateParticipantPickPaths(input.participantId);
    if (revalidateError) {
      logPicksSaveStep("revalidate_failed", { ...fullCtx, error: revalidateError }, "error");
    } else {
      logPicksSaveStep("revalidate_completed", fullCtx);
    }

    const result = buildPostSaveSuccessResult({ ledgerError, revalidateError });
    logPicksSaveStep("save_completed", {
      ...fullCtx,
      ...(result.warning ? { detail: result.warning } : {}),
    });
    return result;
  } catch (e) {
    logPicksSaveStep("save_failed", { ...logCtx, error: e }, "error");
    return savePicksUnexpectedError(messageFromUnknown(e));
  }
}
