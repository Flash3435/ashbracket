/** One row from the Postgres view `leaderboard_public` (anon-safe columns). */
export interface LeaderboardPublicRow {
  poolId: string;
  poolName: string;
  participantId: string;
  displayName: string;
  totalPoints: number;
  rank: number;
}

/** Row shape returned by `select` on the `leaderboard_public` view (snake_case). */
export interface LeaderboardPublicRowDb {
  pool_id: string;
  pool_name: string;
  participant_id: string;
  display_name: string;
  total_points: number | string;
  rank: number | string;
}

/** Mapped rows for one pool, grouped by `poolId` for rendering. */
export interface PublicLeaderboardPoolSection {
  poolId: string;
  poolName: string;
  rows: LeaderboardPublicRow[];
}
