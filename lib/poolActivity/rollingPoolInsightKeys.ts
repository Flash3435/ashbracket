import { recapCalendarDateYmdEdmonton } from "./recapCalendarDate";
import type { PoolActivityFeedRow } from "./poolActivityTypes";

/** Rolling pre-lock insight kinds that should dedupe per pool per day. */
export type RollingInsightKind =
  | "activity_heat"
  | "pick_updates"
  | "joins"
  | "remaining";

export function preLockRollingSourceKey(
  kind: RollingInsightKind,
  dayYmd: string,
): string {
  switch (kind) {
    case "activity_heat":
      return `prelock_activity_heat:${dayYmd}`;
    case "pick_updates":
      return `prelock_pick_updates:${dayYmd}`;
    case "joins":
      return `prelock_joins:${dayYmd}`;
    case "remaining":
      return `prelock_remaining:${dayYmd}`;
  }
}

function sourceKeyFromItem(item: PoolActivityFeedRow): string | null {
  const sk = item.metadata_json.source_key;
  return typeof sk === "string" && sk.trim() ? sk.trim() : null;
}

/** Maps legacy and stable source keys to a rolling insight kind, or null when not rolling. */
export function parseRollingInsightKind(
  sourceKey: string | null | undefined,
): RollingInsightKind | null {
  if (!sourceKey) return null;
  if (sourceKey.startsWith("prelock_activity_heat:")) return "activity_heat";
  if (sourceKey.startsWith("prelock_pick_updates:")) return "pick_updates";
  if (sourceKey.startsWith("prelock_joins:")) return "joins";
  if (sourceKey.startsWith("prelock_remaining:")) return "remaining";
  if (sourceKey.startsWith("prelock_activity_today_")) return "activity_heat";
  if (sourceKey.startsWith("prelock_updates_today_")) return "pick_updates";
  if (sourceKey.startsWith("prelock_joins_today_")) return "joins";
  if (sourceKey.startsWith("prelock_remaining_")) return "remaining";
  return null;
}

/** Edmonton calendar day for a rolling insight row. */
export function rollingInsightDayKey(
  sourceKey: string,
  createdAt: string,
): string {
  const colonIdx = sourceKey.indexOf(":");
  if (colonIdx >= 0) {
    const day = sourceKey.slice(colonIdx + 1).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  }
  return recapCalendarDateYmdEdmonton(new Date(createdAt));
}

export function rollingInsightDedupBucket(
  item: PoolActivityFeedRow,
  poolId: string,
): string | null {
  if (item.type !== "pool_insight") return null;
  const sk = sourceKeyFromItem(item);
  const kind = parseRollingInsightKind(sk);
  if (!kind || !sk) return null;
  const day = rollingInsightDayKey(sk, item.created_at);
  return `${poolId}\0${kind}\0${day}`;
}

/** Higher = more current for feed dedupe (newest row wins on ties). */
export function rollingInsightSortScore(item: PoolActivityFeedRow): number {
  const meta = item.metadata_json;
  if (typeof meta.activity_today === "number") return meta.activity_today;
  if (typeof meta.updates_today === "number") return meta.updates_today;
  if (typeof meta.joins_last_24h === "number") return meta.joins_last_24h;
  if (typeof meta.remaining_count === "number") {
    // Lower remaining is more current; invert so max() picks the latest state.
    return 10_000 - meta.remaining_count;
  }
  const sk = sourceKeyFromItem(item);
  const legacy = sk?.match(/_(\d+)$/);
  if (legacy) {
    const n = parseInt(legacy[1]!, 10);
    if (sk?.startsWith("prelock_remaining_")) return 10_000 - n;
    return n;
  }
  return Date.parse(item.created_at);
}
