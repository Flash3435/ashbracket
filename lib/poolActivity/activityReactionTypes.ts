import type { ActivityReactionEmoji } from "./reactionConstants";

/** Per-activity emoji → count. */
export type ActivityReactionCounts = Record<
  string,
  Partial<Record<ActivityReactionEmoji, number>>
>;

/** activityId → emoji the viewer selected, if any. */
export type ViewerActivityReactions = Record<string, ActivityReactionEmoji>;

/** Public reactor row — display name only (no ids or emails). */
export type ActivityReactor = {
  displayName: string;
  /** True when this row is the signed-in viewer's pool profile. */
  isYou?: boolean;
};

export type ActivityReactionSummary = {
  reaction: ActivityReactionEmoji;
  count: number;
  reactedBy: ActivityReactor[];
};

/** activityId → summaries in canonical emoji order. */
export type ActivityReactionSummaries = Record<string, ActivityReactionSummary[]>;

export type ActivityReactionsSnapshot = {
  counts: ActivityReactionCounts;
  viewerReactions: ViewerActivityReactions;
  summaries: ActivityReactionSummaries;
};
