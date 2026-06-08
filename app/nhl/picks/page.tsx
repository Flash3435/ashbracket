import { NhlBracketPreviewLive } from "@/components/nhl/NhlBracketPreviewLive";
import { NhlPicksRound1Grid } from "@/components/nhl/NhlPicksRound1Grid";
import { NhlPicksRound2Grid } from "@/components/nhl/NhlPicksRound2Grid";
import { NhlPicksRoundSummary } from "@/components/nhl/NhlPicksRoundSummary";
import { PageContainer } from "@/components/ui/PageContainer";
import { buildNhlAdminBracketViewModel } from "@/lib/nhl/bracketViewModel";
import { getOfficial2026EditionTeamStatus } from "@/lib/nhl/official2026Edition";
import { isNhlEditionLocked } from "@/lib/nhl/nhlEditionLock";
import {
  buildRound1UserSummary,
  isRound1FullyResolvedForProgression,
  mergeRound2DisplayFromRound1,
} from "@/lib/nhl/nhlPicksProgression";
import {
  countNhlSeriesForEdition,
  countNhlTeamsForEdition,
  fetchActiveNhlEdition,
  fetchNhlEditionStandings,
  fetchNhlR1PicksForEdition,
  fetchNhlR2PicksForEdition,
  fetchNhlSeriesRowsWithPublicLiveOverlay,
  fetchNhlTeamSlugsForEdition,
  fetchNhlTeamsForEdition,
} from "@/lib/nhl/queries";
import type { NhlSeriesRow } from "@/lib/nhl/types";
import { createClient } from "@/lib/supabase/server";
import { unstable_noStore as noStore } from "next/cache";
import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Playoff picks",
  description:
    "Stanley Cup Playoff series-winner picks for the active AshBracket NHL edition — Round 1 results, Round 2 progression, and later rounds preview.",
};

export const dynamic = "force-dynamic";

function round1Rows(seriesRows: NhlSeriesRow[]): NhlSeriesRow[] {
  return seriesRows.filter((r) => r.round_code === "R1");
}

