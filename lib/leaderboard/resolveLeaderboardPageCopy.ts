import {
  BRACKET_OUTLOOK_HEADLINE,
  BRACKET_OUTLOOK_INTRO,
} from "./buildBracketOutlook";
import {
  LEADERBOARD_ACTIVE_SUBTITLE,
  LEADERBOARD_PAGE_TITLE,
  STANDINGS_WARMING_UP_HEADLINE,
  STANDINGS_WARMING_UP_PAGE_SUBTITLE,
} from "./leaderboardPageCopy";

export type ResolveLeaderboardPageCopyInput = {
  picksLocked: boolean;
  hasAwardedPoints: boolean;
  showBracketOutlook: boolean;
};

export type LeaderboardPageCopy = {
  title: string;
  description: string;
};

/**
 * Page-level headline and subtitle for locked pool leaderboard surfaces.
 * Uses awarded points from the ledger (or equivalent standings rows), not Bracket Outlook visibility.
 */
export function resolveLeaderboardPageCopy(
  input: ResolveLeaderboardPageCopyInput,
): LeaderboardPageCopy {
  if (input.hasAwardedPoints) {
    return {
      title: LEADERBOARD_PAGE_TITLE,
      description: LEADERBOARD_ACTIVE_SUBTITLE,
    };
  }

  if (input.showBracketOutlook) {
    return {
      title: BRACKET_OUTLOOK_HEADLINE,
      description: BRACKET_OUTLOOK_INTRO,
    };
  }

  if (input.picksLocked) {
    return {
      title: STANDINGS_WARMING_UP_HEADLINE,
      description: STANDINGS_WARMING_UP_PAGE_SUBTITLE,
    };
  }

  return {
    title: LEADERBOARD_PAGE_TITLE,
    description: STANDINGS_WARMING_UP_PAGE_SUBTITLE,
  };
}

/** True when copy should avoid pre-scoring / "points not landed" messaging. */
export function leaderboardHasAwardedPoints(input: {
  hasAwardedPointsFlag?: boolean;
  standingsRows?: Array<{ totalPoints: number }>;
}): boolean {
  if (input.hasAwardedPointsFlag) return true;
  if (!input.standingsRows?.length) return false;
  return input.standingsRows.some((row) => row.totalPoints > 0);
}
