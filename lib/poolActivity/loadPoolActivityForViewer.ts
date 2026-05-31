import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecapFacts } from "./buildDeterministicRecapBody";
import { ensureDailyAshRecapForPool } from "./ensureDailyAshRecap";
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
    await ensureDailyAshRecapForPool(poolId);
  }
  const items = await fetchPoolActivityForPool(supabase, poolId, options.limit);
  const liveRecapDateYmd = recapCalendarDateYmdEdmonton();
  const { facts: liveRecapFacts } = await loadRecapFacts(supabase, poolId);
  const reactions = await fetchActivityReactionsForPool(
    supabase,
    poolId,
    items.map((i) => i.id),
    options.viewerParticipantId ?? null,
  );
  return { items, liveRecapFacts, liveRecapDateYmd, reactions };
}
