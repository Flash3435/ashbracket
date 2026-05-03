import { NhlBracketPreviewLive } from "@/components/nhl/NhlBracketPreviewLive";
import { NhlPicksRound1Grid } from "@/components/nhl/NhlPicksRound1Grid";
import { PageContainer } from "@/components/ui/PageContainer";
import { buildNhlAdminBracketViewModel } from "@/lib/nhl/bracketViewModel";
import { getOfficial2026EditionTeamStatus } from "@/lib/nhl/official2026Edition";
import { isNhlEditionLocked } from "@/lib/nhl/nhlEditionLock";
import {
  countNhlSeriesForEdition,
  countNhlTeamsForEdition,
  fetchActiveNhlEdition,
  fetchNhlR1PicksForEdition,
  fetchNhlSeriesRowsWithPublicLiveOverlay,
  fetchNhlTeamSlugsForEdition,
} from "@/lib/nhl/queries";
import type { NhlSeriesRow } from "@/lib/nhl/types";
import { createClient } from "@/lib/supabase/server";
import { unstable_noStore as noStore } from "next/cache";
import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Round 1 picks",
  description:
    "Round 1 Stanley Cup Playoff series-winner picks for the active AshBracket NHL edition. Choices are saved per signed-in user and stay separate from World Cup pools.",
};

export const dynamic = "force-dynamic";

function round1Rows(seriesRows: NhlSeriesRow[]): NhlSeriesRow[] {
  return seriesRows.filter((r) => r.round_code === "R1");
}

/** PostgREST when the picks migration has not been applied to the linked project yet. */
function formatNhlPicksLoadError(message: string): string {
  const m = message.toLowerCase();
  if (
    m.includes("nhl_r1_series_picks") &&
    (m.includes("schema cache") || m.includes("does not exist") || m.includes("not find"))
  ) {
    return (
      "The Supabase project is missing the `nhl_r1_series_picks` table. Apply migration " +
      "`20260422153000_nhl_r1_series_picks.sql` (e.g. `supabase db push` from the ashbracket repo, " +
      "or paste that file into the Supabase SQL editor), then refresh. Until then, matchups still load but picks cannot load or save."
    );
  }
  return `${message} Try refreshing after signing in.`;
}

