import { AccountPicksProfileLinks } from "@/components/account/AccountPicksProfileLinks";
import { PoolActivityFeedPanel } from "@/components/poolActivity/PoolActivityFeedPanel";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { canManagePool, isGlobalAdmin } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  accountPicksNavLabel,
  loadAccountKnockoutSelection,
  poolLocked,
} from "../../../../lib/account/loadAccountKnockoutSelection";
import {
  buildPostLockNavPlan,
  isPostLockEngagementMode,
} from "../../../../lib/account/postLockEngagement";
import { resolveStandingsNav } from "../../../../lib/pool/leaderboardNavHref";
import { fetchPoolHasAwardedLeaderboardPoints } from "../../../../lib/leaderboard/poolLeaderboardIsActive";
import { filterActivityFeedForParticipantView } from "../../../../lib/poolActivity/activityFeedParticipantFilter";
import { loadPoolActivityForViewer } from "../../../../lib/poolActivity/loadPoolActivityForViewer";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ participant?: string }>;
};

export default async function AccountActivityPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/account/activity");
  }

  const participantParam = sp.participant?.trim() ?? "";
  const ctx = await loadAccountKnockoutSelection(user.id, participantParam);

  let feedError: string | null = null;
  let activity: Awaited<ReturnType<typeof loadPoolActivityForViewer>> | null =
    null;
  let isPoolAdmin = false;
  const globalAdmin = await isGlobalAdmin(supabase);
  const selectedPoolId = ctx.selectedId
    ? ctx.myParticipants.find((p) => p.id === ctx.selectedId)?.pool_id
    : null;
  const locked = poolLocked(ctx.selectedLockAt);
  const revealHref =
    locked && ctx.selectedId
      ? `/account/reveal?participant=${ctx.selectedId}`
      : null;
  const postLockEngagement = isPostLockEngagementMode(
    locked,
    ctx.knockoutBracketPicksUnlocked,
  );

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

  const activityNavPlan =
    ctx.selectedId && !ctx.loadError
      ? buildPostLockNavPlan({
          picksLocked: locked,
          knockoutBracketPicksUnlocked: ctx.knockoutBracketPicksUnlocked,
          revealHref,
          leaderboardHref,
          outlookHref,
          picksHref: `/account/picks?participant=${ctx.selectedId}`,
          activityHref: `/account/activity?participant=${ctx.selectedId}`,
        })
      : null;

  if (ctx.selectedId && selectedPoolId && !ctx.loadError) {
    try {
      isPoolAdmin = await canManagePool(supabase, selectedPoolId);
      activity = await loadPoolActivityForViewer(supabase, selectedPoolId, {
        ensureDailyRecap: true,
        limit: 20,
        viewerParticipantId: ctx.selectedId,
      });
    } catch (e) {
      feedError =
        e instanceof Error ? e.message : "Could not load pool activity.";
    }
  }

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/account" className="ash-link text-sm">
          ← Dashboard
        </Link>
        {ctx.selectedId && !ctx.loadError && activityNavPlan ? (
          <>
            <span className="text-ash-border" aria-hidden>
              |
            </span>
            <Link href={activityNavPlan.primary.href} className="ash-link text-sm font-medium">
              {activityNavPlan.primary.label}
            </Link>
            <span className="text-ash-border" aria-hidden>
              |
            </span>
            <Link href={activityNavPlan.secondary.href} className="ash-link text-sm">
              {activityNavPlan.secondary.label}
            </Link>
            {activityNavPlan.tertiary ? (
              <>
                <span className="text-ash-border" aria-hidden>
                  |
                </span>
                <Link href={activityNavPlan.tertiary.href} className="ash-link text-sm">
                  {activityNavPlan.tertiary.label}
                </Link>
              </>
            ) : null}
            {postLockEngagement &&
            activityNavPlan.secondary.label !== accountPicksNavLabel(locked) ? (
              <>
                <span className="text-ash-border" aria-hidden>
                  |
                </span>
                <Link
                  href={`/account/picks?participant=${ctx.selectedId}`}
                  className="ash-link text-sm"
                >
                  {accountPicksNavLabel(locked)}
                </Link>
              </>
            ) : null}
          </>
        ) : null}
      </div>

      <PageTitle
        title="Activity"
        description="Your pool timeline: joins, pick milestones, Ash recaps, admin updates, and reactions from members."
      />

      {globalAdmin ? (
        <p className="mb-4 text-sm">
          <Link href="/admin/activity" className="ash-link font-medium">
            View activity across all pools
          </Link>
          <span className="text-ash-muted"> — global admin dashboard</span>
        </p>
      ) : null}

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
            You do not have a pool profile yet. Join a pool to see activity here.
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
          />

          {!ctx.selectedId && ctx.myParticipants.length > 1 ? (
            <p className="text-sm text-ash-muted">
              Select which pool profile you want to view activity for.
            </p>
          ) : null}

          {ctx.selectedId && selectedPoolId ? (
            <>
              <p className="mb-4 text-sm text-ash-muted">
                Pool:{" "}
                <span className="font-medium text-ash-text">
                  {ctx.selectedPoolName}
                </span>
              </p>
              {feedError ? (
                <p
                  className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
                  role="alert"
                >
                  {feedError}
                </p>
              ) : activity && ctx.selectedId ? (
                <PoolActivityFeedPanel
                  items={filterActivityFeedForParticipantView(activity.items, {
                    hidePoolWideMilestones: Boolean(participantParam),
                    participantId: ctx.selectedId,
                  })}
                  poolId={selectedPoolId}
                  viewerParticipantId={ctx.selectedId}
                  reactions={activity.reactions}
                  isPoolAdmin={isPoolAdmin}
                  liveRecapFacts={activity.liveRecapFacts}
                  liveRecapDateYmd={activity.liveRecapDateYmd}
                  ashbotEnabled={activity.ashbotEnabled}
                  revealHref={revealHref}
                  poolLocked={locked}
                  leaderboardHref={leaderboardHref}
                />
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </PageContainer>
  );
}
