type PoolLeaderboardTarget = {
  id: string;
  isPublic: boolean;
};

export function publicLeaderboardHrefForPool(
  pool: PoolLeaderboardTarget,
): string | null {
  return pool.isPublic ? `/pool/${pool.id}` : null;
}
