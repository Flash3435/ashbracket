import type { BracketOutlookEntry, BracketOutlookResult } from "./buildBracketOutlook";

/** Minimum decisive group results before a ranked outlook is shown. */
export const MIN_DECISIVE_MATCHES_FOR_OUTLOOK = 6;

/** Max share of pool participants that may tie for the top outlook score. */
export const MAX_TOP_TIE_SHARE = 0.5;

/** Min gap between top outlook score and median to justify a ranked list. */
export const MIN_TOP_VS_MEDIAN_GAP = 2;

/** Max distribution rows shown in the outlook summary. */
export const MAX_OUTLOOK_DISTRIBUTION_BUCKETS = 4;

/** Top distinct helpful-result counts shown before combining the rest. */
export const TOP_OUTLOOK_DISTINCT_SCORES = 3;

/** Top group counts at or below this show names in the summary line. */
export const TOP_OUTLOOK_GROUP_SMALL_THRESHOLD = 5;

/** Sample names in the top-group summary line when the group is small. */
export const TOP_OUTLOOK_GROUP_SAMPLE_NAMES = 3;

/** Max names in the optional top-names list on the full outlook page. */
export const TOP_OUTLOOK_NAMES_MAX = 5;

export type BracketOutlookDistributionSummary = {
  topScore: number;
  topTieCount: number;
  topTieShare: number;
  medianScore: number;
  topVsMedianGap: number;
};

export type BracketOutlookDistributionBucket = {
  label: string;
  bracketCount: number;
};

export type BracketOutlookTopNameEntry = {
  displayName: string;
  helpedMatchCount: number;
};

export type BracketOutlookViewerContext = {
  displayName: string;
  helpedMatchCount: number;
  inTopGroup: boolean;
  behindTopGroup: number;
  aheadCount: number;
};

export type BracketOutlookSummary = BracketOutlookDistributionSummary & {
  topGroupSampleNames: string[];
  distributionBuckets: BracketOutlookDistributionBucket[];
  topNames: BracketOutlookTopNameEntry[];
  topNamesUsesSampleLabel: boolean;
  viewer: BracketOutlookViewerContext | null;
};

