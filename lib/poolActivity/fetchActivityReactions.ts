import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ALLOWED_ACTIVITY_REACTIONS,
  isAllowedActivityReaction,
  type ActivityReactionEmoji,
} from "./reactionConstants";
import type {
  ActivityReactionCounts,
  ActivityReactionsSnapshot,
  ViewerActivityReactions,
} from "./activityReactionTypes";

function emptyCounts(): ActivityReactionCounts {
  return {};
}

export async function fetchActivityReactionsForPool(
  supabase: SupabaseClient,
  poolId: string,
  activityIds: string[],
  viewerParticipantId: string | null,
): Promise<ActivityReactionsSnapshot> {
  if (activityIds.length === 0) {
    return { counts: emptyCounts(), viewerReactions: {} };
  }

  const { data, error } = await supabase
    .from("activity_reactions")
    .select("activity_id, participant_id, reaction")
    .eq("pool_id", poolId)
    .in("activity_id", activityIds);

  if (error) {
    throw new Error(error.message);
  }

  const counts: ActivityReactionCounts = {};
  const viewerReactions: ViewerActivityReactions = {};

  for (const row of data ?? []) {
    const activityId = row.activity_id as string;
    const reactionRaw = row.reaction as string;
    if (!isAllowedActivityReaction(reactionRaw)) continue;

    if (!counts[activityId]) {
      counts[activityId] = {};
    }
    const bucket = counts[activityId]!;
    bucket[reactionRaw] = (bucket[reactionRaw] ?? 0) + 1;

    if (
      viewerParticipantId &&
      (row.participant_id as string) === viewerParticipantId
    ) {
      viewerReactions[activityId] = reactionRaw;
    }
  }

  return { counts, viewerReactions };
}

export async function fetchReactionCountsForActivity(
  supabase: SupabaseClient,
  poolId: string,
  activityId: string,
  viewerParticipantId: string | null,
): Promise<{
  counts: Partial<Record<ActivityReactionEmoji, number>>;
  viewerReaction: ActivityReactionEmoji | null;
}> {
  const { data, error } = await supabase
    .from("activity_reactions")
    .select("participant_id, reaction")
    .eq("pool_id", poolId)
    .eq("activity_id", activityId);

  if (error) {
    throw new Error(error.message);
  }

  const counts: Partial<Record<ActivityReactionEmoji, number>> = {};
  let viewerReaction: ActivityReactionEmoji | null = null;

  for (const row of data ?? []) {
    const reactionRaw = row.reaction as string;
    if (!isAllowedActivityReaction(reactionRaw)) continue;
    counts[reactionRaw] = (counts[reactionRaw] ?? 0) + 1;
    if (
      viewerParticipantId &&
      (row.participant_id as string) === viewerParticipantId
    ) {
      viewerReaction = reactionRaw;
    }
  }

  for (const emoji of ALLOWED_ACTIVITY_REACTIONS) {
    if (counts[emoji] === 0) delete counts[emoji];
  }

  return { counts, viewerReaction };
}

/** Pure helper for tests: aggregate raw reaction rows. */
export function aggregateActivityReactions(
  rows: Array<{ activity_id: string; participant_id: string; reaction: string }>,
  viewerParticipantId: string | null,
): ActivityReactionsSnapshot {
  const counts: ActivityReactionCounts = {};
  const viewerReactions: ViewerActivityReactions = {};

  for (const row of rows) {
    if (!isAllowedActivityReaction(row.reaction)) continue;
    if (!counts[row.activity_id]) counts[row.activity_id] = {};
    const bucket = counts[row.activity_id]!;
    bucket[row.reaction] = (bucket[row.reaction] ?? 0) + 1;
    if (viewerParticipantId && row.participant_id === viewerParticipantId) {
      viewerReactions[row.activity_id] = row.reaction;
    }
  }

  return { counts, viewerReactions };
}
