import Link from "next/link";
import { MatchdayCard } from "@/components/account/MatchdayCard";
import { NhlDraft26PromoCard } from "@/components/account/NhlDraft26PromoCard";
import { PostLockEngagementCard } from "@/components/account/PostLockEngagementCard";
import { PoolRevealDashboardCard } from "@/components/account/PoolRevealDashboardCard";
import { PicksDeadlineBannerFromPool } from "@/components/pool/PicksDeadlineBannerFromPool";
import { WhoToCheerForCard } from "@/components/account/WhoToCheerForCard";
import { LatestRecapCard } from "@/components/dashboard/LatestRecapCard";
import { whoToCheerForFromSchedule } from "@/lib/account/loadWhoToCheerFor";
import { matchdayFromSchedule } from "@/lib/account/loadMatchday";
import { loadRecentScoreImpactForDashboard } from "@/lib/account/loadRecentScoreImpactForDashboard";
import { loadParticipantLatestRecap } from "@/lib/dashboard/loadParticipantLatestRecap";
import { formatPoolPickDeadlineLabel } from "@/lib/picks/poolPickDeadlineDisplay";
import { participantPicksCompleteFromDrafts } from "@/lib/predictions/participantPicksCompletenessRules";
import { AccountPicksProfileLinks } from "@/components/account/AccountPicksProfileLinks";
import { ParticipantPoolPaymentPanel } from "@/components/pools/ParticipantPoolPaymentPanel";
import type { PoolPotParticipantSummary } from "@/lib/pools/computePoolPotSummary";
import { fetchPoolPotForMember } from "@/lib/pools/fetchPoolPotForMember";
import { mapPoolPaymentFromPool, poolIsPaid } from "@/lib/pools/poolPayment";
import { ParticipantBracketView } from "@/components/bracket/ParticipantBracketView";
import { MyKnockoutPicksSummary } from "@/components/picks/MyKnockoutPicksSummary";
import { PicksViewToggle } from "@/components/picks/PicksViewToggle";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  accountCreatePoolLinkState,
  buildAccountPageNavState,
  buildAccountPageTitleDescription,
  isOrganizerOnlyAccount,
} from "../../../lib/account/accountPageLockState";
import {
  accountPicksNavLabel,
  loadAccountKnockoutSelection,
  poolLocked,
} from "../../../lib/account/loadAccountKnockoutSelection";
import { loadPoolReveal } from "../../../lib/account/loadPoolReveal";
import { isPastAshbracket2026PoolLockDeadline } from "../../../lib/account/resolveAccountParticipantId";
import { isGlobalAdmin } from "@/lib/auth/permissions";
import { resolveStandingsNav } from "../../../lib/pool/leaderboardNavHref";
import { fetchPoolHasAwardedLeaderboardPoints, LEADERBOARD_PENDING_NAV_NOTE } from "../../../lib/leaderboard/poolLeaderboardIsActive";
import { fetchBracketOutlookForPool } from "../../../lib/leaderboard/fetchBracketOutlookForPool";
import { shouldShowStandingsWarmingNote } from "../../../lib/leaderboard/bracketOutlookVisibility";
import { STANDINGS_WARMING_UP_DASHBOARD_NOTE, STANDINGS_WARMING_UP_HEADLINE, computeBracketOutlookSummary, type BracketOutlookSummary } from "../../../lib/leaderboard/bracketOutlookSeparation";
import { BracketOutlookDashboardCard } from "@/components/leaderboard/BracketOutlookDashboardCard";
import { fetchPublicTournamentProgress } from "../../../lib/tournament/fetchPublicTournamentProgress";
import type { TournamentMatchPublicRow } from "../../../types/tournamentPublic";
import { TournamentStatLeadersPanel } from "@/components/tournament/TournamentStatLeadersPanel";
import { loadTournamentTeamStatLeaders } from "@/lib/tournament/matchTeamStats/loadTournamentTeamStatLeaders";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ participant?: string; view?: string }>;
};

