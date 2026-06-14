import { AccountPicksProfileLinks } from "@/components/account/AccountPicksProfileLinks";
import { PoolRevealPage } from "@/components/account/PoolRevealPage";
import { RevealResultsScrollAnchor } from "@/components/account/RevealResultsScrollAnchor";
import { ACCOUNT_REVEAL_RESULTS_HASH } from "@/lib/account/buildAccountProfileLinkHref";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { loadPoolReveal } from "@/lib/account/loadPoolReveal";
import { loadTournamentTeamStatLeaders } from "@/lib/tournament/matchTeamStats/loadTournamentTeamStatLeaders";
import { createClient } from "@/lib/supabase/server";
import {
  loadAccountKnockoutSelection,
  poolLocked,
} from "../../../../lib/account/loadAccountKnockoutSelection";
import { resolveStandingsNav } from "../../../../lib/pool/leaderboardNavHref";
import { fetchPoolHasAwardedLeaderboardPoints } from "../../../../lib/leaderboard/poolLeaderboardIsActive";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ participant?: string }>;
};

export default async function AccountRevealPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/account/reveal");
  }

  const participantParam = sp.participant?.trim() ?? "";
  const ctx = await loadAccountKnockoutSelection(user.id, participantParam);

  const selectedPoolId = ctx.selectedPoolId;

  let revealError: string | null = null;
  let revealData: Awaited<ReturnType<typeof loadPoolReveal>> | null = null;
  let bonusWatchRes: Awaited<ReturnType<typeof loadTournamentTeamStatLeaders>> | null =
    null;

  if (ctx.selectedId && selectedPoolId && !ctx.loadError) {
    try {
      revealData = await loadPoolReveal(supabase, selectedPoolId, ctx);
    } catch (e) {
      revealError =
        e instanceof Error ? e.message : "Could not load pool reveal.";
    }
  }

  const picksHref = ctx.selectedId
    ? `/account/picks?participant=${ctx.selectedId}`
    : "/account/picks";
  const activityHref = ctx.selectedId
    ? `/account/activity?participant=${ctx.selectedId}`
    : "/account/activity";
  const dashboardQs = ctx.selectedId
    ? `?participant=${ctx.selectedId}`
    : "";
  const dashboardHref = `/account${dashboardQs}`;
  const locked = poolLocked(ctx.selectedLockAt);
  if (locked && selectedPoolId && !ctx.loadError) {
    bonusWatchRes = await loadTournamentTeamStatLeaders(supabase, {
      poolId: selectedPoolId,
    });
  }
  let leaderboardHref: string | null = null;
  let outlookHref: string | null = null;
  if (selectedPoolId && ctx.selectedId) {
    const { data: poolRow } = await supabase
      .from("pools")
      .select("is_public")
      .eq("id", selectedPoolId)
      .maybeSingle();
    if (poolRow) {
      let hasAwardedPoints = false;
      if (locked) {
        try {
          hasAwardedPoints = await fetchPoolHasAwardedLeaderboardPoints(selectedPoolId);
        } catch {
          hasAwardedPoints = false;
        }
      }
      const standingsNav = resolveStandingsNav({
        poolId: selectedPoolId,
        isPublic: Boolean(poolRow.is_public),
        participantId: ctx.selectedId,
        picksLocked: locked,
        hasAwardedPoints,
      });
      leaderboardHref =
        standingsNav.label === "Leaderboard" ? standingsNav.href : null;
      outlookHref = standingsNav.label === "Outlook" ? standingsNav.href : null;
    }
  }

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href={dashboardHref} className="ash-link text-sm">
          ← Dashboard
        </Link>
        {ctx.selectedId && !ctx.loadError ? (
          <>
            {locked && (leaderboardHref || outlookHref) ? (
              <>
                <span className="text-ash-border" aria-hidden>
                  |
                </span>
                <Link
                  href={leaderboardHref ?? outlookHref ?? "#"}
                  className="ash-link text-sm font-medium"
                >
                  {leaderboardHref ? "View leaderboard" : "View outlook"}
                </Link>
              </>
            ) : (
              <>
                <span className="text-ash-border" aria-hidden>
                  |
                </span>
                <Link href={activityHref} className="ash-link text-sm">
                  Activity
                </Link>
              </>
            )}
          </>
        ) : null}
      </div>

      <PageTitle
        title={locked ? "Compare brackets" : "Pool reveal"}
        description={
          locked
            ? "Reveal everyone's picks, compare champion choices, and see how the pool split."
            : "Picks reveal after lock — preview what unlocks once the deadline passes."
        }
      />

      {ctx.loadError ? (
        <p
          className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          {ctx.loadError}
        </p>
      ) : null}

      {ctx.invalidQuery ? (
        <p
          className="mb-4 rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100"
          role="alert"
        >
          The profile id in the URL is not a valid UUID.
        </p>
      ) : null}

      {ctx.invalidOtherProfile ? (
        <p
          className="mb-4 rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100"
          role="alert"
        >
          That profile is not linked to your account. Choose one of your profiles
          below.
        </p>
      ) : null}

      {!ctx.loadError && ctx.myParticipants.length === 0 ? (
        <div className="ash-surface p-6">
          <p className="text-sm text-ash-muted">
            You do not have a pool profile yet. Join a pool to see the reveal.
          </p>
          <Link href="/join" className="btn-primary mt-4 inline-flex">
            Join a pool
          </Link>
        </div>
      ) : null}

      {!ctx.loadError && ctx.myParticipants.length > 0 ? (
        <>
          <AccountPicksProfileLinks
            profiles={ctx.profileLinkItems}
            selectedId={ctx.selectedId}
            summaryBasePath="/account/picks/summary"
            activityBasePath="/account/activity"
            revealBasePath="/account/reveal"
            multiProfileHeading="Choose profile"
          />

          {!ctx.selectedId && ctx.myParticipants.length > 1 ? (
            <p className="text-sm text-ash-muted">
              Select which pool profile you want to view the reveal for.
            </p>
          ) : null}

          {revealError ? (
            <p
              className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
              role="alert"
            >
              {revealError}
            </p>
          ) : null}

          {revealData && ctx.selectedId ? (
            <div
              id={ACCOUNT_REVEAL_RESULTS_HASH}
              className="scroll-mt-24"
            >
              <RevealResultsScrollAnchor selectedParticipantId={ctx.selectedId} />
              <div className="mb-6">
                <h2 className="text-xl font-bold text-ash-text sm:text-2xl">
                  {ctx.selectedPoolName} reveal
                </h2>
                <p className="mt-1 text-sm text-ash-muted">
                  Browse everyone&apos;s locked brackets, then compare pool trends
                  and champion favorites below.
                </p>
              </div>
              <PoolRevealPage
                key={ctx.selectedId}
                data={revealData}
                poolName={ctx.selectedPoolName}
                picksHref={picksHref}
                activityHref={activityHref}
                dashboardHref={dashboardHref}
                bonusWatchView={bonusWatchRes?.ok ? bonusWatchRes.view : null}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </PageContainer>
  );
}
