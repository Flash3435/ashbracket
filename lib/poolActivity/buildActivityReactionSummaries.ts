import {
  ALLOWED_ACTIVITY_REACTIONS,
  isAllowedActivityReaction,
  type ActivityReactionEmoji,
} from "./reactionConstants";
import type {
  ActivityReactionSummaries,
  ActivityReactionSummary,
  ActivityReactor,
} from "./activityReactionTypes";

export type ReactionRowWithDisplayName = {
  activity_id: string;
  participant_id: string;
  reaction: string;
  display_name: string | null;
};

export function safeParticipantDisplayName(
  raw: string | null | undefined,
): string {
  const trimmed = raw?.trim();
  return trimmed || "Participant";
}

function reactorsForReaction(
  reactors: ActivityReactor[],
): ActivityReactor[] {
  const you = reactors.filter((r) => r.isYou);
  const others = reactors.filter((r) => !r.isYou);
  return [...you, ...others];
}

/**
 * Groups reaction rows by activity and emoji with display names only in the output.
 */
export function buildActivityReactionSummaries(
  rows: ReactionRowWithDisplayName[],
  viewerParticipantId: string | null,
): ActivityReactionSummaries {
  const buckets = new Map<
    string,
    Map<ActivityReactionEmoji, ActivityReactor[]>
  >();

  for (const row of rows) {
    if (!isAllowedActivityReaction(row.reaction)) continue;

    let activityBucket = buckets.get(row.activity_id);
    if (!activityBucket) {
      activityBucket = new Map();
      buckets.set(row.activity_id, activityBucket);
    }

    let reactionBucket = activityBucket.get(row.reaction);
    if (!reactionBucket) {
      reactionBucket = [];
      activityBucket.set(row.reaction, reactionBucket);
    }

    reactionBucket.push({
      displayName: safeParticipantDisplayName(row.display_name),
      ...(viewerParticipantId && row.participant_id === viewerParticipantId
        ? { isYou: true }
        : {}),
    });
  }

  const summaries: ActivityReactionSummaries = {};
  for (const [activityId, reactionMap] of buckets) {
    const list: ActivityReactionSummary[] = [];
    for (const emoji of ALLOWED_ACTIVITY_REACTIONS) {
      const reactedBy = reactionMap.get(emoji);
      if (!reactedBy?.length) continue;
      list.push({
        reaction: emoji,
        count: reactedBy.length,
        reactedBy: reactorsForReaction(reactedBy),
      });
    }
    if (list.length > 0) {
      summaries[activityId] = list;
    }
  }

  return summaries;
}

/** Summaries for a single activity (picker / toggle responses). */
export function summariesForActivity(
  all: ActivityReactionSummaries,
  activityId: string,
): ActivityReactionSummary[] {
  return all[activityId] ?? [];
}
