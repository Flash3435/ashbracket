import { NhlStandingsLeaderboard } from "@/components/nhl/NhlStandingsLeaderboard";
import { NhlTeamLogo } from "@/components/nhl/NhlTeamLogo";
import { PageContainer } from "@/components/ui/PageContainer";
import { getOfficial2026EditionTeamStatus } from "@/lib/nhl/official2026Edition";
import { NHL_SERIES_WINNER_POINTS_BY_ROUND } from "@/lib/nhl/scoring";
import { formatNhlStandingsLoadError } from "@/lib/nhl/standingsLabels";
import {
  countNhlSeriesForEdition,
  countNhlSeriesWithWinnerForEdition,
  countNhlTeamsForEdition,
  fetchActiveNhlEdition,
  fetchNhlEditionStandings,
  fetchNhlTeamsForEdition,
  fetchNhlTeamSlugsForEdition,
} from "@/lib/nhl/queries";
import { maybeSyncNhlBracketRound1ToDatabase } from "@/lib/nhl/syncNhlSeriesFromNhleBracket";
import type { NhlTeam } from "@/lib/nhl/types";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Standings",
  description:
    "NHL playoff leaderboard for the active AshBracket NHL edition—overall points and a Round 2+ view that excludes Round 1 for fair late entry.",
};

export const dynamic = "force-dynamic";

