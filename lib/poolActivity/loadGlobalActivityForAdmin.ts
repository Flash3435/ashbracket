import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchManagedPoolsForCurrentUser } from "@/lib/pools/fetchManagedPoolsForViewer";
import { fetchParticipantCountsByPoolId } from "@/lib/pools/fetchParticipantCountsByPoolId";
import { loadRecapFacts } from "./loadRecapFacts";
import {
  buildGlobalPoolEngagementOverview,
  computeGlobalActivityEngagementSummary,
} from "./computeGlobalActivityEngagement";
import { fetchActivityReactionsByActivityIds } from "./fetchActivityReactionsByActivityIds";
import { fetchGlobalPoolActivity } from "./fetchGlobalPoolActivity";
import type {
  GlobalActivityEngagementSummary,
  GlobalPoolActivityFeedRow,
  GlobalPoolEngagementOverviewRow,
} from "./globalActivityTypes";
import type { ActivityReactionsSnapshot } from "./activityReactionTypes";

export type GlobalActivityForAdminResult = {
  items: GlobalPoolActivityFeedRow[];
  reactions: ActivityReactionsSnapshot;
  /** pool_id → participant_id when the admin is also a pool member */
  viewerParticipantIdByPoolId: Record<string, string>;
  summary: GlobalActivityEngagementSummary;
  poolOverview: GlobalPoolEngagementOverviewRow[];
  poolOptions: Array<{ id: string; name: string }>;
};

const GLOBAL_FEED_LIMIT = 50;
const METRICS_LOOKBACK_DAYS = 7;

/**
 * Global activity for `app_admins` only. Skips `ensurePoolMilestonesForPool` and
 * `ensureDailyAshRecapForPool` to avoid side effects on page load.
 */
export async function loadGlobalActivityForAdmin(
  supabase: SupabaseClient,
  userId: string,
  options: { poolId?: string | null } = {},
): Promise<GlobalActivityForAdminResult> {
  const poolFilter = options.poolId?.trim() || null;

  const [poolsResult, items, membershipResult, metricsActivity, metricsReactions] =
    await Promise.all([
      fetchManagedPoolsForCurrentUser(supabase),
      fetchGlobalPoolActivity(supabase, {
        limit: GLOBAL_FEED_LIMIT,
        poolId: poolFilter,
      }),
      supabase.from("participants").select("id, pool_id").eq("user_id", userId),
      supabase
        .from("pool_activity")
        .select("pool_id, type, created_at")
        .gte(
          "created_at",
          new Date(
            Date.now() - METRICS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
          ).toISOString(),
        ),
      supabase
        .from("activity_reactions")
        .select("pool_id, created_at")
        .gte(
          "created_at",
          new Date(
            Date.now() - METRICS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
          ).toISOString(),
        ),
    ]);

  if (poolsResult.error) {
    throw new Error(poolsResult.error);
  }
  if (membershipResult.error) {
    throw new Error(membershipResult.error.message);
  }
  if (metricsActivity.error) {
    throw new Error(metricsActivity.error.message);
  }
  if (metricsReactions.error) {
    throw new Error(metricsReactions.error.message);
  }

  const pools = poolsResult.data ?? [];
  const poolIds = pools.map((p) => p.id);
  const poolOptions = pools
    .map((p) => ({ id: p.id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const viewerParticipantIdByPoolId: Record<string, string> = {};
  for (const row of membershipResult.data ?? []) {
    viewerParticipantIdByPoolId[row.pool_id as string] = row.id as string;
  }

  const viewerParticipantIds = Object.values(viewerParticipantIdByPoolId);
  const activityIds = items.map((i) => i.id);
  const reactions = await fetchActivityReactionsByActivityIds(
    supabase,
    activityIds,
    viewerParticipantIds,
  );

  const participantCountsResult = await fetchParticipantCountsByPoolId(
    supabase,
    poolIds,
  );
  if (participantCountsResult.error) {
    throw new Error(participantCountsResult.error);
  }

  const completedBracketsByPoolId = new Map<string, number | null>();
  await Promise.all(
    poolIds.map(async (poolId) => {
      try {
        const { facts } = await loadRecapFacts(supabase, poolId);
        completedBracketsByPoolId.set(poolId, facts.submittedCount);
      } catch {
        completedBracketsByPoolId.set(poolId, null);
      }
    }),
  );

  const recentActivity = (metricsActivity.data ?? []).map((r) => ({
    pool_id: r.pool_id as string,
    type: r.type as string,
    created_at: r.created_at as string,
  }));
  const recentReactions = (metricsReactions.data ?? []).map((r) => ({
    pool_id: r.pool_id as string,
    created_at: r.created_at as string,
  }));

  const summary = computeGlobalActivityEngagementSummary({
    poolIds,
    recentActivity,
    recentReactions,
  });

  const poolOverview = buildGlobalPoolEngagementOverview({
    pools: poolOptions,
    participantCountsByPoolId: participantCountsResult.countsByPoolId,
    completedBracketsByPoolId,
    recentActivity,
    recentReactions,
  });

  return {
    items,
    reactions,
    viewerParticipantIdByPoolId,
    summary,
    poolOverview,
    poolOptions,
  };
}
