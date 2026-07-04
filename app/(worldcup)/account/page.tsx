import Link from "next/link";
import { DashboardBracketTrackerCard } from "@/components/dashboard/DashboardBracketTrackerCard";
import { DashboardLatestImpactCard } from "@/components/dashboard/DashboardLatestImpactCard";
import { DashboardMissingPicksCard } from "@/components/dashboard/DashboardMissingPicksCard";
import { DashboardOrganizerToolsCollapsed } from "@/components/dashboard/DashboardOrganizerToolsCollapsed";
import { DashboardRelevantMatchesCard } from "@/components/dashboard/DashboardRelevantMatchesCard";
import { DashboardSecondaryLinks } from "@/components/dashboard/DashboardSecondaryLinks";
import { DashboardUnpaidWarning } from "@/components/dashboard/DashboardUnpaidWarning";
import { AccountPicksProfileLinks } from "@/components/account/AccountPicksProfileLinks";
import { PicksDeadlineBannerFromPool } from "@/components/pool/PicksDeadlineBannerFromPool";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  accountCreatePoolLinkState,
  buildAccountPageTitleDescription,
  isOrganizerOnlyAccount,
} from "../../../lib/account/accountPageLockState";
import {
  accountPicksNavLabel,
  loadAccountKnockoutSelection,
  poolLocked,
} from "../../../lib/account/loadAccountKnockoutSelection";
import { whoToCheerForFromSchedule } from "@/lib/account/loadWhoToCheerFor";
import { loadParticipantLatestRecap } from "@/lib/dashboard/loadParticipantLatestRecap";
import { buildDashboardMissingPicksModel } from "@/lib/dashboard/buildDashboardMissingPicks";
import { isPastAshbracket2026PoolLockDeadline } from "../../../lib/account/resolveAccountParticipantId";
import { isGlobalAdmin } from "@/lib/auth/permissions";
import { resolveStandingsNav } from "../../../lib/pool/leaderboardNavHref";
import { fetchPoolHasAwardedLeaderboardPoints } from "../../../lib/leaderboard/poolLeaderboardIsActive";
import { fetchBracketOutlookForPool } from "../../../lib/leaderboard/fetchBracketOutlookForPool";
import { fetchPublicTournamentProgress } from "../../../lib/tournament/fetchPublicTournamentProgress";
import { mapPoolPaymentFromPool, poolIsPaid } from "@/lib/pools/poolPayment";
import {
  getGradualKnockoutSelectionState,
} from "@/lib/picks/gradualKnockoutUnlock";
import {
  buildParticipantKnockoutPicksHref,
  participantKnockoutPicksEditable,
} from "@/lib/picks/participantKnockoutEditMode";
import type { TournamentMatchPublicRow } from "../../../types/tournamentPublic";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ participant?: string }>;
};

