import { PageContainer } from "@/components/ui/PageContainer";
import { fetchActiveNhlEdition } from "@/lib/nhl/queries";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Rules",
  description:
    "How the AshBracket NHL playoff pool is designed to work—planned series-by-series entry, round-based scoring, and lock timing. Bracket pick entry is not live yet.",
};

export const dynamic = "force-dynamic";

export default async function NhlRulesPage() {
  const supabase = await createClient();
  const { edition, error: editionError } = await fetchActiveNhlEdition(supabase);

  return (
    <PageContainer compactBottom>
      <section className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-slate-950/80 via-slate-900/40 to-blue-950/30 px-5 py-8 shadow-lg shadow-blue-950/20 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-300/90">
          AshBracket NHL
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ash-text sm:text-4xl">
          Rules
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300">
          This page outlines the intended NHL playoff bracket format for AshBracket NHL—a
          public-facing pool built around the Stanley Cup playoffs. You cannot submit or save NHL
          bracket picks on the site today; the NHL section is being rolled out in phases, and
          bracket entry, standings, and scoring will connect here as that work ships.
        </p>
      </section>

      <section className="ash-surface space-y-4 px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">How the pool works</h2>
        <p className="text-sm leading-relaxed text-slate-400">
          The pool follows the real playoff tree: you pick the winner of each series, those
          winners advance through the bracket, and later rounds follow the same path the NHL
          uses until one team lifts the Cup. The end goal is to predict the Stanley Cup
          champion and accumulate credit for correct calls along the way.
        </p>
        <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-slate-400">
          <li>You pick playoff series winners (not individual games).</li>
          <li>Correct picks advance logically into the next round slots on the bracket.</li>
          <li>Later rounds only involve teams that could still reach those slots.</li>
          <li>The champion pick is the final series in the bracket—the Stanley Cup Final.</li>
        </ul>
      </section>

      <section className="ash-surface space-y-4 px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">Planned scoring</h2>
        <p className="text-sm leading-relaxed text-slate-400">
          The NHL scoring model is planned to use round-based points: each correct series
          winner in a playoff round would earn points for that round. Exact point values and
          tie-breakers are not finalized yet; the live scoring engine is still being wired up.
        </p>
        <p className="text-sm font-medium text-slate-300">Illustrative structure (planned)</p>
        <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-slate-400">
          <li>Round 1 — points for each correct series winner.</li>
          <li>Round 2 — points for each correct series winner.</li>
          <li>Conference finals — points for each correct series winner.</li>
          <li>Stanley Cup Final — points for picking the series winner (and champion).</li>
        </ul>
        <p className="text-sm leading-relaxed text-slate-500">
          Standings will reflect these rules once scoring is connected; until then, treat this
          as the design direction rather than live behavior.
        </p>
      </section>

      <section className="ash-surface space-y-4 px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">Planned pick timing and locks</h2>
        <p className="text-sm leading-relaxed text-slate-400">
          When bracket entry is enabled, each series winner choice is expected to lock before the
          relevant round or series begins in the real playoffs—after a lock, that choice should no
          longer be editable. Later rounds may stay open until their own lock times.
        </p>
        <p className="text-sm leading-relaxed text-slate-500">
          Exact lock schedules, grace periods, and deadline messaging will be finalized as the NHL
          section rolls out; check back on this page and on the read-only preview when behavior goes
          live.
        </p>
      </section>

      <section className="ash-surface space-y-3 px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">Current edition</h2>
        {editionError ? (
          <p className="text-sm leading-relaxed text-amber-200/90">
            Active edition data could not be loaded ({editionError}). The rules above still
            describe the intended format; edition-specific details will appear here when the
            database responds normally.
          </p>
        ) : null}

        {!edition && !editionError ? (
          <div className="space-y-2 text-sm leading-relaxed text-slate-400">
            <p>
              There is no active NHL edition in this environment yet. When an edition is
              published—typically aligned with a season such as the{" "}
              <span className="text-slate-300">2026 Stanley Cup Playoffs</span>—its name and
              season label will show in this card automatically.
            </p>
          </div>
        ) : null}

        {edition && !editionError ? (
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
              Rules and future picks or standings apply to this edition. For many deployments
              this will correspond to the{" "}
              <span className="text-slate-400">2026 Stanley Cup Playoffs</span> bracket.
            </p>
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-ash-text">Explore the NHL section</h2>
        <p className="mt-1 text-sm text-slate-400">
          Jump to the rest of the isolated NHL area—behavior on the preview and Standings will grow
          over time.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link
            href="/nhl"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35"
          >
            <p className="text-base font-semibold text-ash-text">Home</p>
            <p className="mt-1 text-sm text-slate-500">Bracket overview and edition status.</p>
          </Link>
          <Link
            href="/nhl/picks"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35"
          >
            <p className="text-base font-semibold text-ash-text">Matchup preview</p>
            <p className="mt-1 text-sm text-slate-500">
              Read-only field and Round 1 pairings until pick entry opens.
            </p>
          </Link>
          <Link
            href="/nhl/standings"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35"
          >
            <p className="text-base font-semibold text-ash-text">Standings</p>
            <p className="mt-1 text-sm text-slate-500">Leaderboard as it is connected.</p>
          </Link>
        </div>
      </section>
    </PageContainer>
  );
}