export default async function NhlPicksPage() {
  noStore();
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { edition, error: editionError } = await fetchActiveNhlEdition(supabase);

  let teamCount = 0;
  let seriesCount = 0;
  let seriesRows: NhlSeriesRow[] = [];
  let seriesError: string | null = null;
  let countsError: string | null = null;
  let slugError: string | null = null;
  let fieldStatus: ReturnType<typeof getOfficial2026EditionTeamStatus> | null = null;
  let round1PickBySeriesId: Record<string, string> = {};
  let picksLoadError: string | null = null;

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

    if (user) {
      const pickRes = await fetchNhlR1PicksForEdition(supabase, edition.id);
      round1PickBySeriesId = pickRes.pickBySeriesId;
      picksLoadError = pickRes.error;
    }
  }

  const dataError = editionError ?? seriesError ?? slugError ?? countsError;
  const picksLocked = edition && !editionError ? isNhlEditionLocked(edition.lock_at) : false;

  const model =
    edition && !editionError && !seriesError && seriesRows.length > 0
      ? buildNhlAdminBracketViewModel(seriesRows)
      : null;

  const r1All = round1Rows(seriesRows);
  const r1Complete = r1All.filter(
    (r) =>
      (r.higher_team_abbr || r.higher_team_name) &&
      (r.lower_team_abbr || r.lower_team_name),
  );
  const eastR1 = model?.east.r1 ?? [];
  const westR1 = model?.west.r1 ?? [];
  const showRound1Grid = r1All.length > 0 && !seriesError;
  const round1Fallback =
    eastR1.length === 0 && westR1.length === 0 && r1All.length > 0 ? r1All : undefined;

  return (
    <PageContainer compactBottom>
      <section className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-slate-950/80 via-slate-900/40 to-blue-950/30 px-5 py-8 shadow-lg shadow-blue-950/20 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-300/90">
          AshBracket NHL
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ash-text sm:text-4xl">
          Round 1 picks
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-300">
          Choose a winner for each Round 1 series for the active NHL edition. Only this round is
          wired for entry today—later rounds stay preview-only until their flows ship.
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          Picks are stored in NHL-only tables and never touch World Cup pick flows. Tap a team card
          to save immediately (sign-in required).
        </p>
        {edition && !editionError ? (
          <div className="mt-4 max-w-2xl space-y-2 text-sm leading-relaxed">
            {picksLocked ? (
              <p className="rounded-xl border border-amber-500/35 bg-amber-950/25 px-4 py-3 text-amber-100/95">
                This edition&apos;s pick window is closed (lock time has passed). You can still
                review Round 1, but new changes are not accepted.
              </p>
            ) : edition.lock_at ? (
              <p className="rounded-xl border border-blue-500/25 bg-slate-950/50 px-4 py-3 text-slate-300">
                Lock scheduled for{" "}
                <span className="font-medium text-slate-100">
                  {new Date(edition.lock_at).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
                . After that moment, Round 1 picks cannot be changed.
              </p>
            ) : (
              <p className="rounded-xl border border-slate-600/40 bg-slate-950/45 px-4 py-3 text-slate-400">
                No <code className="rounded bg-slate-900/80 px-1 py-0.5 text-slate-200">lock_at</code>{" "}
                is set on this edition yet, so the database still treats the window as open. Add a
                lock time on the edition when you are ready to freeze picks.
              </p>
            )}
          </div>
        ) : null}
      </section>

      <section className="ash-surface space-y-4 px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">Active edition</h2>

        {dataError ? (
          <p className="text-sm text-amber-200/90">
            Some NHL data could not be loaded ({dataError}). Matchup cards appear when the edition
            and series load successfully.
          </p>
        ) : null}

        {picksLoadError ? (
          <p className="text-sm text-amber-200/90">
            <span className="font-medium text-amber-100/95">Saved picks unavailable. </span>
            {formatNhlPicksLoadError(picksLoadError)}
          </p>
        ) : null}

        {!edition && !editionError ? (
          <div className="space-y-2 text-sm leading-relaxed text-slate-400">
            <p>There is no active NHL edition in this environment yet.</p>
            <p>
              When an edition is published for the playoffs, this page will show its name, team
              and series counts, and Round 1 matchups automatically.
            </p>
          </div>
        ) : null}

        {edition && !editionError ? (
          <div className="space-y-3">
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
            <div className="flex flex-wrap gap-2">
              {fieldStatus === "official_2026" ? (
                <span className="inline-flex items-center rounded-full border border-emerald-500/35 bg-emerald-950/30 px-3 py-1 text-xs font-medium text-emerald-100/95">
                  Official 2026 playoff field loaded
                </span>
              ) : null}
              {r1All.length > 0 && r1Complete.length === r1All.length ? (
                <span className="inline-flex items-center rounded-full border border-blue-400/30 bg-blue-950/35 px-3 py-1 text-xs font-medium text-blue-100/90">
                  Round 1 matchups available
                </span>
              ) : null}
              {r1All.length > 0 && r1Complete.length < r1All.length ? (
                <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-950/25 px-3 py-1 text-xs font-medium text-amber-100/90">
                  Round 1 slots present; some pairings still loading
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {edition && editionError ? (
          <p className="text-sm text-slate-400">
            The active edition could not be loaded ({editionError}). Try again later, or open the
            NHL home page from the navigation.
          </p>
        ) : null}
      </section>

      <section className="ash-surface space-y-4 px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">How bracket play works</h2>
        <p className="text-sm leading-relaxed text-slate-400">
          The pool follows the real Stanley Cup Playoff tree. You choose each series winner (not
          individual games). This page currently records Round 1 only; later rounds remain
          informational until their pick flows exist.
        </p>
        <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-slate-400">
          <li>Round 1: one predicted winner per series below (live on this page).</li>
          <li>Round 2 onward: preview on this page; pick entry for those rounds is not implemented yet.</li>
          <li>Conference Finals and Stanley Cup Final will continue the same series-winner pattern when shipped.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <div className="px-1 sm:px-0">
          <h2 className="text-lg font-semibold text-ash-text">Round 1 · choose series winners</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-400">
            Matchups come from your edition&apos;s Round 1 rows; series scores on this page overlay
            the league playoff bracket feed when it&apos;s reachable (no extra setup required). Tap a
            team to save your pick for each series.
          </p>
        </div>

        {seriesError && edition ? (
          <div className="rounded-xl border border-red-800/45 bg-red-950/25 px-4 py-5 text-sm text-red-100/90">
            Round 1 data could not be loaded. Please try again later.
          </div>
        ) : null}

        {showRound1Grid && edition ? (
          <div className="rounded-2xl border border-blue-500/15 bg-slate-950/25 px-4 py-6 sm:px-6">
            <NhlPicksRound1Grid
              east={eastR1}
              west={westR1}
              fallback={round1Fallback}
              editionId={edition.id}
              round1PickBySeriesId={round1PickBySeriesId}
              picksLocked={picksLocked}
              isAuthenticated={Boolean(user)}
            />
          </div>
        ) : edition && !editionError && !seriesError && r1All.length === 0 ? (
          <div className="rounded-xl border border-dashed border-blue-500/25 bg-slate-950/40 px-4 py-8 text-center text-sm leading-relaxed text-slate-500">
            Round 1 series rows are not set up for this edition yet. When the bracket skeleton and
            team assignments are present, the eight first-round series will appear here.
          </div>
        ) : !edition && !editionError ? (
          <div className="rounded-xl border border-dashed border-slate-600/50 bg-slate-950/40 px-4 py-8 text-center text-sm leading-relaxed text-slate-500">
            Matchup cards will appear once an active NHL edition exists and Round 1 series are
            configured.
          </div>
        ) : null}
      </section>

      <section className="ash-surface space-y-4 px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">Later rounds</h2>
        <p className="text-sm leading-relaxed text-slate-400">
          Round 2, Conference Finals, and the Stanley Cup Final stay tied to winners from earlier
          rounds. Until those teams are known, later slots may show placeholders or empty pairings.
          That is expected: the bracket opens up as the real playoffs advance.
        </p>
        {model ? (
          <div className="mt-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Compact bracket path (Round 1 summarized above)
            </p>
            <div className="mt-3">
              <NhlBracketPreviewLive initialRows={seriesRows} includeRound1={false} />
            </div>
          </div>
        ) : edition && !editionError && !seriesError && seriesRows.length === 0 ? (
          <p className="text-sm text-slate-500">
            A bracket path preview will appear here once series rows exist for the active edition.
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-ash-text">Next steps</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link
            href="/nhl/rules"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35"
          >
            <p className="text-base font-semibold text-ash-text">Review rules</p>
            <p className="mt-1 text-sm text-slate-500">Format, planned scoring, and lock timing.</p>
          </Link>
          <Link
            href="/nhl/standings"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35"
          >
            <p className="text-base font-semibold text-ash-text">Check standings</p>
            <p className="mt-1 text-sm text-slate-500">Leaderboard and results as they ship.</p>
          </Link>
          <Link
            href="/nhl"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35"
          >
            <p className="text-base font-semibold text-ash-text">Back to NHL home</p>
            <p className="mt-1 text-sm text-slate-500">Overview, edition summary, and bracket.</p>
          </Link>
        </div>
      </section>
    </PageContainer>
  );
}
