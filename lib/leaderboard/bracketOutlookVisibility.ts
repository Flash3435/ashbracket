import {
  bracketOutlookIsMeaningful,
  type BracketOutlookResult,
} from "./buildBracketOutlook";
import { fetchPoolHasAwardedLeaderboardPoints } from "./poolLeaderboardIsActive";

export type BracketOutlookVisibilityInput = {
  picksLocked: boolean;
  hasAwardedPoints: boolean;
  outlook: BracketOutlookResult | null;
  completedMatchCount: number;
};

/** True when Bracket Outlook should replace the all-zero leaderboard table. */
export function shouldShowBracketOutlook(input: BracketOutlookVisibilityInput): boolean {
  if (!input.picksLocked) return false;
  if (input.hasAwardedPoints) return false;
  if (input.completedMatchCount <= 0) return false;
  return bracketOutlookIsMeaningful(input.outlook);
}

/** True when Bracket Outlook nav should appear (locked, no official points yet). */
export function shouldShowBracketOutlookNav(input: {
  picksLocked: boolean;
  hasAwardedPoints: boolean;
}): boolean {
  return input.picksLocked && !input.hasAwardedPoints;
}

export async function fetchPoolHasAwardedPointsSafe(poolId: string): Promise<boolean> {
  try {
    return await fetchPoolHasAwardedLeaderboardPoints(poolId);
  } catch {
    return false;
  }
}
