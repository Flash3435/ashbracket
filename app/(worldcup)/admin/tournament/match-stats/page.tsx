import { MatchTeamStatsAdminPanel } from "@/components/admin/MatchTeamStatsAdminPanel";
import { SimulationModeBanner } from "@/components/admin/SimulationModeBanner";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { requireGlobalAdminPage } from "@/lib/admin/requireGlobalAdmin";
import { OFFICIAL_EDITION_CODE } from "@/lib/config/officialTournament";
import {
  deriveTeamStatTotals,
  topTeamStatLeaders,
} from "@/lib/tournament/matchTeamStats/deriveTeamStatTotals";
import {
  loadMatchesForTeamStatsAdmin,
  loadMatchTeamStatsForEdition,
} from "@/lib/tournament/matchTeamStats/loadMatchTeamStatsAdminData";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

function LeaderTable({
  title,
  rows,
  teamNameById,
  unit,
}: {
  title: string;
  rows: { teamId: string; total: number }[];
  teamNameById: Map<string, string>;
  unit: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 font-medium text-ash-text">{title}</h3>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-ash-muted">
        {rows.map((row) => (
          <li key={row.teamId}>
            {teamNameById.get(row.teamId) ?? row.teamId} — {row.total} {unit}
          </li>
        ))}
      </ol>
    </div>
  );
}

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

  const teamNameById = new Map(
    matches.matches.flatMap((m) => [
      [m.homeTeamId, m.homeTeamName],
      [m.awayTeamId, m.awayTeamName],
    ] as const).filter(([id]) => Boolean(id)) as [string, string][],
  );

  const totals =
    "teamStats" in teamStats
      ? deriveTeamStatTotals({
          matches: matches.matches,
          teamStats: teamStats.teamStats,
        })
      : null;

  const goalLeaders = totals
    ? topTeamStatLeaders(totals.goalsByTeamId)
    : [];
  const yellowLeaders = totals
    ? topTeamStatLeaders(totals.yellowCardsByTeamId)
    : [];
  const redLeaders = totals
    ? topTeamStatLeaders(totals.redCardsByTeamId)
    : [];

  const hasLeaders =
    goalLeaders.length > 0 || yellowLeaders.length > 0 || redLeaders.length > 0;

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

          {hasLeaders ? (
            <section className="ash-surface mt-8 grid gap-6 p-4 sm:grid-cols-3">
              <LeaderTable
                title="Goals (from final scores)"
                rows={goalLeaders}
                teamNameById={teamNameById}
                unit="goals"
              />
              <LeaderTable
                title="Yellow cards"
                rows={yellowLeaders}
                teamNameById={teamNameById}
                unit="cards"
              />
              <LeaderTable
                title="Red cards"
                rows={redLeaders}
                teamNameById={teamNameById}
                unit="cards"
              />
              <p className="text-xs text-ash-muted sm:col-span-3">
                Preview only — team stats are captured and leaders are derivable; bonus result
                mapping still needs to be connected to bonus keys (most_goals, most_yellow_cards,
                most_red_cards).
              </p>
            </section>
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
