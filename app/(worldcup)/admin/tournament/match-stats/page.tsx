import { MatchTeamStatsAdminPanel } from "@/components/admin/MatchTeamStatsAdminPanel";
import { SimulationModeBanner } from "@/components/admin/SimulationModeBanner";
import { TournamentStatLeadersPanel } from "@/components/tournament/TournamentStatLeadersPanel";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { requireGlobalAdminPage } from "@/lib/admin/requireGlobalAdmin";
import { OFFICIAL_EDITION_CODE } from "@/lib/config/officialTournament";
import { loadTournamentTeamStatLeaders } from "@/lib/tournament/matchTeamStats/loadTournamentTeamStatLeaders";
import {
  loadMatchesForTeamStatsAdmin,
  loadMatchTeamStatsForEdition,
} from "@/lib/tournament/matchTeamStats/loadMatchTeamStatsAdminData";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminMatchStatsPage() {
  await requireGlobalAdminPage("/admin/tournament/match-stats");

  const supabase = await createClient();
  const { data: edition } = await supabase
    .from("tournament_editions")
    .select("id, name, code")
    .eq("code", OFFICIAL_EDITION_CODE)
    .maybeSingle();

  let matches: Awaited<ReturnType<typeof loadMatchesForTeamStatsAdmin>> = { matches: [] };
  let teamStats: Awaited<ReturnType<typeof loadMatchTeamStatsForEdition>> = { teamStats: [] };
  let loadError: string | null = null;

  if (edition?.id) {
    const [matchRes, statRes] = await Promise.all([
      loadMatchesForTeamStatsAdmin(supabase, edition.id),
      loadMatchTeamStatsForEdition(supabase, edition.id),
    ]);
    if ("error" in matchRes) loadError = matchRes.error;
    else matches = matchRes;
    if ("error" in statRes) loadError = loadError ?? statRes.error;
    else teamStats = statRes;
  }

  const statLeadersRes = edition?.id
    ? await loadTournamentTeamStatLeaders(supabase)
    : null;

  return (
    <PageContainer>
      <p className="mb-4 text-sm text-ash-muted">
        <Link href="/admin/tournament" className="ash-link">
          Live scores &amp; standings
        </Link>
        <span> — manual match scores and team stats.</span>
      </p>

      <PageTitle
        title="Match scores & team stats"
        description="Enter final scores and per-team yellow/red card totals for the live official edition."
      />

      <SimulationModeBanner
        variant="live"
        editionLabel={edition ? `${edition.name} (${edition.code})` : undefined}
        className="mb-6"
      />

      {loadError ? (
        <p className="mb-4 rounded-md border border-red-700/50 bg-red-950/25 px-3 py-2 text-sm text-red-100">
          {loadError}
        </p>
      ) : null}

      {!edition ? (
        <div className="ash-surface p-4 text-sm text-ash-muted">
          Official live tournament edition is not installed.
        </div>
      ) : (
        <>
          <MatchTeamStatsAdminPanel
            matches={matches.matches}
            teamStats={teamStats.teamStats}
          />

          {statLeadersRes?.ok ? (
            <TournamentStatLeadersPanel
              variant="admin"
              view={statLeadersRes.view}
              className="mt-8"
            />
          ) : statLeadersRes && !statLeadersRes.ok ? (
            <p className="mt-8 text-sm text-ash-muted" role="status">
              Could not load stat leaders ({statLeadersRes.error}).
            </p>
          ) : null}
        </>
      )}

      <p className="mt-8 text-sm text-ash-muted">
        <Link href="/admin/tournament/live-scores" className="ash-link">
          Fetch latest scores
        </Link>
        {" · "}
        <Link href="/admin" className="ash-link">
          Admin home
        </Link>
      </p>
    </PageContainer>
  );
}
