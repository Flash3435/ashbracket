import { NhlBracketPreview } from "@/components/nhl/NhlBracketPreview";
import { NhlPicksRound1Grid } from "@/components/nhl/NhlPicksRound1Grid";
import { PageContainer } from "@/components/ui/PageContainer";
import { buildNhlAdminBracketViewModel } from "@/lib/nhl/bracketViewModel";
import { getOfficial2026EditionTeamStatus } from "@/lib/nhl/official2026Edition";
import {
  countNhlSeriesForEdition,
  countNhlTeamsForEdition,
  fetchActiveNhlEdition,
  fetchNhlSeriesRowsForEdition,
  fetchNhlTeamSlugsForEdition,
} from "@/lib/nhl/queries";
import type { NhlSeriesRow } from "@/lib/nhl/types";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Picks",
  description:
    "Preview the NHL playoff bracket and Round 1 matchups for the active AshBracket NHL edition. Series-by-series picks are rolling out.",
};

export const dynamic = "force-dynamic";

function round1Rows(seriesRows: NhlSeriesRow[]): NhlSeriesRow[] {
  return seriesRows.filter((r) => r.round_code === "R1");
}

export default async function NhlPicksPage() {
  const supabase = await createClient();
  const { edition, error: editionError } = await fetchActiveNhlEdition(supabase);

  let teamCount = 0;
  let seriesCount = 0;
  let seriesRows: NhlSeriesRow[] = [];
  let seriesError: string | null = null;
  let countsError: string | null = null;
  let slugError: string | null = null;
  let fieldStatus: ReturnType<typeof getOfficial2026EditionTeamStatus> | null = null;

  if (edition && !editionError) {
    const [teamCountRes, seriesCountRes, seriesRes, slugRes] = await Promise.all([
      countNhlTeamsForEdition(supabase, edition.id),
      countNhlSeriesForEdition(supabase, edition.id),
      fetchNhlSeriesRowsForEdition(supabase, edition.id),
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
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ash-text sm:text-4xl">Picks</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300">
          Preview the playoff bracket and get ready to make your picks. You will pick each playoff
          series winner through the Stanley Cup Final, starting with Round 1 below.
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          Series-by-series pick submission is still rolling out with the NHL section—nothing you
          do on this page is saved yet. Use this view to learn the flow and see the real matchups
          loaded from the active edition.
        </p>
      </section>

      <section className="ash-surface space-y-4 px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">Active edition</h2>

        {dataError ? (
          <p className="text-sm text-amber-200/90">
            Some NHL data could not be loaded ({dataError}). The rest of this page explains the
            picks flow; matchup cards appear when the edition and series load successfully.
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
        <h2 className="text-lg font-semibold text-ash-text">How picks will work</h2>
        <p className="text-sm leading-relaxed text-slate-400">
          The pool follows the real Stanley Cup Playoff tree. When submission goes live, you will
          pick the winner of each series (not individual games). Higher-seeded teams meet their
          Round 1 opponents as shown in the NHL bracket; your correct picks advance into the next
          round slots the same way the real playoffs do.
        </p>
        <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-slate-400">
          <li>Round 1: pick the winner of each Eastern and Western conference series.</li>
          <li>Round 2: winners from Round 1 meet in the next series slots.</li>
          <li>Conference Finals and Stanley Cup Final: keep picking series winners until one champion.</li>
          <li>The end goal is to predict who lifts the Cup—along with as many earlier rounds as you can.</li>
        </ul>
        <p className="text-sm text-slate-500">
          Full pick submission, scoring, and standings are not wired on this page yet; treat this
          as a read-only preview of the bracket you will eventually play.
        </p>
      </section>

      <section className="space-y-4">
        <div className="px-1 sm:px-0">
          <h2 className="text-lg font-semibold text-ash-text">Round 1 · matchup preview</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-400">
            Here are the series you will be picking first. Matchups come from the active edition’s
            Round 1 rows in the database—the same pairings used for the public bracket preview.
          </p>
        </div>

        {seriesError && edition ? (
          <div className="rounded-xl border border-red-800/45 bg-red-950/25 px-4 py-5 text-sm text-red-100/90">
            Round 1 data could not be loaded. Please try again later.
          </div>
        ) : null}

        {showRound1Grid ? (
          <div className="rounded-2xl border border-blue-500/15 bg-slate-950/25 px-4 py-6 sm:px-6">
            <NhlPicksRound1Grid east={eastR1} west={westR1} fallback={round1Fallback} />
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
              <NhlBracketPreview model={model} includeRound1={false} />
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
