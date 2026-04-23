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
  title: "Account",
  description:
    "Your AshBracket NHL account hub—participation status, bracket activity, and edition context as NHL picks and pools go live.",
};

export const dynamic = "force-dynamic";

export default async function NhlAccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    <PageContainer>
      {/* A. Hero / intro */}
      <section className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-slate-950/80 via-slate-900/40 to-blue-950/30 px-5 py-8 shadow-lg shadow-blue-950/20 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-300/90">
          NHL account
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ash-text sm:text-4xl">
          Account
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300">
          Manage your NHL playoff participation here. As picks and pool entry go live, this page
          will show your status, deadlines, and bracket activity for the active edition.
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          The NHL account experience is still rolling out in phases—today you get edition context
          and clear next steps; deeper dashboard tools will appear as those features ship.
        </p>
      </section>

      {/* B. Active edition / status */}
      <section className="ash-surface px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">Active edition</h2>
        {dataError ? (
          <p className="mt-2 text-sm text-amber-200/90">
            Some NHL data could not be loaded ({dataError}). Edition details below may be
            incomplete.
          </p>
        ) : null}

        {!edition && !editionError ? (
          <div className="mt-3 space-y-2 text-sm leading-relaxed text-slate-400">
            <p>There is no active NHL edition in this environment yet.</p>
            <p>
              When an edition is published for the playoffs, this section will show its name,
              season, and field status automatically.
            </p>
          </div>
        ) : null}

        {edition && !editionError ? (
          <div className="mt-3 space-y-4">
            <div>
              <p className="text-xl font-semibold text-ash-text">{edition.name}</p>
              <p className="text-sm text-slate-400">
                Season <span className="text-slate-300">{edition.season_label}</span>
                {edition.slug ? (
                  <span className="text-slate-600"> · {edition.slug}</span>
                ) : null}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {fieldStatus === "official_2026" ? (
                <p className="inline-flex items-center gap-2 rounded-full border border-emerald-500/35 bg-emerald-950/30 px-3 py-1 text-xs font-medium text-emerald-100/95">
                  Official 2026 playoff field loaded
                </p>
              ) : null}
              <p className="text-sm text-slate-400">
                Account features will expand as picks go live.
              </p>
            </div>

            {fieldStatus === "non_official" && teamCount > 0 ? (
              <p className="text-xs text-slate-500">
                Teams are loaded for this edition; the roster does not match the official 2026
                playoff field AshBracket expects yet. What you see on Picks still reflects stored
                data for this edition.
              </p>
            ) : null}

            <p className="text-sm text-slate-400">
              {countsError
                ? "Team and series counts are temporarily unavailable."
                : `${teamCount} team${teamCount === 1 ? "" : "s"} · ${seriesCount} series slot${seriesCount === 1 ? "" : "s"}`}
            </p>
          </div>
        ) : null}

        {editionError ? (
          <p className="mt-3 text-sm text-amber-200/90">
            The active edition could not be loaded ({editionError}).
          </p>
        ) : null}
      </section>

      {/* C. What this page will contain */}
      <section className="rounded-2xl border border-blue-500/15 bg-slate-950/50 px-5 py-6 sm:px-6">
        <h2 className="text-lg font-semibold text-ash-text">What you&apos;ll see here</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          This hub is meant to become your NHL participant dashboard. When the underlying flows
          are connected, expect:
        </p>
        <ul className="mt-4 list-inside list-disc space-y-2 text-sm leading-relaxed text-slate-400">
          <li>Whether you are entered in the active NHL pool</li>
          <li>Your bracket and pick status at a glance</li>
          <li>Pick deadlines and lock timing for the edition</li>
          <li>Quick paths back to picks and standings</li>
          <li>Edition-specific participation context</li>
        </ul>
        <p className="mt-4 text-sm text-slate-500">
          None of that personal state is wired up on this page yet; the list above describes the
          intent, not current behavior.
        </p>
      </section>

      {/* D. Current account state / empty state */}
      <section
        className="rounded-2xl border border-blue-400/20 bg-gradient-to-br from-blue-950/40 via-slate-950/80 to-slate-900/60 px-5 py-7 shadow-inner shadow-blue-950/30 sm:px-7"
        aria-labelledby="nhl-account-status-heading"
      >
        <h2 id="nhl-account-status-heading" className="text-lg font-semibold text-ash-text">
          Your NHL account status
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          NHL account tools are not active yet. Once NHL picks and participation are enabled, this
          area will show your bracket status, pool entry, and deadlines for the active edition.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          For now, use{" "}
          <Link href="/nhl/picks" className="font-medium text-blue-300 underline-offset-2 hover:text-blue-200 hover:underline">
            Picks
          </Link>{" "}
          to preview the current playoff bracket and matchups.
        </p>
        <div className="mt-5 rounded-lg border border-blue-500/20 bg-slate-950/60 px-4 py-3 text-sm text-slate-400">
          {user ? (
            <p>
              <span className="font-medium text-slate-200">You&apos;re signed in.</span>{" "}
              Sign-in-aware NHL participation tools will appear here once they are enabled.
            </p>
          ) : (
            <p>
              Sign-in-aware NHL account tools will appear here once they are enabled. You are not
              signed in; NHL pages here remain public previews until participation tools ship.
            </p>
          )}
        </div>
      </section>

      {/* E. Helpful next actions */}
      <section>
        <h2 className="text-lg font-semibold text-ash-text">Where to go next</h2>
        <p className="mt-1 text-sm text-slate-500">
          These pages are live in the NHL section today—use them while the account dashboard catches
          up.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link
            href="/nhl/picks"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35"
          >
            <p className="text-base font-semibold text-ash-text">Picks</p>
            <p className="mt-1 text-sm text-slate-500">Preview the bracket and Round 1 matchups.</p>
          </Link>
          <Link
            href="/nhl/rules"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35"
          >
            <p className="text-base font-semibold text-ash-text">Rules</p>
            <p className="mt-1 text-sm text-slate-500">How the NHL pool will work on AshBracket.</p>
          </Link>
          <Link
            href="/nhl/standings"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35"
          >
            <p className="text-base font-semibold text-ash-text">Standings</p>
            <p className="mt-1 text-sm text-slate-500">Leaderboard destination as scoring ships.</p>
          </Link>
          <Link
            href="/nhl"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35"
          >
            <p className="text-base font-semibold text-ash-text">NHL home</p>
            <p className="mt-1 text-sm text-slate-500">Overview, edition summary, and bracket preview.</p>
          </Link>
        </div>
      </section>

      {/* F. What’s next for NHL accounts */}
      <section className="ash-surface px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">What&apos;s next for NHL accounts</h2>
        <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-relaxed text-slate-400">
          <li>View participation status for the active pool</li>
          <li>Return to an unfinished bracket when picks persist</li>
          <li>See active edition info and reminders in one place</li>
          <li>Follow standings after scoring goes live</li>
        </ul>
      </section>
    </PageContainer>
  );
}
