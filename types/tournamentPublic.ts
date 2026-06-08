/** Row shape from `tournament_editions_public`. */
export type TournamentEditionPublicRow = {
  id: string;
  code: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
};

/** Row shape from `tournament_public_matches`. */
export type TournamentMatchPublicRow = {
  match_id: string;
  edition_id: string;
  edition_code: string;
  match_code: string;
  stage_code: string;
  stage_label: string;
  stage_sort_order: number;
  group_code: string | null;
  round_index: number;
  kickoff_at: string | null;
  status: string;
  home_goals: number | null;
  away_goals: number | null;
  home_penalties: number | null;
  away_penalties: number | null;
  home_team_name: string | null;
  home_country_code: string | null;
  away_team_name: string | null;
  away_country_code: string | null;
  winner_team_name: string | null;
  winner_country_code: string | null;
};

export type PublicTournamentProgressPayload = {
  edition: TournamentEditionPublicRow | null;
  matches: TournamentMatchPublicRow[];
};
