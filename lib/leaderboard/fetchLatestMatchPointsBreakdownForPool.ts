import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildLatestPointsBreakdownByParticipantId,
  type LeaderboardLatestPointsBreakdown,
  type ParticipantPredictionForPointsAttribution,
  type TournamentMatchForPointsAttribution,
} from "./computeLatestMatchPointsBreakdown";
import type { LeaderboardMomentumRow } from "./buildLeaderboardMomentum";
import type { LeaderboardLatestScoreEventContext } from "./parseLatestScoreEventContext";

async function loadMatchesForCodes(
  supabase: SupabaseClient,
  editionId: string,
  matchCodes: readonly string[],
): Promise<TournamentMatchForPointsAttribution[]> {
  if (matchCodes.length === 0) return [];

  const { data, error } = await supabase
    .from("tournament_matches")
    .select(
      "match_code, stage_code, group_code, home_team_id, away_team_id, winner_team_id, scoring_result_kind, scoring_slot_key",
    )
    .eq("edition_id", editionId)
    .in("match_code", [...matchCodes]);

  if (error) throw new Error(error.message);

  const byCode = new Map(
    (data ?? []).map((row) => [
      row.match_code as string,
      {
        matchCode: row.match_code as string,
        stageCode: (row.stage_code as string | null) ?? null,
        groupCode: (row.group_code as string | null) ?? null,
        homeTeamId: (row.home_team_id as string | null) ?? null,
        awayTeamId: (row.away_team_id as string | null) ?? null,
        winnerTeamId: (row.winner_team_id as string | null) ?? null,
        scoringResultKind: (row.scoring_result_kind as string | null) ?? null,
        scoringSlotKey: (row.scoring_slot_key as string | null) ?? null,
      } satisfies TournamentMatchForPointsAttribution,
    ]),
  );

  return matchCodes
    .map((code) => byCode.get(code))
    .filter((match): match is TournamentMatchForPointsAttribution => match != null);
}

async function loadPredictionsForPool(
  supabase: SupabaseClient,
  poolId: string,
): Promise<ParticipantPredictionForPointsAttribution[]> {
  const { data, error } = await supabase
    .from("predictions")
    .select("participant_id, prediction_kind, team_id, slot_key")
    .eq("pool_id", poolId);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    participantId: row.participant_id as string,
    predictionKind: row.prediction_kind as string,
    teamId: (row.team_id as string | null) ?? null,
    slotKey: (row.slot_key as string | null) ?? null,
  }));
}

async function loadScoringRulesByKind(
  supabase: SupabaseClient,
  poolId: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("scoring_rules")
    .select("prediction_kind, points")
    .eq("pool_id", poolId);

  if (error) throw new Error(error.message);

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    map.set(row.prediction_kind as string, Number(row.points));
  }
  return map;
}

/**
 * Per-participant latest match vs total scoring breakdown for leaderboard display.
 */
export async function fetchLatestMatchPointsBreakdownForPool(
  supabase: SupabaseClient,
  poolId: string,
  input: {
    participantIds: readonly string[];
    momentumByParticipantId: ReadonlyMap<string, LeaderboardMomentumRow>;
    event: LeaderboardLatestScoreEventContext | null | undefined;
  },
): Promise<Map<string, LeaderboardLatestPointsBreakdown>> {
  if (!input.event?.hasValidSnapshot) return new Map();
  if (input.event.matchCodes.length === 0) return new Map();

  const { data: poolRow, error: poolErr } = await supabase
    .from("pools")
    .select("tournament_edition_id")
    .eq("id", poolId)
    .maybeSingle();
  if (poolErr) throw new Error(poolErr.message);
  const editionId = poolRow?.tournament_edition_id as string | null | undefined;
  if (!editionId) return new Map();

  const [matches, predictions, rulesByKind] = await Promise.all([
    loadMatchesForCodes(supabase, editionId, input.event.matchCodes),
    loadPredictionsForPool(supabase, poolId),
    loadScoringRulesByKind(supabase, poolId),
  ]);

  if (matches.length === 0) return new Map();

  return buildLatestPointsBreakdownByParticipantId({
    participantIds: input.participantIds,
    momentumByParticipantId: input.momentumByParticipantId,
    event: input.event,
    predictions,
    matches,
    rulesByKind,
  });
}
