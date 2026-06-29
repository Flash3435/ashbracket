import { LiveScoresFetchPanel } from "@/components/admin/LiveScoresFetchPanel";
import { MatchStatsEntryPromoCard } from "@/components/admin/MatchStatsEntryPromoCard";
import { SimulationModeBanner } from "@/components/admin/SimulationModeBanner";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { isProductionDeployment } from "@/lib/admin/deploymentEnvironment";
import { fetchLiveTournamentSyncImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import { requireGlobalAdminPage } from "@/lib/admin/requireGlobalAdmin";
import { OFFICIAL_EDITION_CODE } from "@/lib/config/officialTournament";
import { LIVE_SCORES_APPLY_BUILD } from "@/lib/tournament/liveScores/runLiveScoresApplyWorkflow";
import { getLiveScoresProviderConfig } from "@/lib/tournament/liveScores/provider";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";
/** Allow long-running apply: provider revalidation, official sync, and multi-pool recalculation. */
export const maxDuration = 300;

export default async function AdminLiveScoresPage() {
  await requireGlobalAdminPage("/admin/tournament/live-scores");

  const supabase = await createClient();
  const providerConfig = getLiveScoresProviderConfig();

  const { data: edition } = await supabase
    .from("tournament_editions")
    .select("id, name, code")
    .eq("code", OFFICIAL_EDITION_CODE)
    .maybeSingle();

  const syncImpact =
    edition?.id != null ? await fetchLiveTournamentSyncImpactSummary(supabase) : null;
  const isProduction = isProductionDeployment();

  return (
    <PageContainer>
      <p className="mb-4 text-sm text-ash-muted">
        <Link href="/admin/tournament" className="ash-link">
          Live scores &amp; standings
        </Link>
        <span> — manual daily update and advanced tools.</span>
      </p>

      <PageTitle
        title="Live score fetch"
        description="Option A: fetch final scores from your provider. Prefer manual entry? Use Match stats on the tournament page instead, then recompute standings."
      />

      <MatchStatsEntryPromoCard className="mb-6" />

      <SimulationModeBanner
        variant="live"
        editionLabel={edition ? `${edition.name} (${edition.code})` : undefined}
        className="mb-6"
      />

      {syncImpact ? (
        <LiveScoresFetchPanel
          isProduction={isProduction}
          impact={syncImpact}
          provider={providerConfig.provider}
          providerConfigured={providerConfig.configured}
          configWarning={providerConfig.configWarning}
          applyBuild={LIVE_SCORES_APPLY_BUILD}
          deploySha={process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local"}
        />
      ) : (
        <div className="ash-surface space-y-3 p-4 text-sm text-ash-muted">
          <p>Official live tournament edition is not installed.</p>
          {!providerConfig.configured && providerConfig.configWarning ? (
            <p className="rounded-md border border-amber-700/50 bg-amber-950/25 px-3 py-2 text-amber-100">
              {providerConfig.configWarning}
            </p>
          ) : null}
        </div>
      )}

      <p className="mt-8 text-sm text-ash-muted">
        <Link href="/admin" className="ash-link">
          ← Admin home
        </Link>
      </p>
    </PageContainer>
  );
}
