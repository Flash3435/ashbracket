import type {
  LeaderboardPublicRow,
  LeaderboardPublicRowDb,
  PublicLeaderboardPoolSection,
} from "../../types/leaderboard";

export function mapPublicLeaderboardRow(
  row: LeaderboardPublicRowDb,
): LeaderboardPublicRow {
  return {
    poolId: row.pool_id,
    poolName: row.pool_name,
    participantId: row.participant_id,
    displayName: row.display_name,
    totalPoints: Number(row.total_points),
    rank: Number(row.rank),
  };
}

/**
 * Groups rows by `poolId` (not display name), preserves row order within each pool,
 * then sorts pools by `poolName` for stable section order.
 */
export function groupPublicLeaderboardByPool(
  rows: LeaderboardPublicRow[],
): PublicLeaderboardPoolSection[] {
  const byPoolId = new Map<
    string,
    { poolName: string; rows: LeaderboardPublicRow[] }
  >();

  for (const row of rows) {
    const existing = byPoolId.get(row.poolId);
    if (existing) {
      existing.rows.push(row);
    } else {
      byPoolId.set(row.poolId, { poolName: row.poolName, rows: [row] });
    }
  }

  return Array.from(byPoolId.entries())
    .map(([poolId, { poolName, rows: poolRows }]) => ({
      poolId,
      poolName,
      rows: poolRows,
    }))
    .sort((a, b) => a.poolName.localeCompare(b.poolName));
}
