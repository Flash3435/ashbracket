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
}): TournamentBonusStandings {
  const totals = deriveTeamStatTotals({
    matches: input.matches,
    teamStats: input.teamStats,
  });

  return {
    most_goals: buildCategoryStanding(totals.goalsByTeamId, input.teamInfoById),
    most_yellow_cards: buildCategoryStanding(
      totals.yellowCardsByTeamId,
      input.teamInfoById,
    ),
    most_red_cards: buildCategoryStanding(
      totals.redCardsByTeamId,
      input.teamInfoById,
    ),
  };
}
