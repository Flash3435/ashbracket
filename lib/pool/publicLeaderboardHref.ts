type PoolLeaderboardTarget = {
  id: string;
  isPublic: boolean;
};

export function publicLeaderboardHrefForPool(
  pool: PoolLeaderboardTarget,
): string | null {
  return pool.isPublic ? `/pool/${pool.id}` : null;
}

type ParticipantPoolLeaderboardTarget = {
  poolId: string;
  isPublic: boolean;
  participantId: string;
};

/** Leaderboard href for a signed-in participant: public pool page or account-scoped private standings. */
export function leaderboardHrefForParticipantPool(
  pool: ParticipantPoolLeaderboardTarget,
): string {
  if (pool.isPublic) {
    return `/pool/${pool.poolId}`;
  }
  const participantId = pool.participantId.trim();
  return `/account/leaderboard?participant=${encodeURIComponent(participantId)}`;
}
