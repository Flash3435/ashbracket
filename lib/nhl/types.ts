/** Row shape for `public.nhl_editions` (Phase 2). */
export type NhlEdition = {
  id: string;
  slug: string;
  name: string;
  season_label: string;
  is_active: boolean;
  lock_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Row shape for `public.nhl_teams`. */
export type NhlTeam = {
  id: string;
  edition_id: string;
  team_name: string;
  team_slug: string;
  abbreviation: string;
  conference: "east" | "west";
  division: string | null;
  seed: number | null;
  logo_path: string | null;
  is_active: boolean;
  created_at: string;
};

/** Row shape for `public.nhl_series`. */
export type NhlSeries = {
  id: string;
  edition_id: string;
  round_code: "R1" | "R2" | "CF" | "SCF";
  round_order: number;
  side_or_conference: "east" | "west" | "cup" | null;
  slot_index: number;
  higher_seed_team_id: string | null;
  lower_seed_team_id: string | null;
  winner_team_id: string | null;
  games_won_by_higher_seed: number;
  games_won_by_lower_seed: number;
  best_of: number;
  status: "pending" | "in_progress" | "complete";
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NhlSeriesRow = NhlSeries & {
  higher_team_name: string | null;
  higher_team_abbr: string | null;
  lower_team_name: string | null;
  lower_team_abbr: string | null;
  winner_team_name: string | null;
  winner_team_abbr: string | null;
};
