import type { ActivityReactionEmoji } from "./reactionConstants";

/** Per-activity emoji → count. */
export type ActivityReactionCounts = Record<string, Partial<Record<ActivityReactionEmoji, number>>>;

/** activityId → emoji the viewer selected, if any. */
export type ViewerActivityReactions = Record<string, ActivityReactionEmoji>;

export type ActivityReactionsSnapshot = {
  counts: ActivityReactionCounts;
  viewerReactions: ViewerActivityReactions;
};
