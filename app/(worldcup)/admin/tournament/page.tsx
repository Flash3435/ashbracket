import { LiveDailyUpdatePanel } from "@/components/admin/LiveDailyUpdatePanel";
import { PublishBonusResultsPanel } from "@/components/admin/PublishBonusResultsPanel";
import { TournamentStatLeadersPanel } from "@/components/tournament/TournamentStatLeadersPanel";
import { loadTournamentTeamStatLeaders } from "@/lib/tournament/matchTeamStats/loadTournamentTeamStatLeaders";
import { LiveMatchScoreEntryWorkflow } from "@/components/admin/LiveMatchScoreEntryWorkflow";
import { MatchStatsEntryPromoCard } from "@/components/admin/MatchStatsEntryPromoCard";
import { LiveScoresFetchPromoCard } from "@/components/admin/LiveScoresFetchPromoCard";
import { AdminTournamentAdvancedTools } from "@/components/admin/AdminTournamentAdvancedTools";
import { SimulationModeBanner } from "@/components/admin/SimulationModeBanner";
import { PageContainer } from "@/components/ui/PageContainer";
import { requireGlobalAdminPage } from "@/lib/admin/requireGlobalAdmin";
import { isProductionDeployment } from "@/lib/admin/deploymentEnvironment";
import { fetchLiveTournamentSyncImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import { fetchLiveDailyUpdateStatusForEdition } from "@/lib/tournament/liveDailyUpdateStatus";
import { createClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/ui/PageTitle";
import Link from "next/link";
import { OFFICIAL_EDITION_CODE } from "../../../../lib/config/officialTournament";

export const dynamic = "force-dynamic";

export default async function AdminTournamentPage() {
  await requireGlobalAdminPage("/admin/tournament");

  const supabase = await createClient();

  const { data: edition } = await supabase
    .from("tournament_editions")
    .select("id, name, code")
    .eq("code", OFFICIAL_EDITION_CODE)
    .maybeSingle();

  let matchCount: number | null = null;
  let finishedGroupMatches = 0;
  if (edition?.id) {
    const { count } = await supabase
      .from("tournament_matches")
      .select("id", { count: "exact", head: true })
      .eq("edition_id", edition.id);
    matchCount = count ?? 0;

    const { count: fg } = await supabase
      .from("tournament_matches")
      .select("id", { count: "exact", head: true })
      .eq("edition_id", edition.id)
      .eq("stage_code", "group")
      .eq("status", "finished");
    finishedGroupMatches = fg ?? 0;
  }

  const syncImpact =
    edition?.id != null
      ? await fetchLiveTournamentSyncImpactSummary(supabase)
      : null;
  const lastUpdate =
    edition?.id != null
      ? await fetchLiveDailyUpdateStatusForEdition(
          supabase,
          edition.id,
          edition.code as string,
        )
      : null;
  const isProduction = isProductionDeployment();
  const statLeadersRes = await loadTournamentTeamStatLeaders(supabase);

  return (
    <PageContainer>
      <p className="mb-4 text-sm text-ash-muted">
        <Link href="/admin/tournament/status" className="ash-link">
          Tournament status
        </Link>
        <span>
          {" "}
          — see team and match counts, last sync time, and whether standings
          look current.
        </span>
      </p>

      <PageTitle
        title="Live scores & standings"
        description="Fetch final scores from your provider, or recompute standings from scores already stored on tournament_matches."
      />

      <SimulationModeBanner
        variant="live"
        editionLabel={
          edition ? `${edition.name} (${edition.code})` : undefined
        }
        className="mb-6"
      />

      {statLeadersRes.ok ? (
        <TournamentStatLeadersPanel
          variant="admin"
          view={statLeadersRes.view}
          className="mb-6"
        />
      ) : edition ? (
        <p className="mb-6 text-sm text-ash-muted" role="status">
          Could not load tournament stat leaders ({statLeadersRes.error}).
        </p>
      ) : null}

      {syncImpact ? (
        <div className="mb-6">
          <PublishBonusResultsPanel
            isProduction={isProduction}
            impact={syncImpact}
          />
        </div>
      ) : null}

      <div className="ash-surface mb-6 space-y-2 p-4 text-sm text-ash-muted">
        <p>
          <span className="font-medium text-ash-text">Edition:</span>{" "}
          {edition
            ? `${edition.name} (${edition.code})`
            : "Not loaded yet — the official schedule needs to be installed. Contact whoever set up this site."}
        </p>
        <p>
          <span className="font-medium text-ash-text">Matches on file:</span>{" "}
          {matchCount ?? "—"}
        </p>
        <p>
          <span className="font-medium text-ash-text">
            Group-stage matches marked finished:
          </span>{" "}
          {edition ? finishedGroupMatches : "—"}
        </p>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <LiveScoresFetchPromoCard />
        <MatchStatsEntryPromoCard />
      </div>

      <LiveMatchScoreEntryWorkflow />

      {syncImpact ? (
        <div className="mt-6 space-y-6">
          <LiveDailyUpdatePanel
            isProduction={isProduction}
            impact={syncImpact}
            lastUpdate={lastUpdate}
          />
          <AdminTournamentAdvancedTools
            isProduction={isProduction}
            impact={syncImpact}
          />
        </div>
      ) : null}

      <p className="mt-8 text-sm text-ash-muted">
        <Link href="/admin" className="ash-link">
          ← Admin home
        </Link>
      </p>
    </PageContainer>
  );
}
