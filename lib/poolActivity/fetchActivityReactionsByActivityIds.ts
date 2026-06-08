import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildActivityReactionSummaries,
  type ReactionRowWithDisplayName,
} from "./buildActivityReactionSummaries";
import type {
  ActivityReactionCounts,
  ActivityReactionsSnapshot,
  ViewerActivityReactions,
} from "./activityReactionTypes";
import { isAllowedActivityReaction } from "./reactionConstants";
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

function emptyCounts(): ActivityReactionCounts {
  return {};
}

function aggregateCountsAndViewer(
  rows: ReactionRowWithDisplayName[],
  viewerParticipantIds: ReadonlySet<string>,
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

    if (viewerParticipantIds.has(row.participant_id)) {
      viewerReactions[row.activity_id] = row.reaction;
    }
  }

  return { counts, viewerReactions };
}

/**
 * Batch-load reactions for many activities (possibly across pools).
 * Global admins may span pools in one query.
 */
export async function fetchActivityReactionsByActivityIds(
  supabase: SupabaseClient,
  activityIds: string[],
  viewerParticipantIds: string[] = [],
): Promise<ActivityReactionsSnapshot> {
  if (activityIds.length === 0) {
    return { counts: emptyCounts(), viewerReactions: {}, summaries: {} };
  }

  const { data, error } = await supabase
    .from("activity_reactions")
    .select(
      "activity_id, participant_id, reaction, participants ( display_name )",
    )
    .in("activity_id", activityIds);

  if (error) {
    throw new Error(error.message);
  }

  const rows = rowsFromReactionQuery(data);
  const viewerSet = new Set(viewerParticipantIds);
  const { counts, viewerReactions } = aggregateCountsAndViewer(rows, viewerSet);
  const summaries = buildActivityReactionSummaries(
    rows,
    null,
    viewerSet.size > 0 ? viewerSet : undefined,
  );

  return { counts, viewerReactions, summaries };
}
