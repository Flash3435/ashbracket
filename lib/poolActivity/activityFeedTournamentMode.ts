import { poolLocked } from "../pools/poolLocked";
import {
  activityDisplayPriority,
  type ActivityDisplayPriority,
} from "./activityFeedDisplayPriority";
import {
  isActivityDisplayItem,
  isGroupedSystemActivityDisplayItem,
  type GlobalActivityDisplayItem,
  type PoolActivityDisplayItem,
} from "./activityFeedDisplayTypes";
import type { ActivityFeedFilter } from "./activityFeedFilter";
import { isGroupableCompletionMilestone } from "./activityFeedGrouping";
import type { PoolActivityFeedRow } from "./poolActivityTypes";

export const COMPLETION_RECAP_KIND = "completion_progress" as const;

const LOCK_REVEAL_MILESTONE_KEYS = new Set([
  "lock_passed",
  "picks_locked_insights",
  "pool_reveal_open",
]);

const PRIORITY_RANK: Record<ActivityDisplayPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function jsonFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** True for post-lock milestone rows that should link to pool reveal. */
export function isLockRevealMilestoneSourceKey(
  sourceKey: string | null | undefined,
): boolean {
  return typeof sourceKey === "string" && LOCK_REVEAL_MILESTONE_KEYS.has(sourceKey);
}

/**
 * Daily recap rows that only report bracket completion progress (not score impact).
 * Uses `metadata_json.recap_kind` when present; legacy rows without it are treated as completion-only.
 */
export function isCompletionOnlyAshDailyRecap(
  item: Pick<PoolActivityFeedRow, "type" | "metadata_json">,
): boolean {
  if (item.type !== "ash_daily_recap") return false;
  const kind = item.metadata_json.recap_kind;
  if (kind === "tournament" || kind === "score_impact") return false;
  const pc = jsonFiniteNumber(item.metadata_json.participant_count);
  const sc = jsonFiniteNumber(item.metadata_json.submitted_count);
  if (pc !== null && sc !== null) return true;
  if (typeof item.metadata_json.recap_date === "string") return true;
  return kind === COMPLETION_RECAP_KIND;
}

export function isGroupedCompletionMilestoneSummary(
  item: PoolActivityDisplayItem | GlobalActivityDisplayItem,
): boolean {
  return (
    isGroupedSystemActivityDisplayItem(item) && item.label === "MILESTONE SUMMARY"
  );
}

export function isPoolLockedAt(
  lockAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  return poolLocked(lockAt, nowMs);
}

export function shouldGenerateCompletionDailyRecap(
  lockAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  return !isPoolLockedAt(lockAt, nowMs);
}

/** Hide completion-progress cards from the default All feed once picks are locked. */
export function shouldHideInDefaultAllFeedAfterLock(
  item: PoolActivityDisplayItem | GlobalActivityDisplayItem,
  filter: ActivityFeedFilter | "all",
  options: { poolLocked: boolean },
): boolean {
  if (filter !== "all" || !options.poolLocked) return false;

  if (isGroupedCompletionMilestoneSummary(item)) return true;

  if (!isActivityDisplayItem(item)) return false;

  if (isCompletionOnlyAshDailyRecap(item)) return true;

  if (item.type === "pool_milestone" && isGroupableCompletionMilestone(item)) {
    return true;
  }

  return false;
}

export function applyPostLockDefaultAllFeedFilter<
  T extends PoolActivityDisplayItem | GlobalActivityDisplayItem,
>(
  items: T[],
  filter: ActivityFeedFilter | "all",
  options: { poolLocked: boolean },
): T[] {
  if (filter !== "all" || !options.poolLocked) return items;
  return items.filter(
    (item) => !shouldHideInDefaultAllFeedAfterLock(item, filter, options),
  );
}

function displayItemCreatedAt(
  item: PoolActivityDisplayItem | GlobalActivityDisplayItem,
): string {
  if (isGroupedSystemActivityDisplayItem(item)) return item.createdAt;
  return item.created_at;
}

