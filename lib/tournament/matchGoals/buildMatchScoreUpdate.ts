import { winnerFromMatchScores } from "../matchOutcome";

export type MatchScoreInput = {
  homeGoals: number | null;
  awayGoals: number | null;
};

/**
 * Builds the tournament_matches row patch for an explicit admin score save.
 * Does not touch penalties, predictions, or ledger tables.
 */
export function buildMatchScoreUpdate(input: {
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
  currentStatus: string;
  homePenalties?: number | null;
  awayPenalties?: number | null;
}): { ok: true; update: Record<string, unknown> } | { ok: false; error: string } {
  const { homeGoals, awayGoals } = input;

  if (homeGoals != null && (!Number.isInteger(homeGoals) || homeGoals < 0)) {
    return { ok: false, error: "Home goals must be a non-negative integer." };
  }
  if (awayGoals != null && (!Number.isInteger(awayGoals) || awayGoals < 0)) {
    return { ok: false, error: "Away goals must be a non-negative integer." };
  }
  if (homeGoals != null && awayGoals == null) {
    return { ok: false, error: "Enter away goals when home goals are set." };
  }
  if (awayGoals != null && homeGoals == null) {
    return { ok: false, error: "Enter home goals when away goals are set." };
  }

  const winnerTeamId =
    homeGoals != null && awayGoals != null
      ? winnerFromMatchScores({
          homeTeamId: input.homeTeamId,
          awayTeamId: input.awayTeamId,
          homeGoals,
          awayGoals,
          homePenalties: input.homePenalties ?? null,
          awayPenalties: input.awayPenalties ?? null,
        })
      : null;

  const clearing = homeGoals == null && awayGoals == null;
  const status = clearing
    ? "scheduled"
    : homeGoals != null && awayGoals != null
      ? "finished"
      : input.currentStatus;

  return {
    ok: true,
    update: {
      home_goals: homeGoals,
      away_goals: awayGoals,
      winner_team_id: winnerTeamId,
      status,
    },
  };
}

/** Keys written by score save — goal CRUD must not include these. */
export const MATCH_SCORE_UPDATE_KEYS = [
  "home_goals",
  "away_goals",
  "winner_team_id",
  "status",
] as const;

/** Keys written by goal CRUD — score save must not include these. */
export const MATCH_GOAL_ROW_KEYS = [
  "edition_id",
  "match_id",
  "team_id",
  "player_name",
  "minute",
  "stoppage_minute",
  "is_own_goal",
] as const;
