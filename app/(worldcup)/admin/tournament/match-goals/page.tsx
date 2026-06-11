import { MatchGoalsAdminPanel } from "@/components/admin/MatchGoalsAdminPanel";
import { SimulationModeBanner } from "@/components/admin/SimulationModeBanner";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { requireGlobalAdminPage } from "@/lib/admin/requireGlobalAdmin";
import { OFFICIAL_EDITION_CODE } from "@/lib/config/officialTournament";
import {
  loadMatchGoalsForEdition,
  loadMatchesForGoalsAdmin,
} from "@/lib/tournament/matchGoals/loadMatchGoalsAdminData";
import { deriveTopScorerLeaderboard } from "@/lib/tournament/matchGoals/deriveGoalTotals";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminMatchGoalsPage() {
  await requireGlobalAdminPage("/admin/tournament/match-goals");

  const supabase = await createClient();
  const { data: edition } = await supabase
    .from("tournament_editions")
    .select("id, name, code")
    .eq("code", OFFICIAL_EDITION_CODE)
    .maybeSingle();

  let matches: Awaited<ReturnType<typeof loadMatchesForGoalsAdmin>> = { matches: [] };
  let goals: Awaited<ReturnType<typeof loadMatchGoalsForEdition>> = { goals: [] };
  let loadError: string | null = null;

  if (edition?.id) {
    const [matchRes, goalRes] = await Promise.all([
      loadMatchesForGoalsAdmin(supabase, edition.id),
      loadMatchGoalsForEdition(supabase, edition.id),
    ]);
    if ("error" in matchRes) loadError = matchRes.error;
    else matches = matchRes;
    if ("error" in goalRes) loadError = loadError ?? goalRes.error;
    else goals = goalRes;
  }

  const topScorers =
    "goals" in goals ? deriveTopScorerLeaderboard(goals.goals).slice(0, 10) : [];

  return (
    <PageContainer>
      <p className="mb-4 text-sm text-ash-muted">
        <Link href="/admin/tournament" className="ash-link">
          Live scores &amp; standings
        </Link>
        <span> — manual match scores and goal scorers.</span>
      </p>

      <PageTitle
        title="Match scores & goal scorers"
        description="Enter final scores and goal scorers for the live official edition. Scores drive standings; goal data prepares Golden Boot / top-scorer bonus scoring."
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
          <MatchGoalsAdminPanel matches={matches.matches} goals={goals.goals} />

          {topScorers.length > 0 ? (
            <section className="ash-surface mt-8 space-y-3 p-4">
              <h2 className="text-base font-bold text-ash-text">
                Top scorers (from entered goals, own goals excluded)
              </h2>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-ash-muted">
                {topScorers.map((row) => (
                  <li key={row.normalizedName}>
                    {row.playerName} — {row.goals} goal{row.goals === 1 ? "" : "s"}
                  </li>
                ))}
              </ol>
              <p className="text-xs text-ash-muted">
                Preview only — bonus pick scoring is not wired from this data yet.
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
