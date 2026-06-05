import type { PoolActivityType } from "./poolActivityTypes";
import type { GlobalPoolActivityFeedRow } from "./globalActivityTypes";

export type GlobalActivityFeedFilter =
  | "all"
  | "picks"
  | "joins"
  | "recaps"
  | "milestones"
  | "announcements";

export const GLOBAL_ACTIVITY_FEED_FILTERS: GlobalActivityFeedFilter[] = [
  "all",
  "picks",
  "joins",
  "recaps",
  "milestones",
  "announcements",
];

export const GLOBAL_ACTIVITY_FEED_FILTER_LABELS: Record<
  GlobalActivityFeedFilter,
  string
> = {
  all: "All",
  picks: "Picks",
  joins: "Joins",
  recaps: "Recaps",
  milestones: "Milestones",
  announcements: "Announcements",
};

const PICKS_TYPES: ReadonlySet<PoolActivityType> = new Set([
  "participant_submitted_picks",
  "participant_updated_picks",
]);

export function globalActivityMatchesFeedFilter(
  type: PoolActivityType,
  filter: GlobalActivityFeedFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "picks") return PICKS_TYPES.has(type);
  if (filter === "joins") return type === "participant_joined";
  if (filter === "recaps") return type === "ash_daily_recap";
  if (filter === "milestones") return type === "pool_milestone";
  if (filter === "announcements") return type === "announcement";
  return true;
}

export function filterGlobalActivityFeedItems(
  items: GlobalPoolActivityFeedRow[],
  filter: GlobalActivityFeedFilter,
): GlobalPoolActivityFeedRow[] {
  if (filter === "all") return items;
  return items.filter((item) =>
    globalActivityMatchesFeedFilter(item.type, filter),
  );
}

export function filterGlobalActivityByParticipantName(
  items: GlobalPoolActivityFeedRow[],
  query: string,
): GlobalPoolActivityFeedRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const name = item.participant_display_name?.trim().toLowerCase() ?? "";
    return name.includes(q);
  });
}

export function parseGlobalActivityFeedFilter(
  raw: string | undefined,
): GlobalActivityFeedFilter {
  const v = raw?.trim().toLowerCase();
  if (
    v === "picks" ||
    v === "joins" ||
    v === "recaps" ||
    v === "milestones" ||
    v === "announcements"
  ) {
    return v;
  }
  return "all";
}
