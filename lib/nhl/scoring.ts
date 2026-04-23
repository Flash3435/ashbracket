/**
 * NHL playoff series scoring weights (per correct series winner once `winner_team_id` is set).
 * Keep in sync with `fetch_nhl_edition_standings` in migration `20260422180000_nhl_standings_rpc.sql`.
 */
export const NHL_SERIES_WINNER_POINTS_BY_ROUND: Record<
  "R1" | "R2" | "CF" | "SCF",
  number
> = {
  R1: 1,
  R2: 2,
  CF: 4,
  SCF: 8,
};