function activityRowFromDisplayItem(
  item: PoolActivityDisplayItem | GlobalActivityDisplayItem,
): PoolActivityFeedRow | null {
  if (!isActivityDisplayItem(item)) return null;
  const { kind: _kind, ...row } = item;
  return row;
}

function priorityForDisplayItem(
  item: PoolActivityDisplayItem | GlobalActivityDisplayItem,
  poolLockedNow: boolean,
): ActivityDisplayPriority {
  const row = activityRowFromDisplayItem(item);
  if (!row) {
    return poolLockedNow ? "low" : "medium";
  }
  return activityDisplayPriority(row, { poolLocked: poolLockedNow });
}

/** After lock, float tournament-mode cards above older join/pick noise in All view. */
export function sortDisplayItemsForPostLockTournamentMode<
  T extends PoolActivityDisplayItem | GlobalActivityDisplayItem,
>(items: T[], options: { poolLocked: boolean }): T[] {
  if (!options.poolLocked) return items;
  return [...items].sort((a, b) => {
    const pa = priorityForDisplayItem(a, true);
    const pb = priorityForDisplayItem(b, true);
    const rankDiff = PRIORITY_RANK[pa] - PRIORITY_RANK[pb];
    if (rankDiff !== 0) return rankDiff;
    return (
      Date.parse(displayItemCreatedAt(b)) - Date.parse(displayItemCreatedAt(a))
    );
  });
}

export function applyPostLockDefaultAllFeedFilterForGlobal<
  T extends GlobalActivityDisplayItem,
>(
  items: T[],
  filter: ActivityFeedFilter | "all" | "joins" | "milestones",
  options: {
    lockAtByPoolId: Record<string, string | null | undefined>;
    nowMs?: number;
  },
): T[] {
  if (filter !== "all") return items;
  const nowMs = options.nowMs ?? Date.now();
  return items.filter((item) => {
    const poolId = isGroupedSystemActivityDisplayItem(item)
      ? item.poolId
      : isActivityDisplayItem(item)
        ? item.pool_id
        : null;
    if (!poolId) return true;
    const locked = isPoolLockedAt(options.lockAtByPoolId[poolId], nowMs);
    return !shouldHideInDefaultAllFeedAfterLock(item, filter, { poolLocked: locked });
  });
}

export function sortGlobalDisplayItemsForPostLockTournamentMode<
  T extends GlobalActivityDisplayItem,
>(
  items: T[],
  options: {
    lockAtByPoolId: Record<string, string | null | undefined>;
    nowMs?: number;
  },
): T[] {
  const nowMs = options.nowMs ?? Date.now();
  return [...items].sort((a, b) => {
    const poolIdA = isGroupedSystemActivityDisplayItem(a)
      ? a.poolId
      : isActivityDisplayItem(a)
        ? a.pool_id
        : null;
    const poolIdB = isGroupedSystemActivityDisplayItem(b)
      ? b.poolId
      : isActivityDisplayItem(b)
        ? b.pool_id
        : null;
    const lockedA = poolIdA
      ? isPoolLockedAt(options.lockAtByPoolId[poolIdA], nowMs)
      : false;
    const lockedB = poolIdB
      ? isPoolLockedAt(options.lockAtByPoolId[poolIdB], nowMs)
      : false;
    if (!lockedA && !lockedB) {
      return Date.parse(displayItemCreatedAt(b)) - Date.parse(displayItemCreatedAt(a));
    }
    const pa = lockedA ? priorityForDisplayItem(a, true) : "medium";
    const pb = lockedB ? priorityForDisplayItem(b, true) : "medium";
    const rankDiff = PRIORITY_RANK[pa] - PRIORITY_RANK[pb];
    if (rankDiff !== 0) return rankDiff;
    return (
      Date.parse(displayItemCreatedAt(b)) - Date.parse(displayItemCreatedAt(a))
    );
  });
}
