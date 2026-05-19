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
  higher_team_slug: string | null;
  higher_team_logo_path: string | null;
  lower_team_name: string | null;
  lower_team_abbr: string | null;
  lower_team_slug: string | null;
  lower_team_logo_path: string | null;
  winner_team_name: string | null;
  winner_team_abbr: string | null;
  winner_team_slug: string | null;
  winner_team_logo_path: string | null;
};

/** One leaderboard row from `fetch_nhl_edition_standings` RPC. */
export type NhlStandingsStatus = "no_picks" | "in_progress" | "complete";

export type NhlStandingsRow = {
  /** Overall leaderboard rank (all rounds). */
  rank: number;
  /** Rank by points from Round 2 onward only (excludes Round 1). */
  round2_plus_rank: number;
  /** Competition entry id when the participant joined; used for public pick-detail links. */
  membership_id: string | null;
  user_id: string;
  entry_name: string;
  /** Sum of all round points plus bonus. */
  total_points: number;
  round1_points: number;
  round2_points: number;
  conference_final_points: number;
  stanley_cup_final_points: number;
  /** Reserved for future bonus categories; always 0 until modeled in SQL. */
  bonus_points: number;
  /** round2 + conference_final + stanley_cup_final + bonus (excludes Round 1). */
  round2_plus_points: number;
  correct_picks: number;
  /** Correct picks on series in R2, CF, or SCF only (for Round 2+ tiebreaks). */
  correct_picks_post_round1: number;
  pending_decisions: number;
  pick_count: number;
  status: NhlStandingsStatus;
};
