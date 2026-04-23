import { PageContainer } from "@/components/ui/PageContainer";
import { getOfficial2026EditionTeamStatus } from "@/lib/nhl/official2026Edition";
import {
  countNhlSeriesForEdition,
  countNhlTeamsForEdition,
  fetchActiveNhlEdition,
  fetchNhlTeamSlugsForEdition,
} from "@/lib/nhl/queries";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Standings",
  description:
    "NHL playoff leaderboard for AshBracket NHL—edition context, how standings will work, and the live table as picks and scoring go live.",
};

export const dynamic = "force-dynamic";

export default async function NhlStandingsPage() {
  const supabase = await createClient();
  const { edition, error: editionError } = await fetchActiveNhlEdition(supabase);

  let teamCount = 0;
  let seriesCount = 0;
  let countsError: string | null = null;
  let slugError: string | null = null;
  let fieldStatus: ReturnType<typeof getOfficial2026EditionTeamStatus> | null = null;

  if (edition && !editionError) {
    const [teamCountRes, seriesCountRes, slugRes] = await Promise.all([
      countNhlTeamsForEdition(supabase, edition.id),
      countNhlSeriesForEdition(supabase, edition.id),
      fetchNhlTeamSlugsForEdition(supabase, edition.id),
    ]);

    if (teamCountRes.error || seriesCountRes.error) {
      countsError = teamCountRes.error ?? seriesCountRes.error ?? null;
    } else {
      teamCount = teamCountRes.count;
      seriesCount = seriesCountRes.count;
    }

    slugError = slugRes.error;
    if (!slugRes.error) {
      fieldStatus = getOfficial2026EditionTeamStatus(
        slugRes.slugs.map((s) => ({ team_slug: s })),
      );
    }
  }

  const dataError = editionError ?? slugError ?? countsError;

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
          Track the NHL playoff leaderboard as the bracket plays out. This is where ranked
          entries, points, and progress will appear once picks and scoring are connected for the
          active edition.
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          Standings and scoring are being wired in phases—live leaderboard rows are not active
          here yet, but the table below shows how the surface will look when data is available.
        </p>
      </section>

      <section className="ash-surface space-y-4 px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">Active edition &amp; status</h2>
        {dataError ? (
          <p className="text-sm leading-relaxed text-amber-200/90">
            Edition details could not be fully loaded ({dataError}). The sections below still
            describe how standings will work; try again later for live counts and edition name.
          </p>
        ) : null}

        {!edition && !editionError ? (
          <div className="space-y-2 text-sm leading-relaxed text-slate-400">
            <p>
              There is no active NHL edition in this environment yet. When an edition is
              published—typically aligned with a season such as the{" "}
              <span className="text-slate-300">2026 Stanley Cup Playoffs</span>—its name and
              bracket context will appear in this card automatically.
            </p>
            <p className="text-slate-500">
              Standings will populate once picks and scoring are enabled for that edition.
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
              <p className="mt-3 text-sm leading-relaxed text-slate-500">
                Leaderboard and scoring rules apply to this edition as they go live.
              </p>
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

            <p className="text-sm leading-relaxed text-slate-400">
              <span className="font-medium text-slate-300">Live standings:</span> not active yet
              on this page. Standings will appear once participant picks and round-based scoring
              are connected for this edition.
            </p>
          </div>
        ) : null}
      </section>

      <section className="ash-surface space-y-4 px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">How standings will work</h2>
        <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-slate-400">
          <li>Participants enter playoff bracket picks—series winners round by round.</li>
          <li>Points are planned to be awarded by round when the scoring engine is live.</li>
          <li>The leaderboard updates as real series outcomes are recorded against those picks.</li>
          <li>Later rounds are expected to carry more weight than earlier ones, matching the public
            rules direction.</li>
        </ul>
        <p className="text-sm leading-relaxed text-slate-500">
          Until scoring ships, treat this as the intended behavior—not live scoring or ranking.
        </p>
      </section>

      <section className="ash-surface px-4 py-5 sm:px-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ash-text">Leaderboard</h2>
            <p className="mt-1 text-sm text-slate-500">
              Ranked entries will list here when picks and scoring are enabled.
            </p>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-blue-500/25 bg-slate-950/60 shadow-inner shadow-blue-950/30">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-blue-500/20 bg-slate-900/80">
                  <th className="px-4 py-3 font-semibold tracking-wide text-blue-100/90">
                    Rank
                  </th>
                  <th className="px-4 py-3 font-semibold tracking-wide text-blue-100/90">
                    Entry
                  </th>
                  <th className="px-4 py-3 text-right font-semibold tracking-wide text-blue-100/90">
                    Points
                  </th>
                  <th className="px-4 py-3 text-right font-semibold tracking-wide text-blue-100/90">
                    Correct picks
                  </th>
                  <th className="px-4 py-3 font-semibold tracking-wide text-blue-100/90">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-14 text-center align-middle text-sm leading-relaxed text-slate-400"
                  >
                    <p className="font-medium text-slate-300">No NHL standings yet.</p>
                    <p className="mx-auto mt-2 max-w-md text-slate-500">
                      Standings will appear once picks and scoring are enabled for the active
                      edition. Check back after the leaderboard pipeline is connected, or open
                      Rules for how scoring is planned to work.
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="ash-surface space-y-4 px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">Round-based scoring (planned)</h2>
        <p className="text-sm leading-relaxed text-slate-400">
          Standings are planned to use round-based scoring: each correct series winner in a
          playoff round would earn credit for that round. Exact point values and tie-breakers are
          not finalized yet; wording here matches the public{" "}
          <Link href="/nhl/rules" className="text-blue-300 underline-offset-2 hover:text-blue-200">
            Rules
          </Link>{" "}
          page.
        </p>
        <p className="text-sm font-medium text-slate-300">Illustrative structure (planned)</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {[
            { round: "Round 1", detail: "Credit for each correct series winner (planned)." },
            { round: "Round 2", detail: "Credit for each correct series winner (planned)." },
            {
              round: "Conference finals",
              detail: "Credit for each correct series winner (planned).",
            },
            {
              round: "Stanley Cup Final",
              detail: "Credit for picking the series winner and champion (planned).",
            },
          ].map((row) => (
            <li
              key={row.round}
              className="rounded-lg border border-blue-500/15 bg-slate-950/40 px-4 py-3"
            >
              <p className="text-sm font-semibold text-ash-text">{row.round}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{row.detail}</p>
            </li>
          ))}
        </ul>
        <p className="text-sm leading-relaxed text-slate-500">
          Leaderboard scoring is planned to increase by round; final multipliers will be confirmed
          when the scoring model ships.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-ash-text">Explore the NHL section</h2>
        <p className="mt-1 text-sm text-slate-400">
          Stay inside the NHL area—open rules, picks, or home from here.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link
            href="/nhl/rules"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35"
          >
            <p className="text-base font-semibold text-ash-text">Rules</p>
            <p className="mt-1 text-sm text-slate-500">Scoring design and pool rules.</p>
          </Link>
          <Link
            href="/nhl/picks"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35"
          >
            <p className="text-base font-semibold text-ash-text">Picks</p>
            <p className="mt-1 text-sm text-slate-500">Where bracket picks will live.</p>
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
