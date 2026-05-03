import { NhlBracketPreviewLive } from "@/components/nhl/NhlBracketPreviewLive";
import { PageContainer } from "@/components/ui/PageContainer";
import { getOfficial2026EditionTeamStatus } from "@/lib/nhl/official2026Edition";
import {
  countNhlSeriesForEdition,
  countNhlTeamsForEdition,
  fetchActiveNhlEdition,
  fetchNhlSeriesRowsWithPublicLiveOverlay,
  fetchNhlTeamSlugsForEdition,
} from "@/lib/nhl/queries";
import { createClient } from "@/lib/supabase/server";
import { unstable_noStore as noStore } from "next/cache";
import { connection } from "next/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NhlHomePage() {
  noStore();
  await connection();
  const supabase = await createClient();
  const { edition, error: editionError } = await fetchActiveNhlEdition(supabase);

  let teamCount = 0;
  let seriesCount = 0;
  let seriesRows: Awaited<ReturnType<typeof fetchNhlSeriesRowsWithPublicLiveOverlay>>["rows"] = [];
  let seriesError: string | null = null;
  let countsError: string | null = null;
  let slugError: string | null = null;
  let fieldStatus: ReturnType<typeof getOfficial2026EditionTeamStatus> | null = null;

  if (edition && !editionError) {
    const [teamCountRes, seriesCountRes, seriesRes, slugRes] = await Promise.all([
      countNhlTeamsForEdition(supabase, edition.id),
      countNhlSeriesForEdition(supabase, edition.id),
      fetchNhlSeriesRowsWithPublicLiveOverlay(supabase, edition.id),
      fetchNhlTeamSlugsForEdition(supabase, edition.id),
    ]);

    if (teamCountRes.error || seriesCountRes.error) {
      countsError = teamCountRes.error ?? seriesCountRes.error ?? null;
    } else {
      teamCount = teamCountRes.count;
      seriesCount = seriesCountRes.count;
    }

    seriesRows = seriesRes.rows;
    seriesError = seriesRes.error;
    slugError = slugRes.error;
    if (!slugRes.error) {
      fieldStatus = getOfficial2026EditionTeamStatus(
        slugRes.slugs.map((s) => ({ team_slug: s })),
      );
    }
  }

  const dataError = editionError ?? seriesError ?? slugError ?? countsError;

  return (
    <PageContainer compactBottom>
      <section className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-slate-950/80 via-slate-900/40 to-blue-950/30 px-5 py-8 shadow-lg shadow-blue-950/20 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-300/90">
          AshBracket NHL
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ash-text sm:text-4xl">
          AshBracket NHL Playoffs
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300">
          Follow the 2026 Stanley Cup Playoffs bracket in read-only form, read how the NHL pool will
          work, and check standings context as this section rolls out. NHL bracket pick entry on
          AshBracket is not open yet.
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          Rules, the matchup preview, and standings are being added in phases—everything here stays
          inside the NHL area of AshBracket. Nothing here saves World Cup picks.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="#nhl-bracket-preview" className="btn-primary">
            View bracket
          </a>
          <Link href="/nhl/rules" className="btn-ghost border-blue-500/25">
            See rules
          </Link>
          <Link href="/nhl/picks" className="btn-ghost border-blue-500/25">
            Round 1 preview
          </Link>
        </div>
      </section>

      <section className="ash-surface px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">Active edition</h2>
        {dataError ? (
          <p className="mt-2 text-sm text-amber-200/90">
            Some NHL data could not be loaded ({dataError}). You can still open Rules, Preview, or
            Standings from the navigation above.
          </p>
        ) : null}

        {!edition && !editionError ? (
          <div className="mt-3 space-y-2 text-sm leading-relaxed text-slate-400">
            <p>There is no active NHL edition in this environment yet.</p>
            <p>
              When an edition is published for the playoffs, this page will show the name, team
              count, and Round 1 pairings automatically.
            </p>
          </div>
        ) : null}

        {edition && !editionError ? (
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-xl font-semibold text-ash-text">{edition.name}</p>
              <p className="text-sm text-slate-400">
                Season <span className="text-slate-300">{edition.season_label}</span>
                {edition.slug ? (
                  <span className="text-slate-600"> · {edition.slug}</span>
                ) : null}
              </p>
            </div>
            <p className="text-sm text-slate-400">
              {countsError
                ? "Team and series counts are temporarily unavailable."
                : `${teamCount} team${teamCount === 1 ? "" : "s"} · ${seriesCount} series slot${seriesCount === 1 ? "" : "s"}`}
            </p>
            {fieldStatus === "official_2026" ? (
              <p className="inline-flex items-center gap-2 rounded-full border border-emerald-500/35 bg-emerald-950/30 px-3 py-1 text-xs font-medium text-emerald-100/95">
                Official 2026 playoff field loaded
              </p>
            ) : fieldStatus === "non_official" && teamCount > 0 ? (
              <p className="text-xs text-slate-500">
                Team list loaded; it does not match the canonical 2026 field—pairings are shown as
                stored.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section id="nhl-bracket-preview" className="scroll-mt-28">
        <h2 className="text-lg font-semibold text-ash-text">Bracket preview</h2>
        <p className="mt-1 text-sm text-slate-400">
          Round 1 cards pull live scores from the league playoff-bracket feed when it&apos;s
          available, and still respect your database for pairings. Later rounds use your stored
          matchup rows as teams advance.
        </p>

        {seriesRows.length > 0 && !seriesError ? (
          <div className="mt-5">
            <NhlBracketPreviewLive initialRows={seriesRows} includeRound1 />
          </div>
        ) : edition && !editionError && !seriesError && seriesRows.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-blue-500/25 bg-slate-950/40 px-4 py-8 text-center text-sm text-slate-500">
            Series rows are not set up for this edition yet, so there is nothing to preview. When
            the bracket skeleton and Round 1 assignments are present, they will appear here.
          </div>
        ) : edition && !editionError && seriesError ? (
          <div className="mt-5 rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-6 text-sm text-red-200/95">
            Bracket data could not be loaded.
          </div>
        ) : !edition && !editionError ? (
          <div className="mt-5 rounded-lg border border-dashed border-slate-600/50 bg-slate-950/40 px-4 py-8 text-center text-sm text-slate-500">
            Bracket preview will appear once an active NHL edition and series data exist.
          </div>
        ) : !edition && editionError ? (
          <div className="mt-5 rounded-lg border border-dashed border-slate-600/50 bg-slate-950/40 px-4 py-8 text-center text-sm text-slate-500">
            Bracket preview is unavailable because the active edition could not be loaded.
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-ash-text">How the NHL pool will work</h2>
        <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-relaxed text-slate-400">
          <li>When NHL bracket entry opens, choose the winner of each playoff series.</li>
          <li>Advance winners through the bracket round by round.</li>
          <li>Later rounds unlock logically as the real playoffs progress.</li>
          <li>Standings and scoring will update here as results are recorded.</li>
        </ul>
        <p className="mt-3 text-sm text-slate-500">
          The NHL section is under active development; treat Rules, the read-only preview, and
          Standings as early destinations that will gain behavior over time.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-ash-text">Explore the NHL section</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link
            href="/nhl/rules"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35"
          >
            <p className="text-base font-semibold text-ash-text">Rules</p>
            <p className="mt-1 text-sm text-slate-500">Scoring and pool rules for the NHL area.</p>
          </Link>
          <Link
            href="/nhl/picks"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35"
          >
            <p className="text-base font-semibold text-ash-text">Matchup preview</p>
            <p className="mt-1 text-sm text-slate-500">
              Read-only Round 1 pairings and bracket layout—no pick entry yet.
            </p>
          </Link>
          <Link
            href="/nhl/standings"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35"
          >
            <p className="text-base font-semibold text-ash-text">Standings</p>
            <p className="mt-1 text-sm text-slate-500">Leaderboard and results as they ship.</p>
          </Link>
        </div>
      </section>
    </PageContainer>
  );
}
