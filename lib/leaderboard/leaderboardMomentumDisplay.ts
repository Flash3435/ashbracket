import { formatPoolPoints } from "@/lib/format/poolPoints";
import type { LeaderboardMomentumRow } from "./buildLeaderboardMomentum";

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
  options?: { showZero?: boolean },
): string | null {
  if (!momentum) return null;
  if (momentum.recentPointsGained <= 0) {
    return options?.showZero ? "(+0)" : null;
  }
  const delta = formatPoolPoints(momentum.recentPointsGained);
  return `(+${delta})`;
}

export function formatPointsWithRecentDelta(
  totalPoints: number,
  momentum: LeaderboardMomentumRow | null | undefined,
  options?: { showZero?: boolean },
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
