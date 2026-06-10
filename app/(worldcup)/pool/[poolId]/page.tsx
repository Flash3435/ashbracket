import { PublicPoolLeaderboardView } from "@/components/leaderboard/PublicPoolLeaderboardView";
import { PicksDeadlineBannerFromPool } from "@/components/pool/PicksDeadlineBannerFromPool";
import { SimulationModeBanner } from "@/components/admin/SimulationModeBanner";
import { PageContainer } from "@/components/ui/PageContainer";
import { getMyParticipantIdInPool } from "@/lib/join/actions";
import { mapPublicLeaderboardRow } from "@/lib/leaderboard/publicLeaderboard";
import { fetchPoolPublicStats } from "@/lib/pool/fetchPoolPublicStats";
import { fetchPublicLiveScoresLastUpdated } from "@/lib/tournament/liveDailyUpdateStatus";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { LeaderboardPublicRowDb } from "../../../../types/leaderboard";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ poolId: string }>;
};

export default async function PublicPoolLeaderboardPage({ params }: PageProps) {
  const { poolId } = await params;
  const poolIdTrimmed = poolId.trim();
  if (!poolIdTrimmed) {
    notFound();
  }

  const service = createServiceRoleClient();
  const { data: pool, error: poolError } = await service
    .from("pools")
    .select("id, name, is_public, is_simulation")
    .eq("id", poolIdTrimmed)
    .maybeSingle();

  if (poolError || !pool || !pool.is_public) {
    notFound();
  }

  const supabase = await createClient();
  const isLivePool = !pool.is_simulation;
  const [leaderboardRes, statsRes, viewerParticipantId, liveScoresLastUpdatedAt] =
    await Promise.all([
    supabase
      .from("leaderboard_public")
      .select("pool_id, pool_name, participant_id, display_name, total_points, rank")
      .eq("pool_id", poolIdTrimmed)
      .order("rank", { ascending: true }),
    fetchPoolPublicStats(supabase, poolIdTrimmed),
    getMyParticipantIdInPool(poolIdTrimmed),
    isLivePool ? fetchPublicLiveScoresLastUpdated(supabase) : Promise.resolve(null),
  ]);

  const rows = leaderboardRes.error
    ? []
    : (leaderboardRes.data ?? []).map((row) =>
        mapPublicLeaderboardRow(row as LeaderboardPublicRowDb),
      );

  return (
    <PageContainer>
      <PicksDeadlineBannerFromPool poolId={poolIdTrimmed} className="mb-6" />
      {pool.is_simulation ? (
        <SimulationModeBanner
          variant="simulation"
          audience="public"
          poolName={pool.name as string}
          className="mb-6"
        />
      ) : null}

      <PublicPoolLeaderboardView
        poolName={pool.name as string}
        rows={rows}
        stats={statsRes.stats}
        statsError={statsRes.error}
        leaderboardError={leaderboardRes.error?.message ?? null}
        viewerParticipantId={viewerParticipantId}
        liveScoresLastUpdatedAt={isLivePool ? liveScoresLastUpdatedAt : null}
      />
    </PageContainer>
  );
}
