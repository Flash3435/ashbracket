import {
  deriveTeamStatTotals,
  firstPlaceTeamStatLeaders,
} from "./deriveTeamStatTotals";
import type { TeamDisplayInfo } from "./buildTournamentStatLeadersView";
import type {
  MatchForTeamStatAggregation,
  MatchTeamStatRecord,
} from "./types";

export type TournamentBonusCategoryKey =
  | "most_goals"
  | "most_yellow_cards"
  | "most_red_cards";

export type BonusCategoryStandingLeader = {
  teamId: string;
  teamName: string;
  total: number;
};

export type BonusCategoryStanding = {
  leaders: BonusCategoryStandingLeader[];
  totalsByTeamId: Record<string, number>;
  isAvailable: boolean;
  /** Published bonus result team ids for this category (may include tied winners). */
  publishedWinningTeamIds: string[];
  /** Pool points for this category when known (leaderboard presentation). */
  awardedPoints: number | null;
};

export type TournamentBonusStandings = {
  most_goals: BonusCategoryStanding;
  most_yellow_cards: BonusCategoryStanding;
  most_red_cards: BonusCategoryStanding;
};

function mapToRecord(totals: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [teamId, total] of totals) {
    out[teamId] = total;
  }
  return out;
}

function buildCategoryStanding(
  totals: Map<string, number>,
  teamInfoById: ReadonlyMap<string, TeamDisplayInfo>,
  publishedWinningTeamIds: readonly string[] = [],
  awardedPoints: number | null = null,
): BonusCategoryStanding {
  const leaderRows = firstPlaceTeamStatLeaders(totals);
  return {
    leaders: leaderRows.map((row) => ({
      teamId: row.teamId,
      teamName: teamInfoById.get(row.teamId)?.name?.trim() || "Unknown team",
      total: row.total,
    })),
    totalsByTeamId: mapToRecord(totals),
    isAvailable: leaderRows.length > 0,
    publishedWinningTeamIds: [...publishedWinningTeamIds],
    awardedPoints,
  };
}

/**
 * Live tournament totals + first-place leaders for bonus categories.
 * Reuses the same deriveTeamStatTotals / firstPlaceTeamStatLeaders rules as
 * Bonus Watch and publish-from-stats (no second calculation).
 */
export function buildTournamentBonusStandings(input: {
  matches: readonly MatchForTeamStatAggregation[];
  teamStats: readonly MatchTeamStatRecord[];
  teamInfoById: ReadonlyMap<string, TeamDisplayInfo>;
  /** Published bonus result team ids by category key. */
  publishedWinningTeamIdsByKey?: ReadonlyMap<string, readonly string[]>;
  /** Pool bonus point values by category key. */
  awardedPointsByKey?: ReadonlyMap<string, number>;
}): TournamentBonusStandings {
  const totals = deriveTeamStatTotals({
    matches: input.matches,
    teamStats: input.teamStats,
  });
  const published = input.publishedWinningTeamIdsByKey;
  const points = input.awardedPointsByKey;

  return {
    most_goals: buildCategoryStanding(
      totals.goalsByTeamId,
      input.teamInfoById,
      published?.get("most_goals") ?? [],
      points?.get("most_goals") ?? null,
    ),
    most_yellow_cards: buildCategoryStanding(
      totals.yellowCardsByTeamId,
      input.teamInfoById,
      published?.get("most_yellow_cards") ?? [],
      points?.get("most_yellow_cards") ?? null,
    ),
    most_red_cards: buildCategoryStanding(
      totals.redCardsByTeamId,
      input.teamInfoById,
      published?.get("most_red_cards") ?? [],
      points?.get("most_red_cards") ?? null,
    ),
  };
}
