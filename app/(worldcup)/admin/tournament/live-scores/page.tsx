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
        <p className="ash-surface p-4 text-sm text-ash-muted">
          Official live tournament edition is not installed.
        </p>
      )}

      <p className="mt-8 text-sm text-ash-muted">
        <Link href="/admin" className="ash-link">
          ← Admin home
        </Link>
      </p>
    </PageContainer>
  );
}