/** PostgREST when picks migrations have not been applied to the linked project yet. */
function formatNhlPicksLoadError(message: string, tableHint: "r1" | "r2"): string {
  const m = message.toLowerCase();
  const tableName = tableHint === "r1" ? "nhl_r1_series_picks" : "nhl_r2_series_picks";
  const migrationFile =
    tableHint === "r1"
      ? "`20260422153000_nhl_r1_series_picks.sql`"
      : "`20260504120000_nhl_r2_series_picks_and_sync.sql`";
  if (
    m.includes(tableName) &&
    (m.includes("schema cache") || m.includes("does not exist") || m.includes("not find"))
  ) {
    return (
      `The Supabase project is missing the \`${tableName}\` table. Apply migration ${migrationFile} ` +
      "(e.g. `supabase db push` from the ashbracket repo, or paste that file into the Supabase SQL editor), " +
      "then refresh."
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
  let displayRows: NhlSeriesRow[] = [];
  let seriesError: string | null = null;
  let countsError: string | null = null;
  let slugError: string | null = null;
  let teamsLoadError: string | null = null;
  let fieldStatus: ReturnType<typeof getOfficial2026EditionTeamStatus> | null = null;
  let round1PickBySeriesId: Record<string, string> = {};
  let picksLoadError: string | null = null;
  let round2PickBySeriesId: Record<string, string> = {};
  let r2PicksLoadError: string | null = null;
  let userPoolTotalPoints: number | null = null;

  if (edition && !editionError) {
    const [teamCountRes, seriesCountRes, slugRes, teamsRes] = await Promise.all([
      countNhlTeamsForEdition(supabase, edition.id),
      countNhlSeriesForEdition(supabase, edition.id),
      fetchNhlTeamSlugsForEdition(supabase, edition.id),
      fetchNhlTeamsForEdition(supabase, edition.id),
    ]);

    if (teamCountRes.error || seriesCountRes.error) {
      countsError = teamCountRes.error ?? seriesCountRes.error ?? null;
    } else {
      teamCount = teamCountRes.count;
      seriesCount = seriesCountRes.count;
    }

    slugError = slugRes.error;
    teamsLoadError = teamsRes.error;
    if (!slugRes.error) {
      fieldStatus = getOfficial2026EditionTeamStatus(
        slugRes.slugs.map((s) => ({ team_slug: s })),
      );
    }

    const teams = teamsRes.teams ?? [];

    let seriesRes = await fetchNhlSeriesRowsWithPublicLiveOverlay(supabase, edition.id);
    seriesRows = seriesRes.rows;
    seriesError = seriesRes.error;

    if (!seriesError) {
      await supabase.rpc("sync_nhl_r2_slots_from_r1", { p_edition_id: edition.id });
      seriesRes = await fetchNhlSeriesRowsWithPublicLiveOverlay(supabase, edition.id);
      if (!seriesRes.error) {
        seriesRows = seriesRes.rows;
      }
    }

    displayRows = teamsLoadError ? seriesRows : mergeRound2DisplayFromRound1(seriesRows, teams);

    if (user) {
      const [pickRes, pickR2, standingsRes] = await Promise.all([
        fetchNhlR1PicksForEdition(supabase, edition.id),
        fetchNhlR2PicksForEdition(supabase, edition.id),
        fetchNhlEditionStandings(supabase, edition.id),
      ]);
      round1PickBySeriesId = pickRes.pickBySeriesId;
      picksLoadError = pickRes.error;
      round2PickBySeriesId = pickR2.pickBySeriesId;
      r2PicksLoadError = pickR2.error;
      if (!standingsRes.error) {
        const mine = standingsRes.rows.find((r) => r.user_id === user.id);
        userPoolTotalPoints = mine ? mine.total_points : null;
      }
    }
  }

  const dataError = editionError ?? seriesError ?? slugError ?? countsError;
  const picksLocked = edition && !editionError ? isNhlEditionLocked(edition.lock_at) : false;

  const model =
    edition && !editionError && !seriesError && displayRows.length > 0
      ? buildNhlAdminBracketViewModel(displayRows)
      : null;

  const r1All = round1Rows(displayRows);
  const r1Complete = r1All.filter(
    (r) =>
      (r.higher_team_abbr || r.higher_team_name) &&
      (r.lower_team_abbr || r.lower_team_name),
  );
  const eastR1 = model?.east.r1 ?? [];
  const westR1 = model?.west.r1 ?? [];
  const eastR2 = model?.east.r2 ?? [];
  const westR2 = model?.west.r2 ?? [];
  const showRound1Grid = r1All.length > 0 && !seriesError;
  const round1Fallback =
    eastR1.length === 0 && westR1.length === 0 && r1All.length > 0 ? r1All : undefined;

  const round1ProgressComplete = isRound1FullyResolvedForProgression(displayRows);
  const r1UserSummary = user
    ? r1All.length > 0
      ? buildRound1UserSummary(r1All, round1PickBySeriesId)
      : {
          totalSeries: 0,
          resolvedSeries: 0,
          pickedSeries: 0,
          correctCount: 0,
          incorrectCount: 0,
          pendingPickCount: 0,
          noPickResolvedCount: 0,
          round1PointsEarned: 0,
        }
    : null;
  const round2Open = Boolean(
    edition && user && round1ProgressComplete && !picksLocked && !r2PicksLoadError,
  );

  return (
    <PageContainer compactBottom>
      <section className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-slate-950/80 via-slate-900/40 to-blue-950/30 px-5 py-8 shadow-lg shadow-blue-950/20 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-300/90">
          AshBracket NHL
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ash-text sm:text-4xl">
          Playoff picks
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-300">
          Round-by-round series winners for the active NHL edition. Round 1 stays visible as results
          come in; Round 2 opens once every first-round series has a winner, using the same bracket
          tree as the real playoffs.
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          Picks are stored in NHL-only tables and never touch World Cup pick flows. Tap a team card
          to save (sign-in required).
        </p>
        {edition && !editionError ? (
          <div className="mt-4 max-w-2xl space-y-2 text-sm leading-relaxed">
            {picksLocked ? (
              <p className="rounded-xl border border-amber-500/35 bg-amber-950/25 px-4 py-3 text-amber-100/95">
                This edition&apos;s pick window is closed (lock time has passed). You can still
                review completed rounds, but new changes are not accepted.
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
                . After that moment, picks cannot be changed.
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

      {edition && !editionError ? (
        <section className="mt-6 px-1 sm:px-0">
          <NhlPicksRoundSummary
            isAuthenticated={Boolean(user)}
            round1Complete={round1ProgressComplete}
            round2Open={round2Open}
            picksLocked={picksLocked}
            summary={r1UserSummary}
            r2PicksLoadError={r2PicksLoadError}
            totalPoolPoints={userPoolTotalPoints}
          />
        </section>
      ) : null}

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
            <span className="font-medium text-amber-100/95">Saved Round 1 picks unavailable. </span>
            {formatNhlPicksLoadError(picksLoadError, "r1")}
          </p>
        ) : null}

        {!edition && !editionError ? (
          <div className="space-y-2 text-sm leading-relaxed text-slate-400">
            <p>There is no active NHL edition in this environment yet.</p>
            <p>
              When an edition is published for the playoffs, this page will show its name, team
              and series counts, and matchups automatically.
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
        <h2 className="text-lg font-semibold text-ash-text">Playoff progression</h2>
        <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-slate-400">
          <li>
            <span className="text-slate-300">Round 1</span> —{" "}
            {round1ProgressComplete
              ? "complete. Your picks and results stay below for reference."
              : "in progress. Finish your picks while the window is open; results appear as each series ends."}
          </li>
          <li>
            <span className="text-slate-300">Round 2</span> —{" "}
            {round1ProgressComplete
              ? picksLocked
                ? "locked with the edition; cards below show how you lined up the second round."
                : r2PicksLoadError
                  ? "ready in the UI, but pick storage needs the latest database migration (see banner above)."
                  : "picks are open. Matchups use Round 1 winners on the bracket path (East/West R2 slots 1–2 from R1 slots 1–2 and 3–4)."
              : "waiting until every Round 1 series has a decided winner in this pool."}
          </li>
          <li>
            <span className="text-slate-300">Conference Finals</span> — locked for now. They will
            unlock once Round 2 is fully complete and the bracket advances the same way.
          </li>
          <li>
            <span className="text-slate-300">Stanley Cup Final</span> — locked until the conference
            champions are known.
          </li>
        </ul>
      </section>

      <section className="ash-surface space-y-4 px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">How bracket play works</h2>
        <p className="text-sm leading-relaxed text-slate-400">
          The pool follows the real Stanley Cup Playoff tree. You choose each series winner (not
          individual games). Scoring weights match the standings page (Round 1 = 1 pt, Round 2 = 2
          pts per correct series, etc.).
        </p>
      </section>

      <section className="space-y-4">
        <div className="px-1 sm:px-0">
          <h2 className="text-lg font-semibold text-ash-text">Round 1 · results &amp; history</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-400">
            Each card shows your pick, whether it was right or wrong once the series ends, and the
            live score overlay when the league feed is available.
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

      <section className="space-y-4">
        <div className="px-1 sm:px-0">
          <h2 className="text-lg font-semibold text-ash-text">Round 2 · active picks</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-400">
            When all Round 1 winners are known, each conference&apos;s second round fills with those
            clubs (better regular-season seed listed as higher seed). If a slot still shows &quot;Waiting on
            Round 1&quot;, the pool is missing a result for one of its feeder series—check back after
            sync or admin updates.
          </p>
        </div>

        {r2PicksLoadError && user ? (
          <p className="text-sm text-amber-200/90">
            <span className="font-medium text-amber-100/95">Round 2 picks unavailable. </span>
            {formatNhlPicksLoadError(r2PicksLoadError, "r2")}
          </p>
        ) : null}

        {showRound1Grid && edition && !seriesError && eastR2.length + westR2.length > 0 ? (
          <div className="rounded-2xl border border-violet-500/20 bg-slate-950/25 px-4 py-6 sm:px-6">
            <NhlPicksRound2Grid
              east={eastR2}
              west={westR2}
              editionId={edition.id}
              round2PickBySeriesId={round2PickBySeriesId}
              picksLocked={picksLocked}
              isAuthenticated={Boolean(user)}
            />
          </div>
        ) : edition && !editionError && !seriesError && model && eastR2.length === 0 && westR2.length === 0 ? (
          <div className="rounded-xl border border-dashed border-violet-500/25 bg-slate-950/40 px-4 py-8 text-center text-sm leading-relaxed text-slate-500">
            Round 2 series rows are not present for this edition.
          </div>
        ) : null}
      </section>

      <section className="ash-surface space-y-4 px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">Later rounds · preview</h2>
        <p className="text-sm leading-relaxed text-slate-400">
          Conference Finals and the Stanley Cup Final stay locked on this page until those rounds
          ship here. The compact bracket still previews how winners propagate through the tree.
        </p>
        {model ? (
          <div className="mt-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Bracket path (Rounds 1–2 summarized above)
            </p>
            <div className="mt-3">
              <NhlBracketPreviewLive initialRows={displayRows} includeRound1={false} />
            </div>
          </div>
        ) : edition && !editionError && !seriesError && displayRows.length === 0 ? (
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
            <p className="mt-1 text-sm text-slate-500">Leaderboard and points as rounds resolve.</p>
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
