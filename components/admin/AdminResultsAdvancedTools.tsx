import { RecomputeAllPoolsPanel } from "@/components/admin/RecomputeAllPoolsPanel";
import type { AdminImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import { isProductionDeployment } from "@/lib/admin/deploymentEnvironment";

type Props = {
  liveEditionId: string;
  liveImpact: AdminImpactSummary;
};

/** Secondary troubleshooting: recalculate live pools without rebuilding from match scores. */
export function AdminResultsAdvancedTools({ liveEditionId, liveImpact }: Props) {
  const isProduction = isProductionDeployment();

  return (
    <details className="mb-8 rounded-lg border border-ash-border/70 bg-ash-body/20">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ash-muted hover:text-ash-text">
        Advanced / troubleshooting
      </summary>
      <div className="border-t border-ash-border/70 p-4">
        <RecomputeAllPoolsPanel
          isProduction={isProduction}
          impact={liveImpact}
          editionId={liveEditionId}
          title="Recalculate live pool leaderboards only"
          description="Re-runs scoring from current picks and results without rebuilding from match scores. Use after manual result edits or if the daily update is not enough."
          buttonLabel="Recalculate live pools (results only)"
          successMessage="Live pool leaderboards recalculated from current results."
        />
      </div>
    </details>
  );
}
