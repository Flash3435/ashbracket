import { activityDisplayPriority } from "./activityFeedDisplayPriority";
import {
  applyGlobalActivityFeedGrouping,
  applyPoolActivityFeedGrouping,
  groupedCompletionMilestoneId,
  isGroupableCompletionMilestone,
  milestoneShortLabel,
} from "./activityFeedGrouping";
import { isGroupedSystemActivityDisplayItem } from "./activityFeedDisplayTypes";
import {
  filterGlobalActivityDisplayItems,
} from "./globalActivityDisplayFilter";
import type { GlobalPoolActivityFeedRow } from "./globalActivityTypes";
import type { PoolActivityFeedRow } from "./poolActivityTypes";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

const poolId = "pool-abc";
const day = "2026-06-06T14:00:00.000Z";

function milestoneRow(
  id: string,
  sourceKey: string,
  body: string,
  createdAt: string,
  extra: Record<string, unknown> = {},
): PoolActivityFeedRow {
  return {
    id,
    type: "pool_milestone",
    body_text: body,
    metadata_json: {
      source_key: sourceKey,
      milestone_label: "MILESTONE",
      ...extra,
    },
    related_path: null,
    is_ai_generated: false,
    created_at: createdAt,
    participant_display_name: null,
  };
}

function globalMilestoneRow(
  id: string,
  sourceKey: string,
  body: string,
  createdAt: string,
): GlobalPoolActivityFeedRow {
  return {
    ...milestoneRow(id, sourceKey, body, createdAt),
    pool_id: poolId,
    pool_name: "Test Pool",
    ashbot_enabled: true,
  };
}

const m5 = milestoneRow("m5", "completion_count_5", "5 complete", day);
const m10 = milestoneRow(
  "m10",
  "completion_count_10",
  "10 complete",
  "2026-06-06T13:00:00.000Z",
);
const half = milestoneRow(
  "half",
  "completion_50",
  "Half complete",
  "2026-06-06T12:00:00.000Z",
);
const lock = milestoneRow(
  "lock",
  "lock_passed",
  "Locked",
  day,
  { milestone_label: "POOL UPDATE" },
);

t(isGroupableCompletionMilestone(m5), "count milestone groupable");
t(!isGroupableCompletionMilestone(lock), "lock milestone not groupable");
t(milestoneShortLabel(m5) === "5 complete", "short label count");
t(milestoneShortLabel(half) === "Half complete", "short label half");
t(
  milestoneShortLabel(
    milestoneRow("r", "completion_remaining_le3", "x", day, {
      remaining_count: 2,
    }),
  ) === "Only 2 left",
  "short label remaining",
);

const strictGrouped = applyPoolActivityFeedGrouping(
  [m5, m10, half, lock],
  "strict",
  poolId,
);
t(
  strictGrouped.filter(isGroupedSystemActivityDisplayItem).length === 1,
  "strict groups same-day completion milestones",
);
t(
  strictGrouped.some(
    (item) =>
      isGroupedSystemActivityDisplayItem(item) &&
      item.id === groupedCompletionMilestoneId(poolId, "2026-06-06"),
  ),
  "stable grouped id",
);
const grouped = strictGrouped.find(isGroupedSystemActivityDisplayItem);
t(Boolean(grouped && grouped.items.length === 3), "group contains 3 milestones");
t(
  strictGrouped.some(
    (item) => !isGroupedSystemActivityDisplayItem(item) && item.id === "lock",
  ),
  "lock milestone stays ungrouped",
);

const insight: PoolActivityFeedRow = {
  id: "insight",
  type: "pool_insight",
  body_text: "Insight",
  metadata_json: { source_key: "pre_lock_activity_today", insight_label: "POOL INSIGHT" },
  related_path: null,
  is_ai_generated: false,
  created_at: day,
  participant_display_name: null,
};
const announcement: PoolActivityFeedRow = {
  id: "ann",
  type: "announcement",
  body_text: "Hello",
  metadata_json: {},
  related_path: null,
  is_ai_generated: false,
  created_at: day,
  participant_display_name: null,
};
const pick: PoolActivityFeedRow = {
  id: "pick",
  type: "participant_submitted_picks",
  body_text: "Picks",
  metadata_json: {},
  related_path: null,
  is_ai_generated: false,
  created_at: day,
  participant_display_name: "Pat",
};

const mixed = applyPoolActivityFeedGrouping(
  [m5, insight, announcement, pick, m10],
  "strict",
  poolId,
);
t(
  mixed.some((item) => !isGroupedSystemActivityDisplayItem(item) && item.id === "insight"),
  "does not group insights",
);
t(
  mixed.some((item) => !isGroupedSystemActivityDisplayItem(item) && item.id === "ann"),
  "does not group announcements",
);
t(
  mixed.some((item) => !isGroupedSystemActivityDisplayItem(item) && item.id === "pick"),
  "does not group pick events",
);

const many = [
  milestoneRow("a", "completion_count_5", "5", "2026-06-06T18:00:00.000Z"),
  milestoneRow("b", "completion_count_10", "10", "2026-06-06T17:00:00.000Z"),
  milestoneRow("c", "completion_50", "half", "2026-06-06T16:00:00.000Z"),
  milestoneRow("d", "completion_75", "75", "2026-06-06T15:00:00.000Z"),
  milestoneRow("e", "completion_remaining_le3", "2 left", "2026-06-06T14:00:00.000Z", {
    remaining_count: 2,
  }),
  milestoneRow("f", "completion_count_15", "15", "2026-06-06T13:00:00.000Z"),
];
const manyGrouped = applyPoolActivityFeedGrouping(many, "strict", poolId).find(
  isGroupedSystemActivityDisplayItem,
);
t(Boolean(manyGrouped), "groups many milestones");
t(manyGrouped!.items.length === 5, "max 5 labels");
t(manyGrouped!.hiddenCount === 1, "hidden count for +1 more");

const lightTwoNonConsecutive = applyPoolActivityFeedGrouping(
  [m5, pick, m10],
  "light",
  poolId,
);
t(
  lightTwoNonConsecutive.filter(isGroupedSystemActivityDisplayItem).length === 0,
  "light mode skips 2 non-consecutive milestones",
);

const lightThree = applyPoolActivityFeedGrouping([m5, m10, half], "light", poolId);
t(
  lightThree.filter(isGroupedSystemActivityDisplayItem).length === 1,
  "light mode groups 3 same-day milestones",
);

const lightConsecutive = applyPoolActivityFeedGrouping([m5, m10], "light", poolId);
t(
  lightConsecutive.filter(isGroupedSystemActivityDisplayItem).length === 1,
  "light mode groups 2 consecutive milestones",
);

const globalRows: GlobalPoolActivityFeedRow[] = [
  globalMilestoneRow("g1", "completion_count_5", "5", day),
  globalMilestoneRow("g2", "completion_count_10", "10", "2026-06-06T13:00:00.000Z"),
  globalMilestoneRow("g3", "lock_passed", "Locked", day),
];
const globalGrouped = applyGlobalActivityFeedGrouping(globalRows, "strict");
t(
  globalGrouped.filter(isGroupedSystemActivityDisplayItem).length === 1,
  "global strict grouping",
);
t(
  filterGlobalActivityDisplayItems(globalGrouped, "milestones").some(
    isGroupedSystemActivityDisplayItem,
  ),
  "milestones filter includes grouped summary",
);

t(activityDisplayPriority(lock) === "high", "lock milestone high priority");
t(activityDisplayPriority(m5) === "low", "count milestone low priority");

if (failed) {
  process.exit(1);
}
console.log("activityFeedGrouping.selftest: ok");
