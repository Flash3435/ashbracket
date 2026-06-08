import { PageContainer } from "@/components/ui/PageContainer";
import { getOfficial2026EditionTeamStatus } from "@/lib/nhl/official2026Edition";
import {
  countNhlSeriesForEdition,
  countNhlTeamsForEdition,
  fetchActiveNhlEdition,
  fetchNhlMembershipForUserEdition,
  fetchNhlTeamSlugsForEdition,
} from "@/lib/nhl/queries";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Status",
  description:
    "NHL participation and edition status on AshBracket. NHL bracket pick entry is not open yet; this page does not save picks.",
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

  let membershipId: string | null = null;
  let membershipError: string | null = null;
  if (user && edition && !editionError) {
    const mem = await fetchNhlMembershipForUserEdition(supabase, user.id, edition.id);
    membershipId = mem.membershipId;
    membershipError = mem.error;
  }

  const participationState:
    | "signed_out"
    | "signed_in_no_edition"
    | "signed_in_no_membership"
    | "signed_in_ready"
    | "signed_in_membership_unknown" = !user
    ? "signed_out"
    : !edition || editionError
      ? "signed_in_no_edition"
      : membershipError
        ? "signed_in_membership_unknown"
        : membershipId
          ? "signed_in_ready"
          : "signed_in_no_membership";

  return (
    <PageContainer>
      <section className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-slate-950/80 via-slate-900/40 to-blue-950/30 px-5 py-8 shadow-lg shadow-blue-950/20 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-300/90">
          NHL status
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ash-text sm:text-4xl">
          Account
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300">
          <span className="font-medium text-slate-100">NHL bracket picks are not open yet</span> on
          AshBracket. This page only shows participation and edition context—nothing here records
          NHL series choices, and World Cup pick flows stay separate.
        </p>
        <div className="mt-6">
          <Link href="/nhl/picks" className="btn-primary inline-flex text-sm no-underline">
            View Round 1 matchup preview
          </Link>
        </div>
      </section>

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
            </div>

            {fieldStatus === "non_official" && teamCount > 0 ? (
              <p className="text-xs text-slate-500">
                Teams are loaded for this edition; the roster does not match the official 2026
                playoff field AshBracket expects yet. The preview page still reflects stored data for
                this edition.
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

      <section className="rounded-2xl border border-blue-500/15 bg-slate-950/50 px-5 py-5 sm:px-6">
        <p className="text-sm leading-relaxed text-slate-400">
          Later, this URL can summarize pool entry, deadlines, and bracket status once NHL pick entry
          and scoring are connected. Until then, use the button above for the read-only playoff
          preview.
        </p>
      </section>

      <section
        className="rounded-2xl border border-blue-400/20 bg-gradient-to-br from-blue-950/40 via-slate-950/80 to-slate-900/60 px-5 py-7 shadow-inner shadow-blue-950/30 sm:px-7"
        aria-labelledby="nhl-account-status-heading"
      >
        <h2 id="nhl-account-status-heading" className="text-lg font-semibold text-ash-text">
          Your NHL participation
        </h2>

        {participationState === "signed_out" ? (
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
            <p>
              You are not signed in. Use AshBracket sign-in for NHL pool invites and status—the
              same email and password as the rest of the site.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/nhl/login?next=%2Fnhl%2Faccount" className="btn-primary inline-flex text-sm no-underline">
                Sign in
              </Link>
              <Link href="/nhl/signup?next=%2Fnhl%2Faccount" className="btn-ghost inline-flex text-sm no-underline">
                Create account
              </Link>
            </div>
          </div>
        ) : null}

        {participationState === "signed_in_no_edition" ? (
          <div className="mt-4 space-y-2 text-sm leading-relaxed text-slate-300">
            <p>
              <span className="font-medium text-slate-100">You&apos;re signed in.</span> There is
              no active NHL edition in this environment yet, so NHL participation cannot be linked
              here until an edition is published.
            </p>
          </div>
        ) : null}

        {participationState === "signed_in_no_membership" ? (
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
            <p>
              <span className="font-medium text-slate-100">You&apos;re signed in.</span> You
              haven&apos;t joined an NHL pool for{" "}
              <span className="text-slate-100">{edition?.name}</span> yet.
            </p>
            <p className="text-slate-400">
              When your organizer shares an NHL invite link, open it on this site (under{" "}
              <code className="rounded bg-slate-900/80 px-1 text-slate-200">/nhl/join/…</code>) to
              connect your account to this playoff product. That step is separate from any World Cup
              pool you may already be in.
            </p>
          </div>
        ) : null}

        {participationState === "signed_in_ready" ? (
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
            <p>
              <span className="font-medium text-slate-100">You&apos;re signed in and linked</span>{" "}
              for NHL pool access on <span className="text-slate-100">{edition?.name}</span> (
              {edition?.season_label}). Bracket entry and scoring are still in development—you can
              browse the read-only preview and other NHL pages while that ships.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/nhl/standings" className="btn-ghost inline-flex text-sm no-underline">
                Standings
              </Link>
              <Link href="/nhl" className="btn-ghost inline-flex text-sm no-underline">
                NHL home
              </Link>
            </div>
          </div>
        ) : null}

        {participationState === "signed_in_membership_unknown" ? (
          <p className="mt-4 text-sm text-amber-100/90">
            You&apos;re signed in, but NHL participation status could not be loaded ({membershipError}
            ).
          </p>
        ) : null}

        <p className="mt-5 text-sm leading-relaxed text-slate-500">
          Read-only playoff tree:{" "}
          <Link
            href="/nhl/picks"
            className="font-medium text-blue-300 underline-offset-2 hover:text-blue-200 hover:underline"
          >
            Round 1 matchup preview
          </Link>
          .
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-ash-text">See also</h2>
        <p className="mt-1 text-sm text-slate-500">
          Other NHL pages (no bracket saving today).
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link
            href="/nhl/rules"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35"
          >
            <p className="text-base font-semibold text-ash-text">Rules</p>
            <p className="mt-1 text-sm text-slate-500">Planned pool format and scoring.</p>
          </Link>
          <Link
            href="/nhl/standings"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35"
          >
            <p className="text-base font-semibold text-ash-text">Standings</p>
            <p className="mt-1 text-sm text-slate-500">Leaderboard when scoring connects.</p>
          </Link>
          <Link
            href="/nhl"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35 sm:col-span-2"
          >
            <p className="text-base font-semibold text-ash-text">NHL home</p>
            <p className="mt-1 text-sm text-slate-500">Overview and full bracket preview.</p>
          </Link>
        </div>
      </section>
    </PageContainer>
  );
}
