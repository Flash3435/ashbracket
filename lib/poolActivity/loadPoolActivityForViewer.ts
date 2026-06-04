import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecapFacts } from "./buildDeterministicRecapBody";
import { ensureDailyAshRecapForPool } from "./ensureDailyAshRecap";
import { ensurePoolMilestonesForPool } from "./ensurePoolMilestones";
import { fetchActivityReactionsForPool } from "./fetchActivityReactions";
import { fetchPoolActivityForPool } from "./fetchPoolActivity";
import { loadRecapFacts } from "./loadRecapFacts";
import { recapCalendarDateYmdEdmonton } from "./recapCalendarDate";
import type { ActivityReactionsSnapshot } from "./activityReactionTypes";

export type PoolActivityForViewerResult = {
  items: Awaited<ReturnType<typeof fetchPoolActivityForPool>>;
  /** Current pool completion facts (same rules as recap insert). */
  liveRecapFacts: RecapFacts;
  /** Edmonton calendar date string used for “today’s” recap headline override. */
  liveRecapDateYmd: string;
  reactions: ActivityReactionsSnapshot;
  /** Pool setting: show template AshBot lines on the feed (defaults true). */
  ashbotEnabled: boolean;
};

/**
 * Loads feed rows with optional lazy Ash recap (per pool/day cap + skip if pool stats unchanged).
 * Use from server components after the viewer is known to be a pool member.
 */
export async function loadPoolActivityForViewer(
  supabase: SupabaseClient,
  poolId: string,
  options: {
    ensureDailyRecap: boolean;
    limit: number;
    viewerParticipantId?: string | null;
  },
): Promise<PoolActivityForViewerResult> {
  if (options.ensureDailyRecap) {
    await Promise.all([
      ensureDailyAshRecapForPool(poolId),
      ensurePoolMilestonesForPool(poolId),
    ]);
  }
  const [items, poolRow, liveRecapDateYmd, recapLoad] = await Promise.all([
    fetchPoolActivityForPool(supabase, poolId, options.limit),
    supabase.from("pools").select("ashbot_enabled").eq("id", poolId).maybeSingle(),
    Promise.resolve(recapCalendarDateYmdEdmonton()),
    loadRecapFacts(supabase, poolId),
  ]);
  if (poolRow.error) {
    throw new Error(poolRow.error.message);
  }
  const ashbotEnabled = poolRow.data?.ashbot_enabled !== false;
  const { facts: liveRecapFacts } = recapLoad;
  const reactions = await fetchActivityReactionsForPool(
    supabase,
    poolId,
    items.map((i) => i.id),
    options.viewerParticipantId ?? null,
  );
  return { items, liveRecapFacts, liveRecapDateYmd, reactions, ashbotEnabled };
}
