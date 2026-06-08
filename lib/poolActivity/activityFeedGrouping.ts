import type {
  GlobalActivityDisplayItem,
  GroupedSystemActivityChild,
  GroupedSystemActivityDisplayItem,
  PoolActivityDisplayItem,
} from "./activityFeedDisplayTypes";
import type { GlobalPoolActivityFeedRow } from "./globalActivityTypes";
import type { PoolActivityFeedRow } from "./poolActivityTypes";
import { activityDisplayPriority } from "./activityFeedDisplayPriority";
import { dedupeRollingPoolInsights } from "./rollingPoolInsightDedup";

export type ActivityFeedGroupingMode = "strict" | "light" | "none";

const COMPLETION_MILESTONE_PREFIX = "completion_";
const COMPLETION_COUNT_PREFIX = "completion_count_";

const NON_GROUPABLE_MILESTONE_KEYS = new Set([
  "lock_passed",
  "picks_locked_insights",
  "lock_tomorrow",
  "lock_today",
  "lock_soon",
]);

const MAX_GROUP_LABELS = 5;

function sourceKey(item: PoolActivityFeedRow): string | null {
  const sk = item.metadata_json.source_key;
  return typeof sk === "string" && sk.trim() ? sk.trim() : null;
}

/** True for completion/progress pool milestones that may be grouped. */
export function isGroupableCompletionMilestone(item: PoolActivityFeedRow): boolean {
  if (item.type !== "pool_milestone") return false;
  const sk = sourceKey(item);
  if (!sk) return false;
  if (NON_GROUPABLE_MILESTONE_KEYS.has(sk)) return false;
  if (sk.startsWith(COMPLETION_COUNT_PREFIX)) return true;
  if (sk.startsWith(COMPLETION_MILESTONE_PREFIX)) return true;
  return false;
}

function dateKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toISOString().slice(0, 10);
}

/** Short label for grouped completion milestone summaries. */
export function milestoneShortLabel(item: PoolActivityFeedRow): string {
  const sk = sourceKey(item);
  const meta = item.metadata_json;

  if (sk?.startsWith(COMPLETION_COUNT_PREFIX)) {
    const n = sk.slice(COMPLETION_COUNT_PREFIX.length);
    if (/^\d+$/.test(n)) return `${n} complete`;
  }

  switch (sk) {
    case "completion_50":
      return "Half complete";
    case "completion_75":
      return "75% complete";
    case "completion_100":
      return "All complete";
    case "completion_remaining_le3": {
      const remaining = meta.remaining_count;
      if (typeof remaining === "number" && remaining > 0) {
        return `Only ${remaining} left`;
      }
      return "Almost done";
    }
    default:
      break;
  }

  const completed = meta.completed_count;
  if (typeof completed === "number" && completed > 0) {
    return `${completed} complete`;
  }

  const trimmed = item.body_text.trim();
  return trimmed.length > 48 ? `${trimmed.slice(0, 45)}…` : trimmed;
}

function childFromRow(item: PoolActivityFeedRow): GroupedSystemActivityChild {
  const sk = sourceKey(item);
  return {
    id: item.id,
    type: item.type,
    sourceKey: sk ?? undefined,
    shortLabel: milestoneShortLabel(item),
    body: item.body_text,
    createdAt: item.created_at,
  };
}

export function groupedCompletionMilestoneId(
  poolId: string,
  dayKey: string,
): string {
  return `group:completion-milestones:${poolId}:${dayKey}`;
}

