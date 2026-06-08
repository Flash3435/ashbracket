import type { PoolActivityFeedRow, PoolActivityType } from "./poolActivityTypes";

export type ActivityFeedFilter = "all" | "picks" | "recaps" | "announcements";

export const ACTIVITY_FEED_FILTERS: ActivityFeedFilter[] = [
  "all",
  "picks",
  "recaps",
  "announcements",
];

export const ACTIVITY_FEED_FILTER_LABELS: Record<ActivityFeedFilter, string> = {
  all: "All",
  picks: "Picks",
  recaps: "Recaps",
  announcements: "Announcements",
};

const PICKS_TYPES: ReadonlySet<PoolActivityType> = new Set([
  "participant_submitted_picks",
  "participant_updated_picks",
]);

export function poolActivityMatchesFeedFilter(
  type: PoolActivityType,
  filter: ActivityFeedFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "picks") return PICKS_TYPES.has(type);
  if (filter === "recaps") return type === "ash_daily_recap";
  if (filter === "announcements") return type === "announcement";
  return true;
}

export function filterActivityFeedItems(
  items: PoolActivityFeedRow[],
  filter: ActivityFeedFilter,
): PoolActivityFeedRow[] {
  if (filter === "all") return items;
  return items.filter((item) => poolActivityMatchesFeedFilter(item.type, filter));
}

export function parseActivityFeedFilter(raw: string | undefined): ActivityFeedFilter {
  const v = raw?.trim().toLowerCase();
  if (v === "picks" || v === "recaps" || v === "announcements") return v;
  return "all";
}
