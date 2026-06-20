import { leaderboardHrefForParticipantPool } from "./publicLeaderboardHref";

type StandingsNavInput = {
  poolId: string;
  isPublic: boolean;
  participantId: string;
  picksLocked: boolean;
  hasAwardedPoints: boolean;
  /** When false before official points, Outlook nav is hidden. */
  outlookHasMeaningfulSeparation?: boolean;
};

export type StandingsNavLabel = "Leaderboard" | "Outlook";

export type StandingsNavResult = {
  href: string | null;
  label: StandingsNavLabel | null;
};

/** Resolves header/dashboard nav: Outlook before official points, Leaderboard after. */
export function resolveStandingsNav(input: StandingsNavInput): StandingsNavResult {
  if (!input.picksLocked) {
    return { href: null, label: null };
  }

  const href = leaderboardHrefForParticipantPool({
    poolId: input.poolId,
    isPublic: input.isPublic,
    participantId: input.participantId,
  });

  if (input.hasAwardedPoints) {
    return { href, label: "Leaderboard" };
  }

  if (input.outlookHasMeaningfulSeparation) {
    return { href, label: "Outlook" };
  }

  return { href: null, label: null };
}

/** @deprecated Use resolveStandingsNav — kept for existing call sites. */
export function leaderboardNavHrefForParticipantPool(
  input: StandingsNavInput,
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

/** Outlook nav href — same route as leaderboard, shown before official points land. */
export function outlookNavHrefForParticipantPool(
  input: StandingsNavInput,
): string | null {
  if (!input.picksLocked || input.hasAwardedPoints) {
    return null;
  }
  return leaderboardHrefForParticipantPool({
    poolId: input.poolId,
    isPublic: input.isPublic,
    participantId: input.participantId,
  });
}
