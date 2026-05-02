import type { NhlSeriesRow } from "./types";

/** After `winner_team_id` changes, align denormalized winner labels with higher/lower seed rows. */
export function syncWinnerDisplayFieldsFromSeeds(row: NhlSeriesRow): NhlSeriesRow {
  if (!row.winner_team_id) {
    return {
      ...row,
      winner_team_name: null,
      winner_team_abbr: null,
      winner_team_slug: null,
      winner_team_logo_path: null,
    };
  }
  if (row.higher_seed_team_id && row.winner_team_id === row.higher_seed_team_id) {
    return {
      ...row,
      winner_team_name: row.higher_team_name,
      winner_team_abbr: row.higher_team_abbr,
      winner_team_slug: row.higher_team_slug,
      winner_team_logo_path: row.higher_team_logo_path,
    };
  }
  if (row.lower_seed_team_id && row.winner_team_id === row.lower_seed_team_id) {
    return {
      ...row,
      winner_team_name: row.lower_team_name,
      winner_team_abbr: row.lower_team_abbr,
      winner_team_slug: row.lower_team_slug,
      winner_team_logo_path: row.lower_team_logo_path,
    };
  }
  return row;
}