function sortChildrenNewestFirst(
  children: GroupedSystemActivityChild[],
): GroupedSystemActivityChild[] {
  return [...children].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

function buildGroupedItem(
  poolId: string,
  poolName: string | undefined,
  dayKey: string,
  children: GroupedSystemActivityChild[],
): GroupedSystemActivityDisplayItem {
  const sorted = sortChildrenNewestFirst(children);
  const visible = sorted.slice(0, MAX_GROUP_LABELS);
  const hiddenCount = Math.max(0, sorted.length - visible.length);

  return {
    kind: "grouped_system_activity",
    id: groupedCompletionMilestoneId(poolId, dayKey),
    poolId,
    poolName,
    createdAt: sorted[0]?.createdAt ?? new Date().toISOString(),
    label: "MILESTONE SUMMARY",
    icon: "🎉",
    items: visible,
    hiddenCount,
  };
}

type GroupCandidate<T extends PoolActivityFeedRow> = {
  poolId: string;
  poolName?: string;
  dayKey: string;
  row: T;
  index: number;
};

function collectCompletionMilestones<T extends PoolActivityFeedRow>(
  items: T[],
  getPoolId: (item: T) => string,
  getPoolName?: (item: T) => string | undefined,
): GroupCandidate<T>[] {
  const out: GroupCandidate<T>[] = [];
  items.forEach((row, index) => {
    if (!isGroupableCompletionMilestone(row)) return;
    out.push({
      poolId: getPoolId(row),
      poolName: getPoolName?.(row),
      dayKey: dateKeyFromIso(row.created_at),
      row,
      index,
    });
  });
  return out;
}

function groupKey(poolId: string, dayKey: string): string {
  return `${poolId}\0${dayKey}`;
}

function shouldGroupBucket(
  bucket: GroupCandidate<PoolActivityFeedRow>[],
  mode: ActivityFeedGroupingMode,
): boolean {
  if (bucket.length < 2) return false;
  if (mode === "strict") return true;

  // Light mode: group obvious bursts (3+ same pool/day, or 2+ consecutive in feed).
  if (bucket.length >= 3) return true;

  const indices = bucket.map((b) => b.index).sort((a, b) => a - b);
  for (let i = 1; i < indices.length; i++) {
    if (indices[i]! - indices[i - 1]! === 1) return true;
  }
  return false;
}

function selectBucketsToGroup<T extends PoolActivityFeedRow>(
  candidates: GroupCandidate<T>[],
  mode: ActivityFeedGroupingMode,
): Map<string, GroupCandidate<T>[]> {
  const byKey = new Map<string, GroupCandidate<T>[]>();
  for (const c of candidates) {
    const key = groupKey(c.poolId, c.dayKey);
    const list = byKey.get(key) ?? [];
    list.push(c);
    byKey.set(key, list);
  }

  const grouped = new Map<string, GroupCandidate<T>[]>();
  for (const [key, bucket] of byKey) {
    if (shouldGroupBucket(bucket, mode)) {
      grouped.set(key, bucket);
    }
  }
  return grouped;
}

function strictHiddenCompletionIds<T extends PoolActivityFeedRow>(
  items: T[],
  groupedBuckets: Map<string, GroupCandidate<T>[]>,
  groupedItemIds: Set<string>,
  getPoolId: (item: T) => string,
): Set<string> {
  const hidden = new Set<string>(groupedItemIds);
  const groupedPoolDays = new Set<string>();
  for (const bucket of groupedBuckets.values()) {
    if (bucket.length >= 2) {
      groupedPoolDays.add(groupKey(bucket[0]!.poolId, bucket[0]!.dayKey));
    }
  }
  for (const row of items) {
    if (!isGroupableCompletionMilestone(row)) continue;
    if (activityDisplayPriority(row) !== "low") continue;
    const key = groupKey(getPoolId(row), dateKeyFromIso(row.created_at));
    if (groupedPoolDays.has(key)) hidden.add(row.id);
  }
  return hidden;
}

function applyGroupingPass<T extends PoolActivityFeedRow>(
  items: T[],
  mode: ActivityFeedGroupingMode,
  getPoolId: (item: T) => string,
  getPoolName?: (item: T) => string | undefined,
): Array<({ kind: "activity" } & T) | GroupedSystemActivityDisplayItem> {
  const deduped = dedupeRollingPoolInsights(items, getPoolId);

  if (mode === "none") {
    return deduped.map((row) => ({ kind: "activity" as const, ...row }));
  }

  const candidates = collectCompletionMilestones(deduped, getPoolId, getPoolName);
  const groupedBuckets = selectBucketsToGroup(candidates, mode);
  const groupedItemIds = new Set<string>();
  const groupedItemsByInsertIndex = new Map<
    number,
    GroupedSystemActivityDisplayItem
  >();

  for (const bucket of groupedBuckets.values()) {
    const poolId = bucket[0]!.poolId;
    const dayKey = bucket[0]!.dayKey;
    const poolName = bucket[0]!.poolName;
    const children = bucket.map((c) => childFromRow(c.row));
    const grouped = buildGroupedItem(poolId, poolName, dayKey, children);
    const insertIndex = Math.min(...bucket.map((c) => c.index));
    groupedItemsByInsertIndex.set(insertIndex, grouped);
    for (const c of bucket) groupedItemIds.add(c.row.id);
  }

  const hiddenIds =
    mode === "strict"
      ? strictHiddenCompletionIds(deduped, groupedBuckets, groupedItemIds, getPoolId)
      : groupedItemIds;

  const out: Array<({ kind: "activity" } & T) | GroupedSystemActivityDisplayItem> =
    [];

  deduped.forEach((row, index) => {
    const groupedAtIndex = groupedItemsByInsertIndex.get(index);
    if (groupedAtIndex) {
      out.push(groupedAtIndex);
      return;
    }
    if (groupedItemIds.has(row.id)) return;
    if (hiddenIds.has(row.id) && !groupedItemsByInsertIndex.has(index)) return;
    out.push({ kind: "activity", ...row });
  });

  return out;
}

export function applyPoolActivityFeedGrouping(
  items: PoolActivityFeedRow[],
  mode: ActivityFeedGroupingMode,
  poolId = "pool",
): PoolActivityDisplayItem[] {
  return applyGroupingPass(items, mode, () => poolId, undefined);
}

export function applyGlobalActivityFeedGrouping(
  items: GlobalPoolActivityFeedRow[],
  mode: ActivityFeedGroupingMode,
): GlobalActivityDisplayItem[] {
  return applyGroupingPass(
    items,
    mode,
    (item) => item.pool_id,
    (item) => item.pool_name,
  );
}

export function groupedMilestoneSummaryHeadline(
  item: GroupedSystemActivityDisplayItem,
): string {
  const count = item.items.length + item.hiddenCount;
  if (count <= 1) {
    return item.items[0]?.body ?? "Completion milestone update.";
  }
  if (item.hiddenCount === 0 && count <= 3) {
    return `This pool hit ${count} completion milestone${count === 1 ? "" : "s"}.`;
  }
  return `This pool hit ${count} completion milestones.`;
}

export function groupedMilestoneSummaryLabels(
  item: GroupedSystemActivityDisplayItem,
): string {
  const labels = item.items.map((c) => c.shortLabel);
  if (item.hiddenCount > 0) {
    labels.push(`+ ${item.hiddenCount} more`);
  }
  return labels.join(" · ");
}
