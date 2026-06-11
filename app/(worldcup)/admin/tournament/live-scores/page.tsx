import { LiveScoresFetchPanel } from "@/components/admin/LiveScoresFetchPanel";
import { SimulationModeBanner } from "@/components/admin/SimulationModeBanner";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { isProductionDeployment } from "@/lib/admin/deploymentEnvironment";
import { fetchLiveTournamentSyncImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import { requireGlobalAdminPage } from "@/lib/admin/requireGlobalAdmin";
import { OFFICIAL_EDITION_CODE } from "@/lib/config/officialTournament";
import { getLiveScoresProviderConfig } from "@/lib/tournament/liveScores/provider";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

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
        description="Fetch latest final scores from the configured provider, preview changes, then apply and rebuild standings."
      />

      <p className="mb-6 text-sm text-ash-muted">
        <Link href="/admin/tournament/match-goals" className="ash-link">
          Match scores &amp; goal scorers
        </Link>
        <span> — manually enter scores and goal scorers without using the provider.</span>
      </p>

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
