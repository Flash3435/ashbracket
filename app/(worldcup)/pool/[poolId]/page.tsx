import { PublicLeaderboard } from "@/components/leaderboard/PublicLeaderboard";
import { PoolPublicStatsSummary } from "@/components/pool/PoolPublicStatsSummary";
import { SimulationModeBanner } from "@/components/admin/SimulationModeBanner";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import {
  groupPublicLeaderboardByPool,
  mapPublicLeaderboardRow,
} from "@/lib/leaderboard/publicLeaderboard";
import { fetchPoolPublicStats } from "@/lib/pool/fetchPoolPublicStats";
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
  const [leaderboardRes, statsRes] = await Promise.all([
    supabase
      .from("leaderboard_public")
      .select("pool_id, pool_name, participant_id, display_name, total_points, rank")
      .eq("pool_id", poolIdTrimmed)
      .order("rank", { ascending: true }),
    fetchPoolPublicStats(supabase, poolIdTrimmed),
  ]);

  const sections = leaderboardRes.error
    ? []
    : groupPublicLeaderboardByPool(
        (leaderboardRes.data ?? []).map((row) =>
          mapPublicLeaderboardRow(row as LeaderboardPublicRowDb),
        ),
      );

  return (
    <PageContainer>
      {pool.is_simulation ? (
        <SimulationModeBanner
          variant="simulation"
          poolName={pool.name as string}
          className="mb-6"
        />
      ) : null}

      <PageTitle
        title={pool.name as string}
        description="Public pool leaderboard and participant standings."
      />

      <PoolPublicStatsSummary
        poolLabel={pool.name as string}
        stats={statsRes.stats}
        errorMessage={statsRes.error}
      />

      <PublicLeaderboard
        errorMessage={leaderboardRes.error?.message ?? null}
        sections={sections}
        nameLinks
      />
    </PageContainer>
  );
}