export default async function NhlStandingsPage() {
  const supabase = await createClient();
  const { edition, error: editionError } = await fetchActiveNhlEdition(supabase);

  let teamCount = 0;
  let seriesCount = 0;
  let seriesWithWinnerCount = 0;
  let countsError: string | null = null;
  let winnersCountError: string | null = null;
  let slugError: string | null = null;
  let teamsListError: string | null = null;
  let editionTeamsSorted: NhlTeam[] = [];
  let fieldStatus: ReturnType<typeof getOfficial2026EditionTeamStatus> | null = null;
  let standingsRows: Awaited<ReturnType<typeof fetchNhlEditionStandings>>["rows"] = [];
  let standingsError: string | null = null;

  if (edition && !editionError) {
    await maybeSyncNhlBracketRound1ToDatabase();

    const [teamCountRes, seriesCountRes, slugRes, teamsRes, winnersRes] = await Promise.all([
      countNhlTeamsForEdition(supabase, edition.id),
      countNhlSeriesForEdition(supabase, edition.id),
      fetchNhlTeamSlugsForEdition(supabase, edition.id),
      fetchNhlTeamsForEdition(supabase, edition.id),
      countNhlSeriesWithWinnerForEdition(supabase, edition.id),
    ]);

    if (teamCountRes.error || seriesCountRes.error) {
      countsError = teamCountRes.error ?? seriesCountRes.error ?? null;
    } else {
      teamCount = teamCountRes.count;
      seriesCount = seriesCountRes.count;
    }

    if (winnersRes.error) {
      winnersCountError = winnersRes.error;
    } else {
      seriesWithWinnerCount = winnersRes.count;
    }

    slugError = slugRes.error;
    if (!slugRes.error) {
      fieldStatus = getOfficial2026EditionTeamStatus(
        slugRes.slugs.map((s) => ({ team_slug: s })),
      );
    }

    teamsListError = teamsRes.error;
    if (!teamsRes.error && teamsRes.teams.length > 0) {
      editionTeamsSorted = [...teamsRes.teams].sort((a, b) => {
        const side = (t: NhlTeam) => (t.conference === "west" ? 1 : 0);
        const ds = side(a) - side(b);
        if (ds !== 0) return ds;
        return (a.seed ?? 99) - (b.seed ?? 99);
      });
    }

    const st = await fetchNhlEditionStandings(supabase, edition.id);
    standingsRows = st.rows;
    standingsError = st.error;
  }

  const dataError = editionError ?? slugError ?? countsError;
  const hasEntries = standingsRows.length > 0;
  const hasAnyPickSubmitted = standingsRows.some((r) => r.pick_count > 0);
  const noRecordedWinnersYet =
    edition &&
    !winnersCountError &&
    seriesWithWinnerCount === 0 &&
    !countsError;

  return (
    <PageContainer compactBottom>
      <section className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-slate-950/80 via-slate-900/40 to-blue-950/30 px-5 py-8 shadow-lg shadow-blue-950/20 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-300/90">
          AshBracket NHL
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ash-text sm:text-4xl">
          Standings
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300">
          Live leaderboard for the active NHL edition: overall points across every round, plus a
          Round 2+ view that ranks on later rounds only so new joiners are not stuck behind Round 1
          they never played. NHL-only data; separate from World Cup pools.
        </p>
      </section>

      <section className="ash-surface space-y-4 px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">Active edition</h2>
        {dataError ? (
          <p className="text-sm leading-relaxed text-amber-200/90">
            Edition details could not be fully loaded ({dataError}). Try again later.
          </p>
        ) : null}
        {winnersCountError ? (
          <p className="text-sm leading-relaxed text-amber-200/90">
            Series result counts are temporarily unavailable ({winnersCountError}).
          </p>
        ) : null}

        {!edition && !editionError ? (
          <div className="space-y-2 text-sm leading-relaxed text-slate-400">
            <p>There is no active NHL edition in this environment yet.</p>
            <p className="text-slate-500">
              Standings need an active edition before any leaderboard rows can load.
            </p>
          </div>
        ) : null}

        {edition && !editionError ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-blue-500/20 bg-slate-950/50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-300/80">
                Active playoff pool
              </p>
              <p className="mt-1 text-lg font-semibold text-ash-text">{edition.name}</p>
              <p className="mt-1 text-sm text-slate-400">
                Season <span className="text-slate-300">{edition.season_label}</span>
                {edition.slug ? (
                  <span className="text-slate-600"> · {edition.slug}</span>
                ) : null}
              </p>
              {teamsListError ? (
                <p className="mt-3 text-xs text-amber-200/90">
                  Team logos could not be loaded ({teamsListError}).
                </p>
              ) : editionTeamsSorted.length > 0 ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Playoff field (visual)
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {editionTeamsSorted.map((t) => (
                      <NhlTeamLogo
                        key={t.id}
                        size="md"
                        teamSlug={t.team_slug}
                        abbreviation={t.abbreviation}
                        logoPath={t.logo_path}
                        name={t.team_name}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <p className="text-sm text-slate-400">
                {countsError ? (
                  "Team and series counts are temporarily unavailable."
                ) : (
                  <>
                    <span className="text-slate-300">{teamCount}</span> team
                    {teamCount === 1 ? "" : "s"}
                    <span className="text-slate-600"> · </span>
                    <span className="text-slate-300">{seriesCount}</span> series slot
                    {seriesCount === 1 ? "" : "s"}
                    <span className="text-slate-600"> · </span>
                    <span className="text-slate-300">{seriesWithWinnerCount}</span> with a recorded
                    winner
                  </>
                )}
              </p>
              {fieldStatus === "official_2026" ? (
                <p className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/35 bg-emerald-950/30 px-3 py-1 text-xs font-medium text-emerald-100/95">
                  Official 2026 playoff field loaded
                </p>
              ) : fieldStatus === "non_official" && teamCount > 0 ? (
                <p className="text-xs text-slate-500">
                  Team list does not match the canonical 2026 field; counts still reflect what is
                  stored for this edition.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <section className="ash-surface space-y-3 px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">Scoring (this edition)</h2>
        <p className="text-sm leading-relaxed text-slate-400">
          Each correct series winner earns points by round once a winner is recorded on the series.
          Round weights: Round 1 = {NHL_SERIES_WINNER_POINTS_BY_ROUND.R1}, Round 2 ={" "}
          {NHL_SERIES_WINNER_POINTS_BY_ROUND.R2}, Conference Final ={" "}
          {NHL_SERIES_WINNER_POINTS_BY_ROUND.CF}, Stanley Cup Final ={" "}
          {NHL_SERIES_WINNER_POINTS_BY_ROUND.SCF}. Public rules may add detail later; this page
          reflects the live model.
        </p>
        <p className="text-sm leading-relaxed text-slate-500">
          Round 1 and Round 2 picks are scored from saved rows once each series has a recorded
          winner. Conference Finals and Stanley Cup Final use the same weights when those pick
          flows and results are present.
        </p>
      </section>

      <section className="ash-surface px-4 py-5 sm:px-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ash-text">Leaderboard</h2>
            <p className="mt-1 text-sm text-slate-500">
              Use Overall for full-playoff credit, or Round 2+ to compare everyone on the same
              post–Round 1 scoring window. Values refresh on each request from saved picks and
              recorded series winners.
            </p>
          </div>
        </div>

        {standingsError ? (
          <p className="mt-4 text-sm text-amber-200/90">
            <span className="font-medium text-amber-100/95">Standings unavailable. </span>
            {formatNhlStandingsLoadError(standingsError)}
          </p>
        ) : null}

        {!standingsError && edition && !editionError && !hasEntries ? (
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            <span className="font-medium text-slate-300">No NHL entries yet.</span> Join with an
            invite or save at least one Round 1 pick so your account appears in this pool.
          </p>
        ) : null}

        {!standingsError &&
        edition &&
        !editionError &&
        hasEntries &&
        !hasAnyPickSubmitted ? (
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            <span className="font-medium text-slate-300">Standings will populate once participants</span>{" "}
            submit Round 1 picks. Invited members without picks still appear below with &quot;No
            picks yet&quot;.
          </p>
        ) : null}

        {!standingsError &&
        edition &&
        !editionError &&
        hasAnyPickSubmitted &&
        noRecordedWinnersYet ? (
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            <span className="font-medium text-slate-300">
              Picks are in, but no completed series results are available yet.
            </span>{" "}
            Points stay at zero until at least one series has a recorded winner in the database
            (NHL admin → Series). The picks page may already show finals from the live bracket before
            those rows update here.
            {process.env.NHL_PLAYOFF_SYNC_ENABLED?.trim() === "true" ? (
              <>
                {" "}
                <span className="font-medium text-slate-300">NHLE sync is on</span> for this
                deployment—this page tries to pull Round 1 winners from the league on each load;
                refresh if counts just changed.
              </>
            ) : null}
          </p>
        ) : null}

        {hasEntries && !standingsError ? (
          <div className="mt-5">
            <NhlStandingsLeaderboard rows={standingsRows} />
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-xl border border-blue-500/25 bg-slate-950/60 shadow-inner shadow-blue-950/30">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-blue-500/20 bg-slate-900/80">
                    <th className="px-4 py-3 font-semibold tracking-wide text-blue-100/90">Rank</th>
                    <th className="px-4 py-3 font-semibold tracking-wide text-blue-100/90">Entry</th>
                    <th className="px-4 py-3 text-right font-semibold tracking-wide text-blue-100/90">
                      Overall
                    </th>
                    <th className="px-4 py-3 text-right font-semibold tracking-wide text-blue-100/90">
                      R1
                    </th>
                    <th className="px-4 py-3 text-right font-semibold tracking-wide text-blue-100/90">
                      R2+
                    </th>
                    <th className="px-4 py-3 text-right font-semibold tracking-wide text-blue-100/90">
                      Correct
                    </th>
                    <th className="px-4 py-3 font-semibold tracking-wide text-blue-100/90">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {!edition && !editionError ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-12 text-center text-sm leading-relaxed text-slate-400"
                      >
                        No active NHL edition — leaderboard is unavailable.
                      </td>
                    </tr>
                  ) : editionError ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-12 text-center text-sm leading-relaxed text-slate-400"
                      >
                        Could not load the active edition ({editionError}).
                      </td>
                    </tr>
                  ) : standingsError ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-12 text-center text-sm leading-relaxed text-slate-400"
                      >
                        Fix the database error above to load standings.
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-12 text-center text-sm leading-relaxed text-slate-400"
                      >
                        No rows to show yet — see the message above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-ash-text">Explore the NHL section</h2>
        <p className="mt-1 text-sm text-slate-400">
          Rules, Round 1 picks, and home — all under <code className="text-slate-500">/nhl</code>.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link
            href="/nhl/rules"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35"
          >
            <p className="text-base font-semibold text-ash-text">Rules</p>
            <p className="mt-1 text-sm text-slate-500">Format and pool expectations.</p>
          </Link>
          <Link
            href="/nhl/picks"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35"
          >
            <p className="text-base font-semibold text-ash-text">Round 1 picks</p>
            <p className="mt-1 text-sm text-slate-500">Save series winners for the active edition.</p>
          </Link>
          <Link
            href="/nhl"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35"
          >
            <p className="text-base font-semibold text-ash-text">NHL home</p>
            <p className="mt-1 text-sm text-slate-500">Bracket overview and edition context.</p>
          </Link>
        </div>
      </section>
    </PageContainer>
  );
}
