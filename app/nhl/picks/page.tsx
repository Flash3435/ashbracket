import { NhlFinalRoundsPicks } from "@/components/nhl/NhlFinalRoundsPicks";
import { NhlPicksRound1Grid } from "@/components/nhl/NhlPicksRound1Grid";
import { NhlPicksRound2Grid } from "@/components/nhl/NhlPicksRound2Grid";
import { NhlPicksRoundSummary } from "@/components/nhl/NhlPicksRoundSummary";
import { PageContainer } from "@/components/ui/PageContainer";
import { buildNhlAdminBracketViewModel } from "@/lib/nhl/bracketViewModel";
import { getOfficial2026EditionTeamStatus } from "@/lib/nhl/official2026Edition";
import { isNhlEditionLocked } from "@/lib/nhl/nhlEditionLock";
import {
  buildConferenceFinalUserSummary,
  buildRound1UserSummary,
  buildRound2UserSummary,
  buildStanleyCupFinalUserSummary,
  conferenceFinalsMatchupsReady,
  isRound1FullyResolvedForProgression,
  isRound2FullyResolvedForProgression,
  mergeFinalRoundsDisplayFromPriorWinners,
  mergeRound2DisplayFromRound1,
  stanleyCupFinalMatchupReady,
} from "@/lib/nhl/nhlPicksProgression";
import { prepareNhlEditionBracketForScoring } from "@/lib/nhl/prepareNhlEditionBracket";
import {
  picksLinkageLooksBroken,
  hasUnresolvedLegacyPicks,
} from "@/lib/nhl/nhlPickResolution";
import {
  countNhlSeriesForEdition,
  countNhlTeamsForEdition,
  fetchActiveNhlEdition,
  fetchNhlEditionStandings,
  fetchNhlCfPicksForEdition,
  fetchNhlR1PicksForEdition,
  fetchNhlR2PicksForEdition,
  fetchNhlScfPicksForEdition,
  fetchNhlSeriesRowsWithPublicLiveOverlay,
  fetchNhlTeamSlugsForEdition,
  fetchNhlTeamsForEdition,
  type NhlPickResolutionMeta,
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
    "Stanley Cup Playoff series-winner picks for the active AshBracket NHL edition — Round 1–2 and unified Final Rounds (Conference Finals + Stanley Cup).",
};

export const dynamic = "force-dynamic";

function round1Rows(seriesRows: NhlSeriesRow[]): NhlSeriesRow[] {
  return seriesRows.filter((r) => r.round_code === "R1");
}

