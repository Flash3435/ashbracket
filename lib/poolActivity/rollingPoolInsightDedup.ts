import type { PoolActivityFeedRow } from "./poolActivityTypes";
import {
  rollingInsightDedupBucket,
  rollingInsightSortScore,
} from "./rollingPoolInsightKeys";

/**
 * Keeps one rolling pool insight per pool/kind/day (newest or highest count).
 * Safe for legacy rows whose source_key embedded the count.
 */
export function dedupeRollingPoolInsights<T extends PoolActivityFeedRow>(
  items: T[],
  getPoolId: (item: T) => string,
): T[] {
  const winners = new Map<string, T>();

  for (const item of items) {
    const bucket = rollingInsightDedupBucket(item, getPoolId(item));
    if (!bucket) continue;

    const prev = winners.get(bucket);
    if (!prev) {
      winners.set(bucket, item);
      continue;
    }

    const prevScore = rollingInsightSortScore(prev);
    const nextScore = rollingInsightSortScore(item);
    if (nextScore > prevScore) {
      winners.set(bucket, item);
      continue;
    }
    if (
      nextScore === prevScore &&
      Date.parse(item.created_at) > Date.parse(prev.created_at)
    ) {
      winners.set(bucket, item);
    }
  }

  if (winners.size === 0) return items;

  const hiddenIds = new Set<string>();
  for (const item of items) {
    const bucket = rollingInsightDedupBucket(item, getPoolId(item));
    if (!bucket) continue;
    const winner = winners.get(bucket);
    if (winner && winner.id !== item.id) hiddenIds.add(item.id);
  }

  if (hiddenIds.size === 0) return items;
  return items.filter((item) => !hiddenIds.has(item.id));
}