export default async function AccountPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const view = sp.view === "bracket" ? "bracket" : "list";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/account");
  }

  const { data: orgAdminRows, error: orgErr } = await supabase
    .from("pool_admins")
    .select("pools (id, name, join_code)")
    .eq("user_id", user.id);

  const organizedPools = (
    (orgAdminRows as { pools: { id: string; name: string; join_code: string | null } | null }[] | null) ??
    []
  )
    .map((r) => r.pools)
    .filter(
      (p): p is { id: string; name: string; join_code: string | null } =>
        p != null,
    );

  const { data: rows, error } = await supabase
    .from("participants")
    .select(
      `
      id,
      display_name,
      pool_id,
      is_paid,
      pools (
        name,
        lock_at,
        is_public,
        is_simulation,
        archived_at,
        payment_type,
        entry_fee_label,
        entry_fee_amount,
        payment_instructions,
        entry_fee_cents,
        currency_code,
        show_pot_to_participants
      )
    `,
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  type PoolEmbedRow = {
    name: string;
    lock_at: string | null;
    is_public: boolean | null;
    is_simulation: boolean | null;
    archived_at: string | null;
    payment_type: string;
    entry_fee_label: string | null;
    entry_fee_amount: number | string | null;
    payment_instructions: string | null;
    entry_fee_cents: number | null;
    currency_code: string | null;
    show_pot_to_participants: boolean | null;
  };

  const list = (rows ?? []).map((r) => {
    const poolRaw = r.pools as PoolEmbedRow | PoolEmbedRow[] | null;
    const pool = Array.isArray(poolRaw) ? poolRaw[0] : poolRaw;
    return {
      id: r.id as string,
      display_name: r.display_name as string,
      pool_id: r.pool_id as string,
      is_paid: Boolean(r.is_paid),
      pool_name: pool?.name ?? "Pool",
      pool_lock_at: pool?.lock_at ?? null,
      pool_is_simulation: Boolean(pool?.is_simulation),
      pool_archived_at: pool?.archived_at ?? null,
      pool_is_public: Boolean(pool?.is_public),
      pool_payment: pool
        ? mapPoolPaymentFromPool(pool)
        : mapPoolPaymentFromPool({ payment_type: "free" }),
    };
  });

  const potByPoolId = new Map<string, PoolPotParticipantSummary | null>();
  await Promise.all(
    list
      .filter(
        (p) =>
          poolIsPaid(p.pool_payment) &&
          p.pool_payment.showPotToParticipants,
      )
      .map(async (p) => {
        potByPoolId.set(
          p.pool_id,
          await fetchPoolPotForMember(supabase, p.pool_id),
        );
      }),
  );

  const picksCtx =
    !error && list.length > 0
      ? await loadAccountKnockoutSelection(user.id, sp.participant?.trim() ?? "")
      : null;

  let whoToCheer: ReturnType<typeof whoToCheerForFromSchedule> | null = null;
  let matchday: ReturnType<typeof matchdayFromSchedule> | null = null;
  let recentScoreImpact: Awaited<
    ReturnType<typeof loadRecentScoreImpactForDashboard>
  > = [];
  let latestRecap: Awaited<ReturnType<typeof loadParticipantLatestRecap>> | null =
    null;
  let tournamentMatches: TournamentMatchPublicRow[] | null = null;
  let tournamentErr: string | null = null;

  if (picksCtx && !picksCtx.loadError && picksCtx.initialSlots.length > 0) {
    const { data: tp, error: te } = await fetchPublicTournamentProgress();
    tournamentMatches = tp?.matches ?? null;
    tournamentErr = te ?? null;
    whoToCheer = whoToCheerForFromSchedule(picksCtx, tournamentMatches, tournamentErr);
  }

  const locked = picksCtx ? poolLocked(picksCtx.selectedLockAt) : false;

  if (
    locked &&
    picksCtx &&
    !picksCtx.loadError &&
    picksCtx.initialSlots.length > 0
  ) {
    matchday = matchdayFromSchedule(picksCtx, tournamentMatches, tournamentErr);
    if (picksCtx.selectedPoolId) {
      try {
        recentScoreImpact = await loadRecentScoreImpactForDashboard(
          supabase,
          picksCtx.selectedPoolId,
          { allowParticipantNames: locked },
        );
      } catch {
        recentScoreImpact = [];
      }
    }
  }

  const organizerOnly = isOrganizerOnlyAccount(
    list.length,
    organizedPools.length,
  );
  const pastCanonicalDeadline = isPastAshbracket2026PoolLockDeadline();
  const createPoolLink = accountCreatePoolLinkState({
    pastCanonicalDeadline,
    organizedPoolCount: organizedPools.length,
    isGlobalAdmin: await isGlobalAdmin(supabase),
  });

  const picksHref =
    list.length === 1
      ? `/account/picks?participant=${list[0].id}`
      : "/account/picks";

  const dashListQs = new URLSearchParams();
  if (picksCtx?.selectedId) dashListQs.set("participant", picksCtx.selectedId);
  const dashBracketQs = new URLSearchParams(dashListQs);
  dashBracketQs.set("view", "bracket");
  const dashboardListHref = `/account${dashListQs.toString() ? `?${dashListQs}` : ""}`;
  const dashboardBracketHref = `/account?${dashBracketQs}`;
  const editPicksFromDashboardHref = picksCtx?.selectedParticipant?.id
    ? `/account/picks?participant=${picksCtx.selectedParticipant.id}`
    : picksHref;
  const revealHref = picksCtx?.selectedParticipant?.id
    ? `/account/reveal?participant=${picksCtx.selectedParticipant.id}`
    : "/account/reveal";
  const revealDeadlineLabel = picksCtx?.selectedLockAt
    ? formatPoolPickDeadlineLabel(picksCtx.selectedLockAt)
    : null;
  const viewerPicksComplete =
    picksCtx && picksCtx.initialSlots.length > 0
      ? participantPicksCompleteFromDrafts(picksCtx.initialSlots, {
          knockoutBracketPicksUnlocked: picksCtx.knockoutBracketPicksUnlocked,
        })
      : false;

  const selectedListEntry = picksCtx?.selectedPoolId
    ? list.find((p) => p.pool_id === picksCtx.selectedPoolId)
    : null;
  let hasAwardedLeaderboardPoints = false;
  if (locked && picksCtx?.selectedPoolId) {
    try {
      hasAwardedLeaderboardPoints = await fetchPoolHasAwardedLeaderboardPoints(
        picksCtx.selectedPoolId,
      );
    } catch {
      hasAwardedLeaderboardPoints = false;
    }
  }

  let outlookFetch: Awaited<ReturnType<typeof fetchBracketOutlookForPool>> | null = null;
  if (locked && picksCtx?.selectedPoolId && !hasAwardedLeaderboardPoints) {
    try {
      outlookFetch = await fetchBracketOutlookForPool(picksCtx.selectedPoolId, {
        supabase,
        viewerUserId: user.id,
      });
    } catch {
      outlookFetch = null;
    }
  }

  const outlookHasMeaningfulSeparation =
    outlookFetch?.ok === true && outlookFetch.visibility.showOutlook;

  const standingsNav =
    selectedListEntry && picksCtx?.selectedParticipant?.id
      ? resolveStandingsNav({
          poolId: selectedListEntry.pool_id,
          isPublic: selectedListEntry.pool_is_public,
          participantId: picksCtx.selectedParticipant.id,
          picksLocked: locked,
          hasAwardedPoints: hasAwardedLeaderboardPoints,
          outlookHasMeaningfulSeparation,
        })
      : { href: null, label: null };

  const leaderboardHref =
    standingsNav.label === "Leaderboard" ? standingsNav.href : null;
  const outlookHref =
    standingsNav.label === "Outlook" ? standingsNav.href : null;
  const leaderboardPendingNote =
    locked && !hasAwardedLeaderboardPoints && !outlookHref
      ? LEADERBOARD_PENDING_NAV_NOTE
      : null;
  const activityHref = picksCtx?.selectedParticipant?.id
    ? `/account/activity?participant=${picksCtx.selectedParticipant.id}`
    : "/account/activity";
  const accountNav = buildAccountPageNavState({
    picksLocked: locked,
    knockoutBracketPicksUnlocked: picksCtx?.knockoutBracketPicksUnlocked ?? true,
    revealHref,
    leaderboardHref,
    outlookHref,
    picksHref: editPicksFromDashboardHref,
    activityHref,
  });
  const { postLockEngagement, navPlan, suppressStandaloneNavRow } = accountNav;
  const pageTitleDescription = buildAccountPageTitleDescription({
    isOrganizerOnly: organizerOnly,
    hasSelectedParticipant: Boolean(picksCtx?.selectedParticipant),
    picksLocked: locked,
    userEmail: user.email ?? null,
  });

  let bonusWatchRes: Awaited<ReturnType<typeof loadTournamentTeamStatLeaders>> | null =
    null;
  if (locked && picksCtx?.selectedPoolId && !picksCtx.loadError) {
    bonusWatchRes = await loadTournamentTeamStatLeaders(supabase, {
      poolId: picksCtx.selectedPoolId,
    });
  }

  if (
    locked &&
    viewerPicksComplete &&
    picksCtx &&
    !picksCtx.loadError &&
    picksCtx.initialSlots.length > 0
  ) {
    latestRecap = await loadParticipantLatestRecap(
      supabase,
      picksCtx,
      tournamentMatches,
      tournamentErr,
    );
  }

  let poolSnapshot: {
    totalParticipants: number;
    completeBrackets: number;
    mostPopularChampion: string | null;
  } | null = null;
  let bracketOutlookDashboardSummary: BracketOutlookSummary | null = null;
  let showBracketOutlookDashboard = false;

  if (postLockEngagement && picksCtx?.selectedPoolId && !picksCtx.loadError) {
    try {
      const revealData = await loadPoolReveal(
        supabase,
        picksCtx.selectedPoolId,
        picksCtx,
      );
      poolSnapshot = {
        totalParticipants: revealData.totalParticipants,
        completeBrackets: revealData.totalCompleted,
        mostPopularChampion: revealData.mostPopularChampion?.teamName ?? null,
      };
    } catch {
      poolSnapshot = null;
    }
  }

  if (outlookFetch?.ok && outlookFetch.visibility.showOutlook && outlookFetch.outlook) {
    showBracketOutlookDashboard = true;
    bracketOutlookDashboardSummary = computeBracketOutlookSummary(
      outlookFetch.outlook,
      outlookFetch.totalParticipantCount,
      picksCtx?.selectedParticipant?.id
        ? {
            participantId: picksCtx.selectedParticipant.id,
            displayName: picksCtx.selectedParticipant.displayName ?? "",
          }
        : null,
    );
  }

  const showStandingsWarmingNote = shouldShowStandingsWarmingNote({
    picksLocked: locked,
    hasAwardedPoints: hasAwardedLeaderboardPoints,
    completedMatchCount: outlookFetch?.ok ? outlookFetch.completedMatchCount : 0,
    showOutlook: outlookHasMeaningfulSeparation,
  });

  return (
    <PageContainer>
      {picksCtx?.selectedPoolId ? (
        <PicksDeadlineBannerFromPool
          poolId={picksCtx.selectedPoolId}
          className="mb-6"
        />
      ) : null}
      <div className="mb-8">
        <PageTitle title="My bracket" description={pageTitleDescription} />
      </div>

      <div className="mb-6 space-y-3">
        {orgErr ? (
          <p className="text-sm text-amber-200" role="alert">
            Could not load pools you organize ({orgErr.message}).
          </p>
        ) : null}
        {organizedPools.length > 0 ? (
          <div className="ash-surface p-4">
            <h2 className="text-sm font-semibold text-ash-text">
              Pools you organize
            </h2>
            <ul className="mt-2 space-y-2 text-sm">
              {organizedPools.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span className="text-ash-text">{p.name}</span>
                  <Link
                    href={`/admin/pools/${p.id}`}
                    className="btn-primary inline-flex py-1.5 text-xs"
                  >
                    Manage pool
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {createPoolLink.show ? (
          <div>
            <Link
              href="/account/pools/new"
              className="btn-ghost inline-flex text-sm ring-1 ring-ash-border"
            >
              {createPoolLink.label}
            </Link>
          </div>
        ) : null}
        <div className="ash-surface p-4">
          <h2 className="text-sm font-semibold text-ash-text">Security</h2>
          <p className="mt-1 text-sm text-ash-muted">
            Update your AshBracket sign-in password.
          </p>
          <Link
            href="/account/change-password"
            className="btn-ghost mt-3 inline-flex text-sm ring-1 ring-ash-border"
          >
            Change password
          </Link>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error.message}
        </p>
      ) : null}

      {!error && list.length === 0 ? (
        <div className="ash-surface p-6">
          <p className="text-sm text-ash-muted">
            {organizerOnly
              ? "You organize pools but do not have a participant profile yet. Manage your pools above, or join a pool with your invite code to follow a locked bracket as a player."
              : "You are not linked to a pool as a participant yet. Use your join code to create or claim a profile, or start your own pool as the organizer."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/join" className="btn-primary inline-flex">
              Join a pool
            </Link>
            {createPoolLink.show ? (
              <Link
                href="/account/pools/new"
                className="btn-ghost inline-flex ring-1 ring-ash-border"
              >
                {createPoolLink.label}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {!error && list.length > 0 ? (
        <>
          {postLockEngagement ? (
            <div className="mb-6 space-y-4">
              <PostLockEngagementCard
                variant="account"
                picksLocked={locked}
                knockoutBracketPicksUnlocked={
                  picksCtx?.knockoutBracketPicksUnlocked ?? true
                }
                revealHref={revealHref}
                leaderboardHref={leaderboardHref}
                picksHref={editPicksFromDashboardHref}
                activityHref={activityHref}
                snapshot={poolSnapshot}
              />
              {latestRecap?.showCard ? (
                <LatestRecapCard
                  recap={latestRecap}
                  activityHref={activityHref}
                />
              ) : null}
              {bonusWatchRes?.ok ? (
                <TournamentStatLeadersPanel variant="user" view={bonusWatchRes.view} />
              ) : null}
            </div>
          ) : locked && latestRecap?.showCard ? (
            <div className="mb-6">
              <LatestRecapCard
                recap={latestRecap}
                activityHref={activityHref}
              />
            </div>
          ) : null}

          {!suppressStandaloneNavRow ? (
            <div className="mb-4 flex flex-wrap gap-3">
              <Link href={navPlan.primary.href} className="btn-primary inline-flex">
                {navPlan.primary.label}
              </Link>
              <Link
                href={navPlan.secondary.href}
                className="btn-ghost inline-flex ring-1 ring-ash-border"
              >
                {navPlan.secondary.label}
              </Link>
              {navPlan.tertiary ? (
                <Link
                  href={navPlan.tertiary.href}
                  className="btn-ghost inline-flex ring-1 ring-ash-border"
                >
                  {navPlan.tertiary.label}
                </Link>
              ) : null}
            </div>
          ) : null}

          {picksCtx && picksCtx.profileLinkItems.length > 1 ? (
            <AccountPicksProfileLinks
              profiles={picksCtx.profileLinkItems}
              selectedId={picksCtx.selectedId}
              summaryBasePath="/account/picks/summary"
              activityBasePath="/account/activity"
              revealBasePath="/account/reveal"
              multiProfileHeading="Choose profile"
            />
          ) : null}

          {picksCtx?.loadError ? (
            <p
              className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
              role="alert"
            >
              {picksCtx.loadError}
            </p>
          ) : null}

          {picksCtx &&
          picksCtx.selectedParticipant &&
          poolIsPaid(picksCtx.selectedPoolPayment) ? (
            <div className="mb-6">
              <ParticipantPoolPaymentPanel
                poolPayment={picksCtx.selectedPoolPayment}
                isPaid={picksCtx.selectedParticipant.paid}
                potSummary={
                  picksCtx.selectedPoolId
                    ? (potByPoolId.get(picksCtx.selectedPoolId) ?? null)
                    : null
                }
              />
            </div>
          ) : null}

          {picksCtx &&
          picksCtx.selectedId &&
          picksCtx.selectedParticipant &&
          !picksCtx.loadError &&
          picksCtx.initialSlots.length > 0 ? (
            <div className="space-y-6">
              {locked && matchday ? (
                <MatchdayCard
                  suggestions={matchday.suggestions}
                  tournamentErr={matchday.tournamentErr}
                  hasMatchesToday={matchday.hasMatchesToday}
                  usingUpcomingFallback={matchday.usingUpcomingFallback}
                  hasAnyPick={matchday.hasAnyPick}
                  picksIncomplete={locked && !viewerPicksComplete}
                  activityHref={activityHref}
                  leaderboardHref={leaderboardHref}
                  outlookHref={outlookHref}
                  leaderboardPendingNote={leaderboardPendingNote}
                  standingsWarmingHeadline={
                    showStandingsWarmingNote ? STANDINGS_WARMING_UP_HEADLINE : null
                  }
                  standingsWarmingNote={
                    showStandingsWarmingNote ? STANDINGS_WARMING_UP_DASHBOARD_NOTE : null
                  }
                  recentScoreImpact={recentScoreImpact}
                  initialSlots={picksCtx.initialSlots}
                  teams={picksCtx.teams}
                />
              ) : null}

              {showBracketOutlookDashboard && bracketOutlookDashboardSummary ? (
                <BracketOutlookDashboardCard
                  summary={bracketOutlookDashboardSummary}
                  outlookHref={outlookHref}
                  activityHref={activityHref}
                  revealHref={revealHref}
                />
              ) : null}

              <div className="mb-2">
                <PicksViewToggle
                  current={view}
                  listHref={dashboardListHref}
                  bracketHref={dashboardBracketHref}
                  knockoutBracketPicksUnlocked={
                    picksCtx.knockoutBracketPicksUnlocked
                  }
                />
              </div>

              {view === "list" ? (
                <MyKnockoutPicksSummary
                  slots={picksCtx.initialSlots}
                  teams={picksCtx.teams}
                  participantId={picksCtx.selectedParticipant.id}
                  poolName={picksCtx.selectedPoolName}
                  locked={locked}
                  lockAtIso={picksCtx?.selectedLockAt ?? null}
                  showSavedBanner={false}
                  knockoutBracketPicksUnlocked={
                    picksCtx.knockoutBracketPicksUnlocked
                  }
                />
              ) : (
                <>
                  <MyKnockoutPicksSummary
                    slots={picksCtx.initialSlots}
                    teams={picksCtx.teams}
                    participantId={picksCtx.selectedParticipant.id}
                    poolName={picksCtx.selectedPoolName}
                    locked={locked}
                    lockAtIso={picksCtx?.selectedLockAt ?? null}
                    showSavedBanner={false}
                    knockoutBracketPicksUnlocked={
                      picksCtx.knockoutBracketPicksUnlocked
                    }
                    showCompactStageProgress
                    sections="toolbar_only"
                  />
                  <div className="mt-6">
                    <ParticipantBracketView
                      slots={picksCtx.initialSlots}
                      teams={picksCtx.teams}
                      knockoutBracketPicksUnlocked={
                        picksCtx.knockoutBracketPicksUnlocked
                      }
                      editPicksHref={editPicksFromDashboardHref}
                      listViewHref={dashboardListHref}
                      readOnly={false}
                    />
                  </div>
                </>
              )}

              <PoolRevealDashboardCard
                locked={locked}
                revealHref={revealHref}
                picksHref={editPicksFromDashboardHref}
                deadlineLabel={revealDeadlineLabel}
                viewerPicksComplete={viewerPicksComplete}
              />

              {whoToCheer && !postLockEngagement ? (
                <WhoToCheerForCard
                  suggestions={whoToCheer.suggestions}
                  totalRelevantMatches={whoToCheer.totalRelevantMatches}
                  tournamentErr={whoToCheer.tournamentErr}
                  showIncompleteCta={whoToCheer.showIncompleteCta && !locked}
                  hasAnyPick={whoToCheer.hasAnyPick}
                  picksHref={editPicksFromDashboardHref}
                  initialSlots={picksCtx.initialSlots}
                  teams={picksCtx.teams}
                />
              ) : null}
            </div>
          ) : null}

          {picksCtx &&
          picksCtx.selectedId &&
          picksCtx.selectedParticipant &&
          !picksCtx.loadError &&
          picksCtx.initialSlots.length === 0 ? (
            <div className="mb-6 rounded-xl border border-amber-700/50 bg-amber-950/25 p-6 shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
              <p className="text-sm text-amber-100">
                Knockout stages are not set up in the database yet, so we
                can’t show a bracket snapshot. Ask your organizer or check
                tournament seeds.
              </p>
              <Link
                href={`/account/picks?participant=${picksCtx.selectedParticipant.id}`}
                className="btn-ghost mt-4 inline-flex border-amber-700/50 text-amber-50 hover:bg-amber-950/40"
              >
                {accountPicksNavLabel(locked)}
              </Link>
            </div>
          ) : null}

          <ul className="mt-8 space-y-3">
            {list.map((p) => (
              <li key={p.id} className="ash-surface p-4">
                <p className="font-medium text-ash-text">{p.display_name}</p>
                <p className="mt-0.5 text-xs text-ash-muted">{p.pool_name}</p>
                {poolIsPaid(p.pool_payment) ? (
                  <div className="mt-3">
                    <ParticipantPoolPaymentPanel
                      poolPayment={p.pool_payment}
                      isPaid={p.is_paid}
                      potSummary={potByPoolId.get(p.pool_id) ?? null}
                    />
                  </div>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  <Link href={`/participant/${p.id}`} className="ash-link">
                    Public profile
                  </Link>
                  <Link
                    href={`/account/picks?participant=${p.id}`}
                    className="ash-link"
                  >
                    {accountPicksNavLabel(poolLocked(p.pool_lock_at))}
                  </Link>
                  <Link
                    href={`/account/activity?participant=${p.id}`}
                    className="ash-link"
                  >
                    Activity
                  </Link>
                  {poolLocked(p.pool_lock_at) ? (
                    <Link
                      href={`/account/reveal?participant=${p.id}`}
                      className="ash-link"
                    >
                      See everyone&apos;s picks
                    </Link>
                  ) : null}
                  {p.pool_is_public ? (
                    <Link href={`/pool/${p.pool_id}`} className="ash-link">
                      Leaderboard
                    </Link>
                  ) : null}
                  <Link href={`/account?participant=${p.id}`} className="ash-link">
                    This pool on My bracket
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <NhlDraft26PromoCard className="mt-8" />
    </PageContainer>
  );
}
