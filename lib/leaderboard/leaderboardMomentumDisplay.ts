import { formatPoolPoints } from "@/lib/format/poolPoints";
import type { LeaderboardMomentumRow } from "./buildLeaderboardMomentum";
import type { LeaderboardLatestPointsBreakdown } from "./computeLatestMatchPointsBreakdown";
import type { LeaderboardLatestScoreEventContext } from "./parseLatestScoreEventContext";

function formatSignedDeltaBadge(points: number, suffix: string): string {
  const abs = formatPoolPoints(Math.abs(points));
  if (points > 0) return `(+${abs}${suffix})`;
  return `(−${abs}${suffix})`;
}

export function formatRankMovementIndicator(
  momentum: LeaderboardMomentumRow | null | undefined,
): string | null {
  if (!momentum) return null;
  if (momentum.isNewEntry) return "NEW";
  if (momentum.rankChange > 0) return `↑${momentum.rankChange}`;
  if (momentum.rankChange < 0) return `↓${Math.abs(momentum.rankChange)}`;
  return "→";
}

export function rankMovementIndicatorClass(
  momentum: LeaderboardMomentumRow | null | undefined,
): string {
  if (!momentum) return "text-ash-muted";
  if (momentum.isNewEntry) return "text-sky-300";
  if (momentum.rankChange > 0) return "text-emerald-400";
  if (momentum.rankChange < 0) return "text-amber-400";
  return "text-ash-muted/80";
}

export function formatRecentPointsDelta(
  momentum: LeaderboardMomentumRow | null | undefined,
  options?: {
    showZero?: boolean;
    latestSuffix?: boolean;
    refreshSuffix?: boolean;
    pointsBreakdown?: LeaderboardLatestPointsBreakdown | null;
    event?: LeaderboardLatestScoreEventContext | null;
  },
): string | null {
  if (!momentum) return null;

  const isMatchAttributed =
    options?.event?.eventKind === "single_match" ||
    options?.event?.eventKind === "multi_match";
  const matchDelta = options?.pointsBreakdown?.latestMatchPointsDelta;

  if (isMatchAttributed && matchDelta != null) {
    if (matchDelta === 0) {
      return options?.showZero ? "(+0)" : null;
    }
    return formatSignedDeltaBadge(matchDelta, " latest");
  }

  if (
    !isMatchAttributed &&
    (options?.pointsBreakdown?.thirdPlaceQualifierDelta ?? 0) > 0
  ) {
    return null;
  }

  const isMixed = options?.pointsBreakdown?.isMixedUpdate === true;
  const matchEqualsTotal =
    matchDelta != null && matchDelta === momentum.recentPointsGained;

  let suffix = "";
  if (options?.refreshSuffix || isMixed) {
    suffix = " since last update";
  } else if (options?.latestSuffix && isMatchAttributed && matchEqualsTotal) {
    suffix = " latest";
  } else if (options?.latestSuffix && !isMatchAttributed) {
    suffix = " latest";
  } else if (options?.latestSuffix && isMatchAttributed) {
    // Match event without a separate match attribution — still a "latest" delta.
    suffix = " latest";
  }

  if (momentum.recentPointsGained === 0) {
    return options?.showZero ? `(+0${suffix})` : null;
  }
  return formatSignedDeltaBadge(momentum.recentPointsGained, suffix);
}

export function formatPointsWithRecentDelta(
  totalPoints: number,
  momentum: LeaderboardMomentumRow | null | undefined,
  options?: {
    showZero?: boolean;
    latestSuffix?: boolean;
    refreshSuffix?: boolean;
    pointsBreakdown?: LeaderboardLatestPointsBreakdown | null;
    event?: LeaderboardLatestScoreEventContext | null;
  },
): string {
  const base = `${formatPoolPoints(totalPoints)} pts`;
  const delta = formatRecentPointsDelta(momentum, options);
  return delta ? `${base} ${delta}` : base;
}

export function formatExpandedMomentumContext(
  momentum: LeaderboardMomentumRow | null | undefined,
): string | null {
  if (!momentum) return null;
  if (momentum.isNewEntry) {
    return "New on the leaderboard after recent scoring updates.";
  }
  if (momentum.rankChange > 0) {
    const places = momentum.rankChange === 1 ? "place" : "places";
    return `Moved up ${momentum.rankChange} ${places} after recent scoring updates.`;
  }
  if (momentum.rankChange < 0) {
    const places = Math.abs(momentum.rankChange) === 1 ? "place" : "places";
    return `Moved down ${Math.abs(momentum.rankChange)} ${places} after recent scoring updates.`;
  }
  return "No leaderboard movement after recent matches.";
}

export function formatBiggestMoverLine(
  row: LeaderboardMomentumRow,
  displayName: string,
): string {
  if (row.isNewEntry) return `${displayName} (new)`;
  if (row.rankChange > 0) {
    const places = row.rankChange === 1 ? "place" : "places";
    return `↑ ${displayName} (+${row.rankChange} ${places})`;
  }
  const places = Math.abs(row.rankChange) === 1 ? "place" : "places";
  return `↓ ${displayName} (-${Math.abs(row.rankChange)} ${places})`;
}
