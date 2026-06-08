import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ALLOWED_ACTIVITY_REACTIONS,
  isAllowedActivityReaction,
  type ActivityReactionEmoji,
} from "./reactionConstants";
import type {
  ActivityReactionCounts,
  ActivityReactionSummaries,
  ActivityReactionSummary,
  ActivityReactionsSnapshot,
  ViewerActivityReactions,
} from "./activityReactionTypes";
import {
  buildActivityReactionSummaries,
  summariesForActivity,
  type ReactionRowWithDisplayName,
} from "./buildActivityReactionSummaries";

function emptyCounts(): ActivityReactionCounts {
  return {};
}

function parseParticipantDisplayName(
  rel: { display_name: string | null } | { display_name: string | null }[] | null,
): string | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return rel[0]?.display_name ?? null;
  return rel.display_name;
}

function rowsFromReactionQuery(
  data: Array<Record<string, unknown>> | null,
): ReactionRowWithDisplayName[] {
  return (data ?? []).map((row) => ({
    activity_id: row.activity_id as string,
    participant_id: row.participant_id as string,
    reaction: row.reaction as string,
    display_name: parseParticipantDisplayName(
      row.participants as
        | { display_name: string | null }
        | { display_name: string | null }[]
        | null,
    ),
  }));
}

function aggregateCountsAndViewer(
  rows: ReactionRowWithDisplayName[],
  viewerParticipantId: string | null,
): {
  counts: ActivityReactionCounts;
  viewerReactions: ViewerActivityReactions;
} {
  const counts: ActivityReactionCounts = {};
  const viewerReactions: ViewerActivityReactions = {};

  for (const row of rows) {
    if (!isAllowedActivityReaction(row.reaction)) continue;

    if (!counts[row.activity_id]) {
      counts[row.activity_id] = {};
    }
    const bucket = counts[row.activity_id]!;
    bucket[row.reaction] = (bucket[row.reaction] ?? 0) + 1;

    if (viewerParticipantId && row.participant_id === viewerParticipantId) {
      viewerReactions[row.activity_id] = row.reaction;
    }
  }

  return { counts, viewerReactions };
}

export async function fetchActivityReactionsForPool(
  supabase: SupabaseClient,
  poolId: string,
  activityIds: string[],
  viewerParticipantId: string | null,
): Promise<ActivityReactionsSnapshot> {
  if (activityIds.length === 0) {
    return { counts: emptyCounts(), viewerReactions: {}, summaries: {} };
  }

  const { data, error } = await supabase
    .from("activity_reactions")
    .select(
      "activity_id, participant_id, reaction, participants ( display_name )",
    )
    .eq("pool_id", poolId)
    .in("activity_id", activityIds);

  if (error) {
    throw new Error(error.message);
  }

  const rows = rowsFromReactionQuery(data);
  const { counts, viewerReactions } = aggregateCountsAndViewer(
    rows,
    viewerParticipantId,
  );
  const summaries = buildActivityReactionSummaries(rows, viewerParticipantId);

  return { counts, viewerReactions, summaries };
}

export async function fetchReactionDetailsForActivity(
  supabase: SupabaseClient,
  poolId: string,
  activityId: string,
  viewerParticipantId: string | null,
): Promise<{
  counts: Partial<Record<ActivityReactionEmoji, number>>;
  viewerReaction: ActivityReactionEmoji | null;
  summaries: ActivityReactionSummary[];
}> {
  const { data, error } = await supabase
    .from("activity_reactions")
    .select(
      "activity_id, participant_id, reaction, participants ( display_name )",
    )
    .eq("pool_id", poolId)
    .eq("activity_id", activityId);

  if (error) {
    throw new Error(error.message);
  }

  const rows = rowsFromReactionQuery(data);
  const { counts: allCounts, viewerReactions } = aggregateCountsAndViewer(
    rows,
    viewerParticipantId,
  );
  const counts = allCounts[activityId] ?? {};
  const viewerReaction = viewerReactions[activityId] ?? null;
  const summaryMap = buildActivityReactionSummaries(rows, viewerParticipantId);

  for (const emoji of ALLOWED_ACTIVITY_REACTIONS) {
    if (counts[emoji] === 0) delete counts[emoji];
  }

  return {
    counts,
    viewerReaction,
    summaries: summariesForActivity(summaryMap, activityId),
  };
}

/** @deprecated Use fetchReactionDetailsForActivity — kept as alias for imports. */
export const fetchReactionCountsForActivity = fetchReactionDetailsForActivity;

/** Pure helper for tests: aggregate raw reaction rows. */
export function aggregateActivityReactions(
  rows: Array<{
    activity_id: string;
    participant_id: string;
    reaction: string;
    display_name?: string | null;
  }>,
  viewerParticipantId: string | null,
): ActivityReactionsSnapshot {
  const normalized: ReactionRowWithDisplayName[] = rows.map((row) => ({
    activity_id: row.activity_id,
    participant_id: row.participant_id,
    reaction: row.reaction,
    display_name: row.display_name ?? null,
  }));
  const { counts, viewerReactions } = aggregateCountsAndViewer(
    normalized,
    viewerParticipantId,
  );
  const summaries = buildActivityReactionSummaries(
    normalized,
    viewerParticipantId,
  );
  return { counts, viewerReactions, summaries };
}
