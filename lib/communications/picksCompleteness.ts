import type { SupabaseClient } from "@supabase/supabase-js";
import { ACCOUNT_TOURNAMENT_STAGE_CODES } from "../account/loadAccountKnockoutSelection";
import { buildAllParticipantPickDrafts } from "../predictions/buildParticipantPickDrafts";
import { mapPredictionRow } from "../../src/lib/scoring/mapSupabaseRows";
import type { Prediction, TournamentStage } from "../../src/types/domain";
import { participantBonusKeysForPool } from "../predictions/buildParticipantPickDrafts";
import { mapTournamentStageRow } from "../results/mapRows";
import { isKnockoutProgressionKind } from "../predictions/knockoutProgressionKinds";
import { fetchOfficialRoundOf32Complete } from "../tournament/fetchOfficialRoundOf32Complete";

type PredRow = Parameters<typeof mapPredictionRow>[0];

/**
 * Whether every required pick slot has a team chosen. When the official Round of 32 is
 * not published yet, knockout progression rows are ignored so participants are not
 * flagged incomplete for rounds they cannot fill.
 */
export function participantPicksCompleteFromDrafts(
  slots: ReturnType<typeof buildAllParticipantPickDrafts>,
  options?: { knockoutBracketPicksUnlocked?: boolean },
): boolean {
  if (slots.length === 0) return false;
  const unlocked = options?.knockoutBracketPicksUnlocked !== false;
  const relevant = unlocked
    ? slots
    : slots.filter((s) => !isKnockoutProgressionKind(s.predictionKind));
  if (relevant.length === 0) return false;
  return relevant.every((s) => s.teamId.trim() !== "");
}

/**
 * Loads predictions + stages once, returns participant ids in the pool whose picks are incomplete.
 */
export async function loadParticipantIdsWithIncompletePicks(
  supabase: SupabaseClient,
  poolId: string,
  participantIds: string[],
): Promise<Set<string>> {
  const incomplete = new Set<string>();
  if (participantIds.length === 0) return incomplete;

  const stageCodes = [...ACCOUNT_TOURNAMENT_STAGE_CODES];
  const [{ data: stageRows, error: stageErr }, { data: predRows, error: predErr }, { data: ruleRows, error: ruleErr }] =
    await Promise.all([
      supabase
        .from("tournament_stages")
        .select(
          "id, code, label, sort_order, starts_at, ends_at, created_at, updated_at",
        )
        .in("code", stageCodes)
        .order("sort_order", { ascending: true }),
      supabase
        .from("predictions")
        .select(
          "id, pool_id, participant_id, prediction_kind, team_id, tournament_stage_id, group_code, slot_key, bonus_key, value_text, created_at, updated_at",
        )
        .eq("pool_id", poolId)
        .in("participant_id", participantIds),
      supabase
        .from("scoring_rules")
        .select("bonus_key")
        .eq("pool_id", poolId)
        .eq("prediction_kind", "bonus_pick")
        .order("bonus_key", { ascending: true }),
    ]);

  if (stageErr || predErr || ruleErr) {
    participantIds.forEach((id) => incomplete.add(id));
    return incomplete;
  }

  const stages = (stageRows ?? []).map((r) =>
    mapTournamentStageRow(
      r as {
        id: string;
        code: string;
        label: string;
        sort_order: number;
        starts_at: string | null;
        ends_at: string | null;
        created_at: string;
        updated_at: string;
      },
    ),
  );
  const stageByCode = Object.fromEntries(
    stages.map((s) => [s.code, s]),
  ) as Partial<Record<TournamentStage["code"], TournamentStage>>;

  const predictions: Prediction[] = (predRows ?? []).map((row) =>
    mapPredictionRow(row as PredRow),
  );

  const fromDb = (ruleRows ?? [])
    .map((r) => r.bonus_key as string | null)
    .filter((k): k is string => Boolean(k && k.trim()));
  const bonusKeys = participantBonusKeysForPool(fromDb);

  const r32Stage = stages.find((s) => s.code === "round_of_32");
  const knockoutBracketPicksUnlocked = r32Stage
    ? await fetchOfficialRoundOf32Complete(supabase, r32Stage.id)
    : true;

  for (const pid of participantIds) {
    const slots = buildAllParticipantPickDrafts({
      stageByCode,
      predictions,
      participantId: pid,
      bonusKeys,
    });
    if (
      !participantPicksCompleteFromDrafts(slots, {
        knockoutBracketPicksUnlocked,
      })
    ) {
      incomplete.add(pid);
    }
  }

  return incomplete;
}

/** Whether one participant’s required pick slots are complete (same rules as bulk incomplete check). */
export async function isParticipantPicksCompleteForParticipant(
  supabase: SupabaseClient,
  poolId: string,
  participantId: string,
): Promise<boolean> {
  const incomplete = await loadParticipantIdsWithIncompletePicks(
    supabase,
    poolId,
    [participantId],
  );
  return !incomplete.has(participantId);
}
