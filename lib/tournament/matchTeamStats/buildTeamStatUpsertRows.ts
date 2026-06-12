import type { ValidatedMatchTeamStatsSave } from "./validateMatchTeamStatsPayload";

export type TeamStatUpsertRow = {
  edition_id: string;
  match_id: string;
  team_id: string;
  yellow_cards: number | null;
  red_cards: number | null;
  source: "manual";
};

/** Keys written to tournament_match_team_stats — not predictions or ledger. */
export const MATCH_TEAM_STAT_ROW_KEYS = [
  "edition_id",
  "match_id",
  "team_id",
  "yellow_cards",
  "red_cards",
  "source",
] as const;

/**
 * Builds exactly two manual stat rows (home + away) for upsert.
 * Blank card fields persist as null (clears prior value on upsert).
 */
export function buildTeamStatUpsertRows(input: {
  editionId: string;
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  stats: ValidatedMatchTeamStatsSave;
}): TeamStatUpsertRow[] {
  return [
    {
      edition_id: input.editionId,
      match_id: input.matchId,
      team_id: input.homeTeamId,
      yellow_cards: input.stats.homeYellowCards,
      red_cards: input.stats.homeRedCards,
      source: "manual",
    },
    {
      edition_id: input.editionId,
      match_id: input.matchId,
      team_id: input.awayTeamId,
      yellow_cards: input.stats.awayYellowCards,
      red_cards: input.stats.awayRedCards,
      source: "manual",
    },
  ];
}

/** True when both sides have all card fields blank — caller may delete stat rows. */
export function teamStatsAreEmpty(stats: ValidatedMatchTeamStatsSave): boolean {
  return (
    stats.homeYellowCards == null &&
    stats.awayYellowCards == null &&
    stats.homeRedCards == null &&
    stats.awayRedCards == null
  );
}
