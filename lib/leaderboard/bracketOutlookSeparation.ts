import type { BracketOutlookResult } from "./buildBracketOutlook";

/** Minimum decisive group results before a ranked outlook is shown. */
export const MIN_DECISIVE_MATCHES_FOR_OUTLOOK = 6;

/** Max share of pool participants that may tie for the top outlook score. */
export const MAX_TOP_TIE_SHARE = 0.5;

/** Min gap between top outlook score and median to justify a ranked list. */
export const MIN_TOP_VS_MEDIAN_GAP = 2;

export type BracketOutlookDistributionSummary = {
  topScore: number;
  topTieCount: number;
  topTieShare: number;
  medianScore: number;
  topVsMedianGap: number;
};

export function medianOutlookScore(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? 0;
  }
  const lower = sorted[mid - 1] ?? 0;
  const upper = sorted[mid] ?? 0;
  return (lower + upper) / 2;
}

/** All participant helpful-result scores (0 for brackets with no helped results). */
export function allParticipantOutlookScores(
  outlook: BracketOutlookResult,
  totalParticipantCount: number,
): number[] {
  const withHelp = outlook.entries.map((entry) => entry.helpedMatchCount);
  const zeroCount = Math.max(0, totalParticipantCount - withHelp.length);
  return [...withHelp, ...Array<number>(zeroCount).fill(0)];
}

export function computeBracketOutlookDistribution(
  outlook: BracketOutlookResult,
  totalParticipantCount: number,
): BracketOutlookDistributionSummary {
  const scores = allParticipantOutlookScores(outlook, totalParticipantCount);
  const topScore = outlook.entries[0]?.helpedMatchCount ?? 0;
  const topTieCount = scores.filter((score) => score === topScore).length;
  const topTieShare =
    totalParticipantCount > 0 ? topTieCount / totalParticipantCount : 1;
  const medianScore = medianOutlookScore(scores);
  const topVsMedianGap = topScore - medianScore;

  return {
    topScore,
    topTieCount,
    topTieShare,
    medianScore,
    topVsMedianGap,
  };
}

/**
 * True when the outlook spread is worth showing as a ranked list.
 * Requires enough decisive matches and either a small top tie group or a clear top-vs-median gap.
 */
export function bracketOutlookHasMeaningfulSeparation(input: {
  outlook: BracketOutlookResult | null;
  totalParticipantCount: number;
  completedMatchCount: number;
}): boolean {
  const { outlook, totalParticipantCount, completedMatchCount } = input;
  if (!outlook || outlook.entries.length === 0) return false;
  if (completedMatchCount < MIN_DECISIVE_MATCHES_FOR_OUTLOOK) return false;
  if (totalParticipantCount <= 0) return false;

  const dist = computeBracketOutlookDistribution(outlook, totalParticipantCount);
  const tieOk = dist.topTieShare <= MAX_TOP_TIE_SHARE;
  const gapOk = dist.topVsMedianGap >= MIN_TOP_VS_MEDIAN_GAP;
  return tieOk || gapOk;
}

export function formatTopOutlookGroupLine(
  summary: BracketOutlookDistributionSummary,
): string {
  const count = summary.topTieCount;
  const score = summary.topScore;
  const bracketLabel = count === 1 ? "bracket" : "brackets";
  const resultLabel =
    score === 1 ? "1 helpful result" : `${score} helpful results`;
  return `Top outlook group: ${count} ${bracketLabel} with ${resultLabel}`;
}

export function formatMedianOutlookLine(
  summary: BracketOutlookDistributionSummary,
): string {
  const median = summary.medianScore;
  const label =
    median === 1 ? "1 helpful result" : `${median} helpful results`;
  return `Median outlook: ${label}`;
}

export const STANDINGS_WARMING_UP_HEADLINE = "Standings are warming up";

export const STANDINGS_WARMING_UP_BODY =
  "Official points have not landed yet. Group-stage advancement points are awarded after each group is complete. Early match results are still tightly clustered, so this page will open up once there is a meaningful race.";

export const STANDINGS_WARMING_UP_DASHBOARD_NOTE =
  "Official points have not landed yet. Group-stage points are awarded after each group is complete. Early match results are still tightly clustered, so standings will appear once there is a meaningful race.";
