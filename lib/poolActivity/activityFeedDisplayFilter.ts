import type { PoolActivityDisplayItem } from "./activityFeedDisplayTypes";
import { isActivityDisplayItem, isGroupedSystemActivityDisplayItem } from "./activityFeedDisplayTypes";
import {
  poolActivityMatchesFeedFilter,
  type ActivityFeedFilter,
} from "./activityFeedFilter";

export function poolActivityDisplayItemMatchesFeedFilter(
  item: PoolActivityDisplayItem,
  filter: ActivityFeedFilter,
): boolean {
  if (filter === "all") return true;
  if (isGroupedSystemActivityDisplayItem(item)) {
    return false;
  }
  return poolActivityMatchesFeedFilter(item.type, filter);
}

export function filterPoolActivityDisplayItems(
  items: PoolActivityDisplayItem[],
  filter: ActivityFeedFilter,
): PoolActivityDisplayItem[] {
  if (filter === "all") return items;
  return items.filter((item) => poolActivityDisplayItemMatchesFeedFilter(item, filter));
}

export function filterPoolActivityDisplayItemsForParticipantView(
  items: PoolActivityDisplayItem[],
  options: { hidePoolWideMilestones: boolean; participantId?: string | null },
): PoolActivityDisplayItem[] {
  if (!options.hidePoolWideMilestones) return items;

  return items.filter((item) => {
    if (isGroupedSystemActivityDisplayItem(item)) return false;
    if (item.type !== "pool_milestone" && item.type !== "pool_insight") return true;
    const pid = options.participantId?.trim();
    if (!pid) return false;
    const metaPid = item.metadata_json.participant_id;
    return typeof metaPid === "string" && metaPid === pid;
  });
}

export function poolActivityDisplayItemsIncludeActivityRow(
  items: PoolActivityDisplayItem[],
  activityId: string,
): boolean {
  return items.some(
    (item) => isActivityDisplayItem(item) && item.id === activityId,
  );
}
