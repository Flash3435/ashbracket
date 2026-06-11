import type { PoolActivityFeedRow } from "./poolActivityTypes";
import { parseRollingInsightKind } from "./rollingPoolInsightKeys";

export type ActivityDisplayPriority = "high" | "medium" | "low";

const HIGH_INSIGHT_PREFIXES = [
  "post_lock_top_champion",
  "post_lock_top3_champions",
  "pre_lock_remaining_le",
] as const;

const LOW_INSIGHT_PREFIXES = [
  "prelock_activity_heat:",
  "prelock_pick_updates:",
  "prelock_joins:",
  "prelock_activity_today_",
  "prelock_updates_today_",
  "prelock_joins_today_",
] as const;

function sourceKey(item: PoolActivityFeedRow): string | null {
  const sk = item.metadata_json.source_key;
  return typeof sk === "string" && sk.trim() ? sk.trim() : null;
}

function milestoneLabel(item: PoolActivityFeedRow): string | null {
  const v = item.metadata_json.milestone_label;
  return typeof v === "string" ? v : null;
}

/** Assigns a display priority tier for feed noise reduction. */
export function activityDisplayPriority(
  item: PoolActivityFeedRow,
): ActivityDisplayPriority {
  switch (item.type) {
    case "announcement":
      return "high";
    case "participant_joined":
    case "participant_submitted_picks":
    case "participant_updated_picks":
      return "medium";
    case "ash_daily_recap":
      return "medium";
    case "ash_score_impact":
      return "high";
    case "pool_milestone":
      return poolMilestoneDisplayPriority(item);
    case "pool_insight":
      return poolInsightDisplayPriority(item);
    default:
      return "medium";
  }
}

function poolMilestoneDisplayPriority(
  item: PoolActivityFeedRow,
): ActivityDisplayPriority {
  const sk = sourceKey(item);
  const label = milestoneLabel(item);

  if (
    sk === "lock_passed" ||
    sk === "picks_locked_insights" ||
    sk === "completion_100"
  ) {
    return "high";
  }

  if (label === "DEADLINE" || label === "POOL UPDATE") {
    return "high";
  }

  if (
    sk === "completion_50" ||
    sk === "completion_75" ||
    sk === "completion_remaining_le3"
  ) {
    return "medium";
  }

  if (sk?.startsWith("completion_count_")) {
    return "low";
  }

  return "medium";
}

function poolInsightDisplayPriority(
  item: PoolActivityFeedRow,
): ActivityDisplayPriority {
  const sk = sourceKey(item);
  if (!sk) return "medium";

  if (HIGH_INSIGHT_PREFIXES.some((prefix) => sk.startsWith(prefix))) {
    return "high";
  }

  if (LOW_INSIGHT_PREFIXES.some((prefix) => sk.startsWith(prefix))) {
    return "low";
  }

  if (parseRollingInsightKind(sk) === "activity_heat") {
    return "low";
  }

  return "medium";
}
