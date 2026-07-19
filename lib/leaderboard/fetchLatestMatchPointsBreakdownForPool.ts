import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildLatestPointsBreakdownByParticipantId,
  type LeaderboardLatestPointsBreakdown,
  type ParticipantPredictionForPointsAttribution,
  type TournamentMatchForPointsAttribution,
} from "./computeLatestMatchPointsBreakdown";
import type { LeaderboardMomentumRow } from "./buildLeaderboardMomentum";
import type { LeaderboardLatestScoreEventContext } from "./parseLatestScoreEventContext";
import { fetchPoolPredictions } from "@/lib/predictions/fetchPoolPredictions";
import {
  areThirdPlaceQualifiersSettled,
  resolveOfficialThirdPlaceAdvancers,
  r32FixturesFromTournamentMatches,
} from "@/lib/scoring/resolveOfficialThirdPlaceAdvancers";
import { mapResultRow } from "../../src/lib/scoring/mapSupabaseRows";
import { TOURNAMENT_BONUS_KEYS } from "./scoringDeltaAttribution";

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
  const { predictions, error } = await fetchPoolPredictions(supabase, { poolId });
  if (error) throw new Error(error);

  return predictions.map((pred) => ({
    participantId: pred.participantId,
    predictionKind: pred.predictionKind,
    teamId: pred.teamId ?? null,
    slotKey: pred.slotKey ?? null,
    bonusKey: pred.bonusKey ?? null,
  }));
}

async function loadScoringRulesByKind(
  supabase: SupabaseClient,
  poolId: string,
): Promise<{
  rulesByKind: Map<string, number>;
  pointsByBonusKey: Map<string, number>;
}> {
  const { data, error } = await supabase
    .from("scoring_rules")
    .select("prediction_kind, bonus_key, points")
    .eq("pool_id", poolId);

  if (error) throw new Error(error.message);

  const rulesByKind = new Map<string, number>();
  const pointsByBonusKey = new Map<string, number>();
  for (const row of data ?? []) {
    const kind = row.prediction_kind as string;
    const bonusKey = (row.bonus_key as string | null)?.trim() || null;
    const points = Number(row.points);
    if (kind === "bonus_pick" && bonusKey) {
      rulesByKind.set(`bonus_pick:${bonusKey}`, points);
      pointsByBonusKey.set(bonusKey, points);
    } else {
      rulesByKind.set(kind, points);
    }
  }
  return { rulesByKind, pointsByBonusKey };
}

async function loadThirdPlaceAdvancerTeamIds(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{ teamIds: Set<string>; settled: boolean }> {
  const [{ data: stages }, { data: resultsRaw }, { data: r32Matches }] =
    await Promise.all([
      supabase.from("tournament_stages").select("id, code"),
      supabase
        .from("results")
        .select(
          "id, tournament_stage_id, kind, team_id, group_code, slot_key, value_text, resolved_at, created_at, edition_id",
        )
        .eq("edition_id", editionId),
      supabase
        .from("tournament_matches")
        .select("match_code, home_team_id, away_team_id, stage_code")
        .eq("edition_id", editionId)
        .eq("stage_code", "round_of_32"),
    ]);

  const r32StageId = stages?.find((stage) => stage.code === "round_of_32")?.id as
    | string
    | undefined;
  if (!r32StageId) {
    return { teamIds: new Set(), settled: false };
  }

  const results = (resultsRaw ?? []).map(mapResultRow);
  const resolution = resolveOfficialThirdPlaceAdvancers({
    results,
    roundOf32StageId: r32StageId,
    r32Fixtures: r32FixturesFromTournamentMatches(r32Matches ?? []),
  });

  return {
    teamIds: new Set(
      resolution.advancers.map((advancer) => advancer.teamId).filter(Boolean),
    ),
    settled: areThirdPlaceQualifiersSettled(resolution),
  };
}

async function loadPublishedBonusWinners(
  supabase: SupabaseClient,
  editionId: string,
): Promise<Map<string, Set<string>>> {
  const { data, error } = await supabase
    .from("results")
    .select("slot_key, team_id")
    .eq("edition_id", editionId)
    .eq("kind", "bonus_pick")
    .in("slot_key", [...TOURNAMENT_BONUS_KEYS]);

  if (error) throw new Error(error.message);

  const map = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const key = (row.slot_key as string | null)?.trim();
    const teamId = (row.team_id as string | null)?.trim();
    if (!key || !teamId) continue;
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    set.add(teamId);
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

  const { data: poolRow, error: poolErr } = await supabase
    .from("pools")
    .select("tournament_edition_id")
    .eq("id", poolId)
    .maybeSingle();
  if (poolErr) throw new Error(poolErr.message);
  const editionId = poolRow?.tournament_edition_id as string | null | undefined;
  if (!editionId) return new Map();

  const matchCodes = input.event.matchCodes;
  const [matches, predictions, rules, thirdPlaceContext, publishedBonusWinners] =
    await Promise.all([
      matchCodes.length > 0
        ? loadMatchesForCodes(supabase, editionId, matchCodes)
        : Promise.resolve([]),
      loadPredictionsForPool(supabase, poolId),
      loadScoringRulesByKind(supabase, poolId),
      loadThirdPlaceAdvancerTeamIds(supabase, editionId),
      loadPublishedBonusWinners(supabase, editionId),
    ]);

  // Previously returned empty when inferred match codes failed to load.
  // Still build bonus/correction attribution from the standings delta.
  return buildLatestPointsBreakdownByParticipantId({
    participantIds: input.participantIds,
    momentumByParticipantId: input.momentumByParticipantId,
    event: input.event,
    predictions,
    matches,
    rulesByKind: rules.rulesByKind,
    pointsByBonusKey: rules.pointsByBonusKey,
    officialThirdPlaceAdvancerTeamIds: thirdPlaceContext.teamIds,
    thirdPlaceQualifiersSettled: thirdPlaceContext.settled,
    publishedWinnerTeamIdsByBonusKey: publishedBonusWinners,
  });
}