export type BracketOutlookViewerInput = {
  participantId: string;
  displayName: string;
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

export function formatHelpfulResultsCount(count: number): string {
  return count === 1 ? "1 helpful result" : `${count} helpful results`;
}

function outlookScoreHistogram(
  outlook: BracketOutlookResult,
  totalParticipantCount: number,
): Map<number, number> {
  const scores = allParticipantOutlookScores(outlook, totalParticipantCount);
  const histogram = new Map<number, number>();
  for (const score of scores) {
    histogram.set(score, (histogram.get(score) ?? 0) + 1);
  }
  return histogram;
}

/** Groups scores into at most four display buckets (top 3 distinct counts + combined rest). */
export function computeOutlookDistributionBuckets(
  outlook: BracketOutlookResult,
  totalParticipantCount: number,
): BracketOutlookDistributionBucket[] {
  const histogram = outlookScoreHistogram(outlook, totalParticipantCount);
  const distinctScores = [...histogram.keys()].sort((a, b) => b - a);
  if (distinctScores.length === 0) return [];

  const buckets: BracketOutlookDistributionBucket[] = [];
  const topScores = distinctScores.slice(0, TOP_OUTLOOK_DISTINCT_SCORES);
  for (const score of topScores) {
    buckets.push({
      label: formatHelpfulResultsCount(score),
      bracketCount: histogram.get(score) ?? 0,
    });
  }

  const remainingScores = distinctScores.slice(TOP_OUTLOOK_DISTINCT_SCORES);
  if (remainingScores.length > 0) {
    const cutoff = remainingScores[0] ?? 0;
    let combinedCount = 0;
    for (const score of remainingScores) {
      combinedCount += histogram.get(score) ?? 0;
    }
    buckets.push({
      label: `${cutoff} or fewer`,
      bracketCount: combinedCount,
    });
  }

  return buckets.slice(0, MAX_OUTLOOK_DISTRIBUTION_BUCKETS);
}

function formatNameList(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Summary line for the top outlook group section. */
export function formatTopOutlookGroupSummary(
  summary: Pick<
    BracketOutlookSummary,
    "topScore" | "topTieCount" | "topGroupSampleNames"
  >,
): string {
  const resultLabel = formatHelpfulResultsCount(summary.topScore);
  if (summary.topTieCount <= TOP_OUTLOOK_GROUP_SMALL_THRESHOLD) {
    const names = summary.topGroupSampleNames.slice(0, summary.topTieCount);
    if (names.length > 0) {
      return `${formatNameList(names)} ${summary.topTieCount === 1 ? "has" : "have"} ${resultLabel}.`;
    }
  }
  const bracketLabel = summary.topTieCount === 1 ? "bracket" : "brackets";
  return `${summary.topTieCount} ${bracketLabel} have ${resultLabel}.`;
}

export function formatDistributionBucketLine(
  bucket: BracketOutlookDistributionBucket,
): string {
  const bracketLabel = bucket.bracketCount === 1 ? "bracket" : "brackets";
  return `${bucket.label} — ${bucket.bracketCount} ${bracketLabel}`;
}

export function formatViewerBehindTopGroupLine(behindTopGroup: number): string {
  if (behindTopGroup <= 0) {
    return "You're in the top outlook group.";
  }
  const label =
    behindTopGroup === 1
      ? "1 helpful result"
      : `${behindTopGroup} helpful results`;
  return `You're ${label} behind the top outlook group.`;
}

export function formatDashboardTopGroupLine(
  summary: Pick<BracketOutlookSummary, "topScore" | "topTieCount">,
): string {
  const bracketLabel = summary.topTieCount === 1 ? "bracket" : "brackets";
  return `Top group: ${summary.topTieCount} ${bracketLabel} with ${formatHelpfulResultsCount(summary.topScore)}.`;
}

export function formatDashboardViewerLine(
  viewer: BracketOutlookViewerContext,
  topScore: number,
): string {
  const scoreLabel = formatHelpfulResultsCount(viewer.helpedMatchCount);
  if (viewer.inTopGroup) {
    return `Your bracket: ${scoreLabel} — in the top outlook group.`;
  }
  const behind = topScore - viewer.helpedMatchCount;
  const behindLabel = behind === 1 ? "1 behind" : `${behind} behind`;
  return `Your bracket: ${scoreLabel} — ${behindLabel} the top group.`;
}

function topGroupSampleNames(outlook: BracketOutlookResult, topScore: number): string[] {
  return outlook.entries
    .filter((entry) => entry.helpedMatchCount === topScore)
    .slice(0, TOP_OUTLOOK_GROUP_SAMPLE_NAMES)
    .map((entry) => entry.displayName);
}

function resolveViewerContext(
  outlook: BracketOutlookResult,
  topScore: number,
  totalParticipantCount: number,
  viewer?: BracketOutlookViewerInput | null,
): BracketOutlookViewerContext | null {
  if (!viewer?.participantId.trim()) return null;

  const entry = outlook.entries.find(
    (row) => row.participantId === viewer.participantId,
  );
  const helpedMatchCount = entry?.helpedMatchCount ?? 0;
  const displayName = entry?.displayName ?? viewer.displayName.trim();
  if (!displayName) return null;

  const scores = allParticipantOutlookScores(outlook, totalParticipantCount);
  const aheadCount = scores.filter((score) => score > helpedMatchCount).length;
  const inTopGroup = helpedMatchCount === topScore && topScore > 0;
  const behindTopGroup = inTopGroup ? 0 : Math.max(0, topScore - helpedMatchCount);

  return {
    displayName,
    helpedMatchCount,
    inTopGroup,
    behindTopGroup,
    aheadCount,
  };
}

/** Full outlook summary for page and dashboard views. */
export function computeBracketOutlookSummary(
  outlook: BracketOutlookResult,
  totalParticipantCount: number,
  viewer?: BracketOutlookViewerInput | null,
): BracketOutlookSummary {
  const distribution = computeBracketOutlookDistribution(outlook, totalParticipantCount);
  const topGroupSampleNamesList = topGroupSampleNames(outlook, distribution.topScore);
  const distributionBuckets = computeOutlookDistributionBuckets(
    outlook,
    totalParticipantCount,
  );
  const topNames: BracketOutlookTopNameEntry[] = outlook.entries
    .slice(0, TOP_OUTLOOK_NAMES_MAX)
    .map((entry: BracketOutlookEntry) => ({
      displayName: entry.displayName,
      helpedMatchCount: entry.helpedMatchCount,
    }));

  return {
    ...distribution,
    topGroupSampleNames: topGroupSampleNamesList,
    distributionBuckets,
    topNames,
    topNamesUsesSampleLabel: distribution.topTieCount > TOP_OUTLOOK_NAMES_MAX,
    viewer: resolveViewerContext(
      outlook,
      distribution.topScore,
      totalParticipantCount,
      viewer,
    ),
  };
}

export {
  STANDINGS_WARMING_UP_BODY,
  STANDINGS_WARMING_UP_DASHBOARD_NOTE,
  STANDINGS_WARMING_UP_HEADLINE,
} from "./leaderboardPageCopy";
