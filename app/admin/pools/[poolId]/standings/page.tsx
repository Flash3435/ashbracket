import { RecomputeStandingsPanel } from "@/components/admin/RecomputeStandingsPanel";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { requireManagedPool } from "@/lib/admin/requireManagedPool";

export const dynamic = "force-dynamic";

export default async function AdminPoolStandingsPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  await requireManagedPool(poolId);

  return (
    <PageContainer>
      <PageTitle
        title="Standings"
        description="Recompute points for this pool from the latest official results and participant picks. Tournament outcomes are edited under Admin → Tournament results (global)."
      />
      <RecomputeStandingsPanel poolId={poolId} />
    </PageContainer>
  );
}
