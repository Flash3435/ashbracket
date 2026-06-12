import { deriveTeamStatTotals, firstPlaceTeamStatLeaders } from "./deriveTeamStatTotals";
import type {
  MatchForTeamStatAggregation,
  MatchTeamStatRecord,
} from "./types";

export type TournamentStatLeaderTeam = {
  teamId: string;
  teamName: string;
  countryCode: string;
  total: number;
};

export type TournamentStatCategoryKey =
  | "most_goals"
  | "most_yellow_cards"
  | "most_red_cards";

export type TournamentStatCategoryLeader = {
  bonusKey: TournamentStatCategoryKey;
  shortLabel: string;
  leaders: TournamentStatLeaderTeam[];
  /** Set when no data exists for this category. */
  emptyMessage: string | null;
  /** Brackets that picked the sole current leader (optional). */
  pickCount: number | null;
};

export type TournamentStatLeadersView = {
  goals: TournamentStatCategoryLeader;
  yellowCards: TournamentStatCategoryLeader;
  redCards: TournamentStatCategoryLeader;
  hasAnyStats: boolean;
  /** Global empty state when nothing has been entered yet. */
  fullyEmpty: boolean;
};

export type TeamDisplayInfo = {
  name: string;
  countryCode: string;
};

const CATEGORY_SHORT_LABELS: Record<TournamentStatCategoryKey, string> = {
  most_goals: "Most goals",
  most_yellow_cards: "Most yellow cards",
  most_red_cards: "Most red cards",
};

const GOALS_EMPTY =
  "Goal leaders will appear after final scores are entered.";
const CARDS_EMPTY =
  "Card leaders will appear after match cards are entered.";

function mapLeaders(
  rows: { teamId: string; total: number }[],
  teamInfoById: ReadonlyMap<string, TeamDisplayInfo>,
): TournamentStatLeaderTeam[] {
  return rows.map((row) => {
    const info = teamInfoById.get(row.teamId);
    return {
      teamId: row.teamId,
      teamName: info?.name ?? "Unknown team",
      countryCode: info?.countryCode ?? "",
      total: row.total,
    };
  });
}

function buildCategory(
  bonusKey: TournamentStatCategoryKey,
  totals: Map<string, number>,
  teamInfoById: ReadonlyMap<string, TeamDisplayInfo>,
  emptyMessage: string,
  pickCount: number | null,
): TournamentStatCategoryLeader {
  const leaderRows = firstPlaceTeamStatLeaders(totals);
  return {
    bonusKey,
    shortLabel: CATEGORY_SHORT_LABELS[bonusKey],
    leaders: mapLeaders(leaderRows, teamInfoById),
    emptyMessage: leaderRows.length === 0 ? emptyMessage : null,
    pickCount: leaderRows.length === 1 ? pickCount : null,
  };
}

export function buildTournamentStatLeadersView(input: {
  matches: readonly MatchForTeamStatAggregation[];
  teamStats: readonly MatchTeamStatRecord[];
  teamInfoById: ReadonlyMap<string, TeamDisplayInfo>;
  pickCountsByBonusKey?: Partial<Record<TournamentStatCategoryKey, number | null>>;
}): TournamentStatLeadersView {
  const totals = deriveTeamStatTotals({
    matches: input.matches,
    teamStats: input.teamStats,
  });

  const pickCounts = input.pickCountsByBonusKey ?? {};

  const goals = buildCategory(
    "most_goals",
    totals.goalsByTeamId,
    input.teamInfoById,
    GOALS_EMPTY,
    pickCounts.most_goals ?? null,
  );
  const yellowCards = buildCategory(
    "most_yellow_cards",
    totals.yellowCardsByTeamId,
    input.teamInfoById,
    CARDS_EMPTY,
    pickCounts.most_yellow_cards ?? null,
  );
  const redCards = buildCategory(
    "most_red_cards",
    totals.redCardsByTeamId,
    input.teamInfoById,
    CARDS_EMPTY,
    pickCounts.most_red_cards ?? null,
  );

  const hasGoals = totals.goalsByTeamId.size > 0;
  const hasCards =
    totals.yellowCardsByTeamId.size > 0 || totals.redCardsByTeamId.size > 0;
  const hasAnyStats = hasGoals || hasCards;

  return {
    goals,
    yellowCards,
    redCards,
    hasAnyStats,
    fullyEmpty: !hasAnyStats,
  };
}

/** Comma-separated leader names for tie footnotes (caller adds the "Tied:" prefix). */
export function formatStatLeaderNames(leaders: TournamentStatLeaderTeam[]): string {
  if (leaders.length === 0) return "";
  return leaders.map((l) => l.teamName).join(", ");
}