function formatNhlPicksLoadError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("schema cache") || m.includes("does not exist") || m.includes("not find")) {
    return "Saved picks are temporarily unavailable on this site. Please try again later.";
  }
  return "We could not load your saved picks. Try refreshing the page after signing in.";
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
  let r1PickResolution: NhlPickResolutionMeta | null = null;
  let r2PickResolution: NhlPickResolutionMeta | null = null;
  let cfPickBySeriesId: Record<string, string> = {};
  let cfPicksLoadError: string | null = null;
  let scfPickBySeriesId: Record<string, string> = {};
  let scfPicksLoadError: string | null = null;
  let cfPickResolution: NhlPickResolutionMeta | null = null;
  let scfPickResolution: NhlPickResolutionMeta | null = null;
  let userTotalPoints: number | null = null;
  let userRound2Points: number | null = null;
  let userConferenceFinalPoints: number | null = null;
  let userStanleyCupFinalPoints: number | null = null;

  if (edition && !editionError) {
    await prepareNhlEditionBracketForScoring(edition.id, supabase);

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

    let seriesRes = await fetchNhlSeriesRowsWithPublicLiveOverlay(supabase, edition.id);
    seriesRows = seriesRes.rows;
    seriesError = seriesRes.error;

    if (!seriesError) {
      await supabase.rpc("sync_nhl_r2_slots_from_r1", { p_edition_id: edition.id });
      await supabase.rpc("sync_nhl_cf_slots_from_r2", { p_edition_id: edition.id });
      await supabase.rpc("sync_nhl_scf_slots_from_cf", { p_edition_id: edition.id });
      seriesRes = await fetchNhlSeriesRowsWithPublicLiveOverlay(supabase, edition.id);
      if (!seriesRes.error) {
        seriesRows = seriesRes.rows;
      }
    }

    const teams = teamsRes.teams ?? [];
    displayRows = teamsLoadError
      ? seriesRows
      : mergeFinalRoundsDisplayFromPriorWinners(
          mergeRound2DisplayFromRound1(seriesRows, teams),
          teams,
        );

    if (user) {
      const r1SeriesForPicks = displayRows.filter((r) => r.round_code === "R1");
      const r2SeriesForPicks = displayRows.filter((r) => r.round_code === "R2");
      const cfSeriesForPicks = displayRows.filter((r) => r.round_code === "CF");
      const scfSeriesForPicks = displayRows.filter((r) => r.round_code === "SCF");
      const [pickRes, pickR2, pickCf, pickScf, standingsRes] = await Promise.all([
        fetchNhlR1PicksForEdition(supabase, edition.id, {
          currentR1SeriesRows: r1SeriesForPicks,
          activeEditionTeams: teams,
        }),
        fetchNhlR2PicksForEdition(supabase, edition.id, {
          currentR2SeriesRows: r2SeriesForPicks,
          activeEditionTeams: teams,
        }),
        fetchNhlCfPicksForEdition(supabase, edition.id, {
          currentCfSeriesRows: cfSeriesForPicks,
          activeEditionTeams: teams,
        }),
        fetchNhlScfPicksForEdition(supabase, edition.id, {
          currentScfSeriesRows: scfSeriesForPicks,
          activeEditionTeams: teams,
        }),
        fetchNhlEditionStandings(supabase, edition.id),
      ]);
      round1PickBySeriesId = pickRes.pickBySeriesId;
      picksLoadError = pickRes.error;
      r1PickResolution = pickRes.resolution;
      round2PickBySeriesId = pickR2.pickBySeriesId;
      r2PicksLoadError = pickR2.error;
      r2PickResolution = pickR2.resolution;
      cfPickBySeriesId = pickCf.pickBySeriesId;
      cfPicksLoadError = pickCf.error;
      cfPickResolution = pickCf.resolution;
      scfPickBySeriesId = pickScf.pickBySeriesId;
      scfPicksLoadError = pickScf.error;
      scfPickResolution = pickScf.resolution;
      if (!standingsRes.error) {
        const mine = standingsRes.rows.find((r) => r.user_id === user.id);
        if (mine) {
          userTotalPoints = mine.total_points;
          userRound2Points = mine.round2_points;
          userConferenceFinalPoints = mine.conference_final_points;
          userStanleyCupFinalPoints = mine.stanley_cup_final_points;
        }
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
  const eastCf = model?.east.cf ?? null;
  const westCf = model?.west.cf ?? null;
  const scfSeries = model?.scf ?? null;
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
  const r2All = displayRows.filter((r) => r.round_code === "R2");
  const r2UserSummary =
    user && r2All.length > 0 ? buildRound2UserSummary(r2All, round2PickBySeriesId) : null;
  const round2ProgressComplete = isRound2FullyResolvedForProgression(displayRows);
  const round2Open = Boolean(
    edition && user && round1ProgressComplete && !picksLocked && !r2PicksLoadError,
  );
  const conferenceFinalsReady = conferenceFinalsMatchupsReady(displayRows);
  const stanleyCupFinalReady = stanleyCupFinalMatchupReady(displayRows);
  const conferenceFinalsOpen = Boolean(
    edition && user && round2ProgressComplete && !picksLocked && !cfPicksLoadError,
  );
  const stanleyCupFinalOpen = Boolean(
    edition &&
      user &&
      round2ProgressComplete &&
      stanleyCupFinalReady &&
      !picksLocked &&
      !scfPicksLoadError,
  );
  const cfAll = displayRows.filter((r) => r.round_code === "CF");
  const cfUserSummary =
    user && cfAll.length > 0
      ? buildConferenceFinalUserSummary(cfAll, cfPickBySeriesId)
      : null;
  const scfUserSummary = user ? buildStanleyCupFinalUserSummary(scfSeries, scfPickBySeriesId) : null;
  const r1LinkageBroken = picksLinkageLooksBroken(r1PickResolution, round1PickBySeriesId);
  const r2LinkageBroken = picksLinkageLooksBroken(r2PickResolution, round2PickBySeriesId);
  const cfLinkageBroken = picksLinkageLooksBroken(cfPickResolution, cfPickBySeriesId);
  const scfLinkageBroken = picksLinkageLooksBroken(scfPickResolution, scfPickBySeriesId);
  const r1LegacyUnresolved = hasUnresolvedLegacyPicks(r1PickResolution);
  const r2LegacyUnresolved = hasUnresolvedLegacyPicks(r2PickResolution);
  const cfLegacyUnresolved = hasUnresolvedLegacyPicks(cfPickResolution);
  const scfLegacyUnresolved = hasUnresolvedLegacyPicks(scfPickResolution);

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
          Tap a team card to save your pick (sign-in required).
        </p>
        {edition && !editionError ? (
          <div className="mt-4 max-w-2xl space-y-2 text-sm leading-relaxed">
            {picksLocked ? (
              <p className="rounded-xl border border-amber-500/35 bg-amber-950/25 px-4 py-3 text-amber-100/95">
                The pick window for this playoff year is closed. You can still review your results,
                but new changes are not accepted.
              </p>
            ) : edition.lock_at ? (
              <p className="rounded-xl border border-blue-500/25 bg-slate-950/50 px-4 py-3 text-slate-300">
                Picks close on{" "}
                <span className="font-medium text-slate-100">
                  {new Date(edition.lock_at).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
                .
              </p>
            ) : (
              <p className="rounded-xl border border-slate-600/40 bg-slate-950/45 px-4 py-3 text-slate-400">
                No final pick deadline is set yet—you can still change your choices until an admin
                closes the window.
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
            round2Complete={round2ProgressComplete}
            picksLocked={picksLocked}
            r1Summary={r1UserSummary}
            r2Summary={r2UserSummary}
            cfSummary={cfUserSummary}
            scfSummary={scfUserSummary}
            r2PicksLoadError={r2PicksLoadError}
            cfPicksLoadError={cfPicksLoadError}
            scfPicksLoadError={scfPicksLoadError}
            r1LinkageBroken={r1LinkageBroken}
            r2LinkageBroken={r2LinkageBroken}
            cfLinkageBroken={cfLinkageBroken}
            scfLinkageBroken={scfLinkageBroken}
            r1LegacyUnresolved={r1LegacyUnresolved}
            r2LegacyUnresolved={r2LegacyUnresolved}
            cfLegacyUnresolved={cfLegacyUnresolved}
            scfLegacyUnresolved={scfLegacyUnresolved}
            totalPoints={userTotalPoints}
            round2PointsFromStandings={userRound2Points}
            conferenceFinalPointsFromStandings={userConferenceFinalPoints}
            stanleyCupFinalPointsFromStandings={userStanleyCupFinalPoints}
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
            {formatNhlPicksLoadError(picksLoadError)}
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
                  ? "ready, but your saved Round 2 picks could not be loaded (see message above)."
                  : "picks are open. Matchups use Round 1 winners on the bracket path (East/West R2 slots 1–2 from R1 slots 1–2 and 3–4)."
              : "waiting until every Round 1 series has a decided winner."}
          </li>
          <li>
            <span className="text-slate-300">Conference Finals</span> —{" "}
            {round2ProgressComplete
              ? conferenceFinalsOpen
                ? conferenceFinalsReady
                  ? "picks are open in Final Rounds below (East and West champions, 4 pts each)."
                  : "waiting for both Conference Final matchups from Round 2 winners."
                : picksLocked
                  ? "locked with the edition."
                  : cfPicksLoadError
                    ? "ready, but saved picks could not be loaded."
                    : "sign in to save Conference Finals picks."
              : "waiting until every Round 2 series has a decided winner."}
          </li>
          <li>
            <span className="text-slate-300">Stanley Cup Final</span> —{" "}
            {stanleyCupFinalOpen
              ? "Cup winner pick is open in Final Rounds below (8 pts when correct)."
              : round2ProgressComplete
                ? stanleyCupFinalReady
                  ? picksLocked
                    ? "locked with the edition."
                    : "sign in to save your Stanley Cup winner pick."
                  : "visible below; unlocks once both conference finalists are known."
                : "opens after Round 2 completes and conference champions are set."}
          </li>
        </ul>
      </section>

      <section className="ash-surface space-y-4 px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">How bracket play works</h2>
        <p className="text-sm leading-relaxed text-slate-400">
          The competition follows the real Stanley Cup Playoff tree. You choose each series winner
          (not individual games). Scoring matches the standings page (Round 1 = 1 pt, Round 2 = 2
          pts per correct series, and so on).
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
            Round 1&quot;, we are still waiting on a first-round result—check back after scores
            update.
          </p>
        </div>

        {r2PicksLoadError && user ? (
          <p className="text-sm text-amber-200/90">
            <span className="font-medium text-amber-100/95">Round 2 picks unavailable. </span>
            {formatNhlPicksLoadError(r2PicksLoadError)}
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

      <section className="space-y-4">
        <div className="px-1 sm:px-0">
          <h2 className="text-lg font-semibold text-ash-text">Final Rounds</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-400">
            Your last three picks: East and West conference champions, then the Stanley Cup winner.
            Scoring stays separate on the leaderboard (Conference Finals = 4 pts, Cup Final = 8 pts).
          </p>
        </div>

        {cfPicksLoadError && user ? (
          <p className="text-sm text-amber-200/90">
            <span className="font-medium text-amber-100/95">Conference Finals picks unavailable. </span>
            {formatNhlPicksLoadError(cfPicksLoadError)}
          </p>
        ) : null}

        {scfPicksLoadError && user ? (
          <p className="text-sm text-amber-200/90">
            <span className="font-medium text-amber-100/95">Stanley Cup Final pick unavailable. </span>
            {formatNhlPicksLoadError(scfPicksLoadError)}
          </p>
        ) : null}

        {edition && !seriesError && (eastCf || westCf || scfSeries) ? (
          <div className="rounded-2xl border border-amber-500/20 bg-slate-950/25 px-4 py-6 sm:px-6">
            <NhlFinalRoundsPicks
              editionId={edition.id}
              eastCf={eastCf}
              westCf={westCf}
              scf={scfSeries}
              cfPickBySeriesId={cfPickBySeriesId}
              scfPickBySeriesId={scfPickBySeriesId}
              picksLocked={picksLocked}
              isAuthenticated={Boolean(user)}
              round2Complete={round2ProgressComplete}
              conferenceFinalsReady={conferenceFinalsReady}
              stanleyCupFinalReady={stanleyCupFinalReady}
              conferenceFinalsOpen={conferenceFinalsOpen}
              stanleyCupFinalOpen={stanleyCupFinalOpen}
            />
          </div>
        ) : edition && !editionError && !seriesError ? (
          <div className="rounded-xl border border-dashed border-amber-500/25 bg-slate-950/40 px-4 py-8 text-center text-sm leading-relaxed text-slate-500">
            Conference Finals and Stanley Cup Final series rows are not set up for this edition yet.
          </div>
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
