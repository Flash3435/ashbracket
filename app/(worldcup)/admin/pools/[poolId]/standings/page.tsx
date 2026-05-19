import { LedgerRecomputeDiagnosticsTable } from "@/components/admin/LedgerRecomputeDiagnosticsTable";
import { RecomputeStandingsPanel } from "@/components/admin/RecomputeStandingsPanel";
import { SimulationModeBanner } from "@/components/admin/SimulationModeBanner";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { isProductionDeployment } from "@/lib/admin/deploymentEnvironment";
import { fetchPoolImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import { fetchWcLedgerRecomputeDiagnosticsForPools } from "@/lib/admin/wcLedgerRecomputeDiagnostics";
import { requireManagedPool } from "@/lib/admin/requireManagedPool";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminPoolStandingsPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  const { pool } = await requireManagedPool(poolId);

  const supabase = await createClient();
  const ledgerRecomputeDiag = await fetchWcLedgerRecomputeDiagnosticsForPools(
    supabase,
    [poolId],
  );
  const poolImpact = await fetchPoolImpactSummary(supabase, poolId);
  const isProduction = isProductionDeployment();

  return (
    <PageContainer>
      <PageTitle
        title="Standings"
        description={
          pool.is_simulation
            ? "Recompute points for this simulation pool from test results and picks."
            : "Recompute points from live official results. After a simulation pilot, confirm this pool’s standings still match your pre-pilot snapshot on Production pilot checklist."
        }
      />
      {pool.is_simulation ? (
        <SimulationModeBanner variant="simulation" poolName={pool.name} className="mb-4" />
      ) : null}
      <LedgerRecomputeDiagnosticsTable
        title="Ledger recompute (this pool)"
        description="When this pool’s leaderboard was last rebuilt successfully, and from which path."
        rows={ledgerRecomputeDiag.rows}
        loadError={ledgerRecomputeDiag.error}
      />
      {poolImpact ? (
        <RecomputeStandingsPanel
          poolId={poolId}
          isProduction={isProduction}
          impact={poolImpact}
        />
      ) : null}
    </PageContainer>
  );
}
