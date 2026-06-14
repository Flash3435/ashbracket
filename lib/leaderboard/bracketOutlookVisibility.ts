import {
  bracketOutlookHasMeaningfulSeparation,
  computeBracketOutlookDistribution,
  type BracketOutlookDistributionSummary,
} from "./bracketOutlookSeparation";
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
  totalParticipantCount: number;
};

export type BracketOutlookVisibilityResult = {
  showOutlook: boolean;
  distribution: BracketOutlookDistributionSummary | null;
};

export function evaluateBracketOutlookVisibility(
  input: BracketOutlookVisibilityInput,
): BracketOutlookVisibilityResult {
  if (!input.picksLocked || input.hasAwardedPoints) {
    return { showOutlook: false, distribution: null };
  }
  if (input.completedMatchCount <= 0 || !bracketOutlookIsMeaningful(input.outlook)) {
    return { showOutlook: false, distribution: null };
  }

  const hasSeparation = bracketOutlookHasMeaningfulSeparation({
    outlook: input.outlook,
    totalParticipantCount: input.totalParticipantCount,
    completedMatchCount: input.completedMatchCount,
  });

  if (!hasSeparation || !input.outlook) {
    return { showOutlook: false, distribution: null };
  }

  return {
    showOutlook: true,
    distribution: computeBracketOutlookDistribution(
      input.outlook,
      input.totalParticipantCount,
    ),
  };
}

/** True when Bracket Outlook should replace the all-zero leaderboard table. */
export function shouldShowBracketOutlook(input: BracketOutlookVisibilityInput): boolean {
  return evaluateBracketOutlookVisibility(input).showOutlook;
}

/** True when locked pre-points pool should show the compact warming-up note. */
export function shouldShowStandingsWarmingNote(input: {
  picksLocked: boolean;
  hasAwardedPoints: boolean;
  completedMatchCount: number;
  showOutlook: boolean;
}): boolean {
  return (
    input.picksLocked &&
    !input.hasAwardedPoints &&
    !input.showOutlook &&
    input.completedMatchCount > 0
  );
}

export async function fetchPoolHasAwardedPointsSafe(poolId: string): Promise<boolean> {
  try {
    return await fetchPoolHasAwardedLeaderboardPoints(poolId);
  } catch {
    return false;
  }
}
