import { NhlJoinCompetitionButton } from "@/components/nhl/NhlJoinCompetitionButton";
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
  title: "Account",
  description:
    "Join the active AshBracket NHL playoff competition, make series picks, and view your standings entry.",
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
    | "signed_in_not_joined"
    | "signed_in_joined"
    | "signed_in_membership_unknown" = !user
    ? "signed_out"
    : !edition || editionError
      ? "signed_in_no_edition"
      : membershipError
        ? "signed_in_membership_unknown"
        : membershipId
          ? "signed_in_joined"
          : "signed_in_not_joined";

  return (
    <PageContainer>
      <section className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-slate-950/80 via-slate-900/40 to-blue-950/30 px-5 py-8 shadow-lg shadow-blue-950/20 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-300/90">
          NHL competition
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ash-text sm:text-4xl">
          Account
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300">
          One global Stanley Cup Playoffs challenge for the active edition. Sign in, join the
          competition, make your picks, and appear on the edition-wide leaderboard.
        </p>
        {participationState === "signed_in_joined" ? (
          <Link href="/nhl/picks" className="btn-primary mt-6 inline-flex text-sm no-underline">
            Make picks
          </Link>
        ) : null}
      </section>

      <section className="ash-surface px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">Active edition</h2>
        {dataError ? (
          <p className="mt-2 text-sm text-amber-200/90">
            Some NHL data could not be loaded ({dataError}).
          </p>
        ) : null}

        {!edition && !editionError ? (
          <p className="mt-3 text-sm text-slate-400">
            There is no active NHL edition in this environment yet.
          </p>
        ) : null}

        {edition && !editionError ? (
          <div className="mt-3 space-y-4">
            <p className="text-xl font-semibold text-ash-text">{edition.name}</p>
            <p className="text-sm text-slate-400">
              Season <span className="text-slate-300">{edition.season_label}</span>
              {edition.slug ? (
                <span className="text-slate-600"> · {edition.slug}</span>
              ) : null}
            </p>
            {fieldStatus === "official_2026" ? (
              <p className="inline-flex items-center rounded-full border border-emerald-500/35 bg-emerald-950/30 px-3 py-1 text-xs font-medium text-emerald-100/95">
                Official 2026 playoff field loaded
              </p>
            ) : null}
            <p className="text-sm text-slate-400">
              {countsError
                ? "Team and series counts are temporarily unavailable."
                : `${teamCount} teams · ${seriesCount} series slots`}
            </p>
          </div>
        ) : null}

        {editionError ? (
          <p className="mt-3 text-sm text-amber-200/90">
            The active edition could not be loaded ({editionError}).
          </p>
        ) : null}
      </section>

      <section
        className="rounded-2xl border border-blue-400/20 bg-gradient-to-br from-blue-950/40 via-slate-950/80 to-slate-900/60 px-5 py-7 shadow-inner shadow-blue-950/30 sm:px-7"
        aria-labelledby="nhl-account-status-heading"
      >
        <h2 id="nhl-account-status-heading" className="text-lg font-semibold text-ash-text">
          Your NHL entry
        </h2>

        {participationState === "signed_out" ? (
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
            <p>You are not signed in. Use your AshBracket account to join the NHL competition.</p>
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
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            <span className="font-medium text-slate-100">You&apos;re signed in.</span> There is no
            active NHL edition in this environment yet.
          </p>
        ) : null}

        {participationState === "signed_in_not_joined" && edition ? (
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-300">
            <p>
              <span className="font-medium text-slate-100">You&apos;re signed in.</span> Join the{" "}
              <span className="text-slate-100">{edition.name}</span> challenge to start making picks.
            </p>
            <NhlJoinCompetitionButton editionName={edition.name} redirectTo="/nhl/picks" />
            <p className="text-slate-500">
              Organizer invite links under <code className="rounded bg-slate-900/80 px-1 text-slate-200">/nhl/join/…</code>{" "}
              enter the same global competition and are optional.
            </p>
          </div>
        ) : null}

        {participationState === "signed_in_joined" && edition ? (
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
            <p>
              <span className="font-medium text-slate-100">
                You&apos;re entered in the active NHL competition
              </span>{" "}
              ({edition.season_label}).
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/nhl/picks" className="btn-primary inline-flex text-sm no-underline">
                Make picks
              </Link>
              <Link href="/nhl/standings" className="btn-ghost inline-flex text-sm no-underline">
                Standings
              </Link>
            </div>
          </div>
        ) : null}

        {participationState === "signed_in_membership_unknown" ? (
          <p className="mt-4 text-sm text-amber-100/90">
            Entry status could not be loaded ({membershipError}).
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-ash-text">See also</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link
            href="/nhl/rules"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35"
          >
            <p className="text-base font-semibold text-ash-text">Rules</p>
            <p className="mt-1 text-sm text-slate-500">Scoring and competition format.</p>
          </Link>
          <Link
            href="/nhl/standings"
            className="ash-surface-interactive block rounded-xl border-blue-500/15 px-4 py-4 no-underline hover:border-blue-400/35"
          >
            <p className="text-base font-semibold text-ash-text">Standings</p>
            <p className="mt-1 text-sm text-slate-500">Global leaderboard for this edition.</p>
          </Link>
        </div>
      </section>
    </PageContainer>
  );
}