export default async function AccountPage({ searchParams }: PageProps) {
  const sp = await searchParams;
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

  const picksCtx =
    !error && list.length > 0
      ? await loadAccountKnockoutSelection(user.id, sp.participant?.trim() ?? "")
      : null;

  let whoToCheer: ReturnType<typeof whoToCheerForFromSchedule> | null = null;
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

  const editPicksFromDashboardHref =
    picksCtx?.selectedParticipant?.id && picksCtx.initialSlots.length > 0
      ? buildParticipantKnockoutPicksHref(picksCtx.selectedParticipant.id, {
          slots: picksCtx.initialSlots,
          teams: picksCtx.teams,
          tournamentMatches,
          officialRoundOf32Complete: picksCtx.knockoutBracketPicksUnlocked,
        })
      : picksHref;

  const gradualKnockoutState =
    picksCtx && !picksCtx.loadError
      ? getGradualKnockoutSelectionState({
          matches: tournamentMatches,
          fullRoundOf32Official: picksCtx.knockoutBracketPicksUnlocked,
        })
      : null;

  const activityHref = picksCtx?.selectedParticipant?.id
    ? `/account/activity?participant=${picksCtx.selectedParticipant.id}`
    : "/account/activity";

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
    standingsNav.label === "Leaderboard" || standingsNav.label === "Outlook"
      ? standingsNav.href
      : null;

  const knockoutPicksEditable = picksCtx
    ? participantKnockoutPicksEditable({
        slots: picksCtx.initialSlots,
        teams: picksCtx.teams,
        tournamentMatches,
        officialRoundOf32Complete: picksCtx.knockoutBracketPicksUnlocked,
      })
    : true;

  const pageTitleDescription = buildAccountPageTitleDescription({
    isOrganizerOnly: organizerOnly,
    hasSelectedParticipant: Boolean(picksCtx?.selectedParticipant),
    picksLocked: locked,
    gradualR32PickableCount: gradualKnockoutState?.pickableCount ?? 0,
    userEmail: user.email ?? null,
  });

  if (
    locked &&
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

  const missingPicksModel =
    picksCtx && !picksCtx.loadError && picksCtx.initialSlots.length > 0
      ? buildDashboardMissingPicksModel({
          slots: picksCtx.initialSlots,
          teams: picksCtx.teams,
          tournamentMatches,
          officialRoundOf32Complete: picksCtx.knockoutBracketPicksUnlocked,
        })
      : null;

  const showDashboardContent =
    picksCtx &&
    picksCtx.selectedId &&
    picksCtx.selectedParticipant &&
    !picksCtx.loadError &&
    picksCtx.initialSlots.length > 0;

  const participantUnpaid =
    showDashboardContent &&
    picksCtx.selectedParticipant != null &&
    poolIsPaid(picksCtx.selectedPoolPayment) &&
    !picksCtx.selectedParticipant.paid;

  return (
    <PageContainer>
      {picksCtx?.selectedPoolId ? (
        <PicksDeadlineBannerFromPool
          poolId={picksCtx.selectedPoolId}
          className="mb-6"
        />
      ) : null}

      <div className="mb-6">
        <PageTitle title="My bracket" description={pageTitleDescription} />
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
              ? "You organize pools but do not have a participant profile yet. Join a pool with your invite code to follow a locked bracket as a player."
              : "You are not linked to a pool as a participant yet. Use your join code to create or claim a profile."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/join" className="btn-primary inline-flex">
              Join a pool
            </Link>
          </div>
          <div className="mt-6">
            <DashboardOrganizerToolsCollapsed
              organizedPools={organizedPools}
              createPoolLink={createPoolLink}
              orgErr={orgErr?.message ?? null}
            />
          </div>
        </div>
      ) : null}

      {!error && list.length > 0 ? (
        <>
          {picksCtx && picksCtx.profileLinkItems.length > 1 ? (
            <div className="mb-4">
              <AccountPicksProfileLinks
                profiles={picksCtx.profileLinkItems}
                selectedId={picksCtx.selectedId}
                summaryBasePath="/account/picks/summary"
                activityBasePath="/account/activity"
                revealBasePath="/account/reveal"
                multiProfileHeading="Choose profile"
              />
            </div>
          ) : null}

          {picksCtx?.loadError ? (
            <p
              className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
              role="alert"
            >
              {picksCtx.loadError}
            </p>
          ) : null}

          {participantUnpaid ? (
            <div className="mb-4">
              <DashboardUnpaidWarning
                poolPayment={picksCtx.selectedPoolPayment}
                paymentInstructions={picksCtx.selectedPoolPayment.paymentInstructions}
              />
            </div>
          ) : null}

          {showDashboardContent ? (
            <div className="space-y-4">
              {missingPicksModel ? (
                <DashboardMissingPicksCard
                  model={missingPicksModel}
                  picksHref={editPicksFromDashboardHref}
                />
              ) : null}

              {latestRecap?.showCard ? (
                <DashboardLatestImpactCard
                  recap={latestRecap}
                  activityHref={activityHref}
                />
              ) : null}

              <DashboardBracketTrackerCard
                slots={picksCtx.initialSlots}
                teams={picksCtx.teams}
                knockoutBracketPicksUnlocked={picksCtx.knockoutBracketPicksUnlocked}
                tournamentMatches={tournamentMatches}
                editPicksHref={editPicksFromDashboardHref}
                knockoutPicksEditable={knockoutPicksEditable}
                hasActionablePicks={(missingPicksModel?.actionableCount ?? 0) > 0}
              />

              {whoToCheer ? (
                <DashboardRelevantMatchesCard
                  suggestions={whoToCheer.suggestions}
                  tournamentErr={whoToCheer.tournamentErr}
                  hasAnyPick={whoToCheer.hasAnyPick}
                  initialSlots={picksCtx.initialSlots}
                  teams={picksCtx.teams}
                  allMatches={tournamentMatches ?? undefined}
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
                can&apos;t show a bracket snapshot. Ask your organizer or check
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

          <div className="mt-8 space-y-4">
            <DashboardSecondaryLinks
              picksHref={editPicksFromDashboardHref}
              leaderboardHref={leaderboardHref}
              activityHref={activityHref}
            />
            <DashboardOrganizerToolsCollapsed
              organizedPools={organizedPools}
              createPoolLink={createPoolLink}
              orgErr={orgErr?.message ?? null}
            />
          </div>
        </>
      ) : null}
    </PageContainer>
  );
}
