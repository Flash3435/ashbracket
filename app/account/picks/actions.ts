"use server";

import { createClient } from "@/lib/supabase/server";
import { isParticipantPicksCompleteForParticipant } from "../../../lib/communications/picksCompleteness";
import { insertPoolActivityRow } from "../../../lib/poolActivity/insertPoolActivity";
import { fingerprintPredictionsForParticipant } from "../../../lib/poolActivity/predictionsFingerprint";
import { applyParticipantPickSlots } from "../../../lib/predictions/applyParticipantPickSlots";
import { validateFrozenPicksUnchangedWhenPoolLocked } from "../../../lib/predictions/frozenPreBracketPickKinds";
import { mergeKnockoutProgressionSlotsFromPredictions } from "../../../lib/predictions/mergeKnockoutProgressionFromExistingPredictions";
import { validateKnockoutPickSaveInput } from "../../../lib/predictions/validateKnockoutPickPayload";
import { fetchOfficialRoundOf32Complete } from "../../../lib/tournament/fetchOfficialRoundOf32Complete";
import { mapPredictionRow } from "../../../src/lib/scoring/mapSupabaseRows";
import { revalidatePath } from "next/cache";
import type {
  ParticipantPickSlotPayload,
  SaveKnockoutPicksResult,
} from "../../../types/knockoutPicksSave";

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
 * Verifies ownership and pool lock server-side. Does not call `replace_points_ledger_for_pool`
 * (admin-only); standings refresh when an organizer recomputes or results sync runs.
 */
export async function saveMyKnockoutPicksAction(input: {
  participantId: string;
  slots: ParticipantPickSlotPayload[];
}): Promise<SaveKnockoutPicksResult> {
  const invalid = validateKnockoutPickSaveInput(input);
  if (invalid) return invalid;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: "You must be signed in to save picks." };
    }

    const { data: row, error: parErr } = await supabase
      .from("participants")
      .select("id, pool_id, display_name, picks_first_submitted_at")
      .eq("id", input.participantId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (parErr) return { ok: false, error: parErr.message };
    if (!row) {
      return {
        ok: false,
        error: "That profile was not found or is not linked to your account.",
      };
    }

    const { data: poolRow, error: poolErr } = await supabase
      .from("pools")
      .select("lock_at")
      .eq("id", row.pool_id)
      .maybeSingle();

    if (poolErr) return { ok: false, error: poolErr.message };
    const poolLockedNow = Boolean(poolRow && poolIsLocked(poolRow.lock_at));

    if (poolLockedNow) {
      const { data: predData, error: predFetchErr } = await supabase
        .from("predictions")
        .select(
          "id, pool_id, participant_id, prediction_kind, team_id, tournament_stage_id, group_code, slot_key, bonus_key, value_text, created_at, updated_at",
        )
        .eq("pool_id", row.pool_id)
        .eq("participant_id", input.participantId);
      if (predFetchErr) {
        return { ok: false, error: predFetchErr.message };
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
        return { ok: false, error: freezeErr };
      }
    }

    let slots = input.slots;
    const { data: r32StageRow, error: r32StageErr } = await supabase
      .from("tournament_stages")
      .select("id")
      .eq("code", "round_of_32")
      .maybeSingle();
    if (r32StageErr) {
      return { ok: false, error: r32StageErr.message };
    }
    if (r32StageRow?.id) {
      const unlocked = await fetchOfficialRoundOf32Complete(
        supabase,
        r32StageRow.id as string,
      );
      if (!unlocked) {
        const { data: predData, error: predFetchErr } = await supabase
          .from("predictions")
          .select(
            "id, pool_id, participant_id, prediction_kind, team_id, tournament_stage_id, group_code, slot_key, bonus_key, value_text, created_at, updated_at",
          )
          .eq("pool_id", row.pool_id)
          .eq("participant_id", input.participantId);
        if (predFetchErr) {
          return { ok: false, error: predFetchErr.message };
        }
        type PredRow = Parameters<typeof mapPredictionRow>[0];
        const existing = (predData ?? []).map((r) =>
          mapPredictionRow(r as PredRow),
        );
        slots = mergeKnockoutProgressionSlotsFromPredictions(slots, existing);
      }
    }

    const { data: predBeforeRows, error: predBeforeErr } = await supabase
      .from("predictions")
      .select(
        "id, pool_id, participant_id, prediction_kind, team_id, tournament_stage_id, group_code, slot_key, bonus_key, value_text, created_at, updated_at",
      )
      .eq("pool_id", row.pool_id)
      .eq("participant_id", input.participantId);
    if (predBeforeErr) {
      return { ok: false, error: predBeforeErr.message };
    }
    type PredRow = Parameters<typeof mapPredictionRow>[0];
    const predsBefore = (predBeforeRows ?? []).map((r) =>
      mapPredictionRow(r as PredRow),
    );
    const fpBefore = fingerprintPredictionsForParticipant(
      predsBefore,
      input.participantId,
    );
    const completeBefore = await isParticipantPicksCompleteForParticipant(
      supabase,
      row.pool_id as string,
      input.participantId,
    );
    const hadFirstSubmittedAt = Boolean(row.picks_first_submitted_at);

    const applied = await applyParticipantPickSlots(supabase, {
      poolId: row.pool_id,
      participantId: input.participantId,
      slots,
    });
    if (!applied.ok) return applied;

    const completeAfter = await isParticipantPicksCompleteForParticipant(
      supabase,
      row.pool_id as string,
      input.participantId,
    );
    const { data: predAfterRows, error: predAfterErr } = await supabase
      .from("predictions")
      .select(
        "id, pool_id, participant_id, prediction_kind, team_id, tournament_stage_id, group_code, slot_key, bonus_key, value_text, created_at, updated_at",
      )
      .eq("pool_id", row.pool_id)
      .eq("participant_id", input.participantId);
    if (predAfterErr) {
      return { ok: false, error: predAfterErr.message };
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
              poolId: row.pool_id as string,
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
            poolId: row.pool_id as string,
            participantId: input.participantId,
            actorUserId: user.id,
            type: "participant_updated_picks",
            bodyText: `${displayName} updated their picks.`,
            metadataJson: { display_name: displayName },
            relatedPath: snapshotPath,
          });
        }
      } catch (e) {
        console.error("pool_activity picks milestone failed", e);
      }
    }

    revalidatePath("/account/picks");
    revalidatePath("/account/picks/summary");
    revalidatePath(`/participant/${input.participantId}/snapshot`);
    revalidatePath("/account");
    revalidatePath("/account/activity");
    revalidatePath(`/participant/${input.participantId}`);

    return { ok: true };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}
