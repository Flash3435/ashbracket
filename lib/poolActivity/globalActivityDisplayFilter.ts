import type { GlobalActivityDisplayItem } from "./activityFeedDisplayTypes";
import { isActivityDisplayItem, isGroupedSystemActivityDisplayItem } from "./activityFeedDisplayTypes";
import {
  globalActivityMatchesFeedFilter,
  type GlobalActivityFeedFilter,
} from "./globalActivityFeedFilter";

export function globalActivityDisplayItemMatchesFeedFilter(
  item: GlobalActivityDisplayItem,
  filter: GlobalActivityFeedFilter,
  options?: { showAllSystemCards?: boolean },
): boolean {
  if (filter === "all") return true;

  if (isGroupedSystemActivityDisplayItem(item)) {
    if (filter === "milestones") return !options?.showAllSystemCards;
    return false;
  }

  if (filter === "milestones" && options?.showAllSystemCards) {
    return item.type === "pool_milestone" || item.type === "pool_insight";
  }

  return globalActivityMatchesFeedFilter(item.type, filter);
}

export function filterGlobalActivityDisplayItems(
  items: GlobalActivityDisplayItem[],
  filter: GlobalActivityFeedFilter,
  options?: { showAllSystemCards?: boolean },
): GlobalActivityDisplayItem[] {
  if (filter === "all") return items;
  return items.filter((item) =>
    globalActivityDisplayItemMatchesFeedFilter(item, filter, options),
  );
}

export function filterGlobalActivityDisplayByParticipantName(
  items: GlobalActivityDisplayItem[],
  query: string,
): GlobalActivityDisplayItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    if (isGroupedSystemActivityDisplayItem(item)) return false;
    const name = item.participant_display_name?.trim().toLowerCase() ?? "";
    return name.includes(q);
  });
}
