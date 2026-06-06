import type { PoolActivityFeedRow, PoolActivityType } from "./poolActivityTypes";
import type { GlobalPoolActivityFeedRow } from "./globalActivityTypes";

export type GroupedSystemActivityChild = {
  id: string;
  type: PoolActivityType;
  sourceKey?: string;
  shortLabel: string;
  body: string;
  createdAt: string;
};

export type GroupedSystemActivityDisplayItem = {
  kind: "grouped_system_activity";
  id: string;
  poolId: string;
  poolName?: string;
  createdAt: string;
  label: "MILESTONE SUMMARY";
  icon: string;
  items: GroupedSystemActivityChild[];
  hiddenCount: number;
};

export type PoolActivityDisplayItem =
  | ({ kind: "activity" } & PoolActivityFeedRow)
  | GroupedSystemActivityDisplayItem;

export type GlobalActivityDisplayItem =
  | ({ kind: "activity" } & GlobalPoolActivityFeedRow)
  | GroupedSystemActivityDisplayItem;

export function isGroupedSystemActivityDisplayItem(
  item: PoolActivityDisplayItem | GlobalActivityDisplayItem,
): item is GroupedSystemActivityDisplayItem {
  return item.kind === "grouped_system_activity";
}

export function isActivityDisplayItem<T extends PoolActivityFeedRow>(
  item: { kind: "activity" } & T | GroupedSystemActivityDisplayItem,
): item is { kind: "activity" } & T {
  return item.kind === "activity";
}

export function activityRowsFromDisplayItems<T extends PoolActivityFeedRow>(
  items: Array<({ kind: "activity" } & T) | GroupedSystemActivityDisplayItem>,
): T[] {
  return items.filter(isActivityDisplayItem).map((item) => {
    const { kind: _kind, ...row } = item;
    return row as unknown as T;
  });
}
