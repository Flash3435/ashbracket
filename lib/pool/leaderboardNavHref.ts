import { leaderboardHrefForParticipantPool } from "./publicLeaderboardHref";

type LeaderboardNavHrefInput = {
  poolId: string;
  isPublic: boolean;
  participantId: string;
  picksLocked: boolean;
  hasAwardedPoints: boolean;
};

/** Leaderboard href for nav/dashboard links — only when locked and points exist. */
export function leaderboardNavHrefForParticipantPool(
  input: LeaderboardNavHrefInput,
): string | null {
  if (!input.picksLocked || !input.hasAwardedPoints) {
    return null;
  }
  return leaderboardHrefForParticipantPool({
    poolId: input.poolId,
    isPublic: input.isPublic,
    participantId: input.participantId,
  });
}
