import Link from "next/link";
import { AccountPicksProfileLinks } from "@/components/account/AccountPicksProfileLinks";
import { PublicPoolLeaderboardView } from "@/components/leaderboard/PublicPoolLeaderboardView";
import { PicksDeadlineBannerFromPool } from "@/components/pool/PicksDeadlineBannerFromPool";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { loadAccountKnockoutSelection, poolLocked } from "@/lib/account/loadAccountKnockoutSelection";
import { fetchMemberPoolStandings } from "@/lib/leaderboard/fetchMemberPoolStandings";
import { fetchBracketOutlookForPool } from "@/lib/leaderboard/fetchBracketOutlookForPool";
import { shouldShowBracketOutlook } from "@/lib/leaderboard/bracketOutlookVisibility";
import {
  BRACKET_OUTLOOK_HEADLINE,
  toClientSafeBracketOutlookEntries,
} from "@/lib/leaderboard/buildBracketOutlook";
import { LEADERBOARD_AWARDED_POINTS_NOTE } from "@/lib/leaderboard/buildPoolStandingsFromLedger";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ participant?: string }>;
};

export default async function AccountLeaderboardPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/account/leaderboard");
  }

  const participantParam = sp.participant?.trim() ??("");
  const ctx = await loadAccountKnockoutSelection(user.id, participantParam);
  const selectedPoolId = ctx.selectedPoolId;
  const locked = poolLocked(ctx.selectedLockAt);

  if (!ctx.selectedId || !selectedPoolId || ctx.loadError) {
    return (
      <PageContainer>
        <PageTitle title="Leaderboard" description="Pool standings for your profile." />
        <p className="text-sm text-ash-muted">
          Choose a pool profile on your{" "}
          <Link href="/account" className="ash-link">
            dashboard
          </Link>{" "}
          to view standings.
        </p>
      </PageContainer>
    );
  }

  const { data: poolRow } = await supabase
    .from("pools")
    .select("is_public, lock_at")
    .eq("id", selectedPoolId)
    .maybeSingle();

  if (!poolRow) {
    return (
      <PageContainer>
        <PageTitle title="Leaderboard" description="Pool not found." />
      </PageContainer>
    );
  }

  if (poolRow.is_public) {
    redirect(`/pool/${selectedPoolId}`);
  }

  if (!locked) {
    return (
      <PageContainer>
        <PageTitle
          title="Leaderboard"
          description="Standings appear after picks lock for this pool."
        />
        <p className="text-sm text-ash-muted">
          Picks are still open. Check back after the deadline, or return to your{" "}
          <Link href={`/account?participant=${ctx.selectedId}`} className="ash-link">
            dashboard
          </Link>
          .
        </p>
      </PageContainer>
    );
  }

  const standings = await fetchMemberPoolStandings(selectedPoolId, user.id, {
    supabase,
  });

  const outlookRes = await fetchBracketOutlookForPool(selectedPoolId, {
    supabase,
    viewerUserId: user.id,
  });
  const showBracketOutlook =
    outlookRes.ok &&
    shouldShowBracketOutlook({
      picksLocked: outlookRes.picksLocked,
      hasAwardedPoints: outlookRes.hasAwardedPoints,
      outlook: outlookRes.outlook,
      completedMatchCount: outlookRes.completedMatchCount,
    });
  const bracketOutlookEntries =
    showBracketOutlook && outlookRes.ok && outlookRes.outlook
      ? toClientSafeBracketOutlookEntries(outlookRes.outlook)
      : null;

  const pageTitle = showBracketOutlook ? BRACKET_OUTLOOK_HEADLINE : "Leaderboard";
  const pageDescription = showBracketOutlook
    ? "Unofficial early read before official pool points are awarded."
    : LEADERBOARD_AWARDED_POINTS_NOTE;

  const revealHref = `/account/reveal?participant=${ctx.selectedId}`;
  const activityHref = `/account/activity?participant=${ctx.selectedId}`;
  const dashboardHref = `/account?participant=${ctx.selectedId}`;

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap gap-3 items-center">
        <Link href={dashboardHref} className="ash-link text-sm">
          ← Dashboard
        </Link>
        <span className="text-ash-border" aria-hidden>
          |
        </span>
        <Link href={activityHref} className="ash-link text-sm">
          Activity
        </Link>
        <span className="text-ash-border" aria-hidden>
          |
        </span>
        <Link href={revealHref} className="ash-link text-sm">
          Reveal
        </Link>
      </div>

      <PageTitle
        title={pageTitle}
        description={pageDescription}
      />

      {ctx.profileLinkItems.length > 1 ? (
        <div className="mb-6">
          <AccountPicksProfileLinks
            profiles={ctx.profileLinkItems}
            selectedId={ctx.selectedId}
            summaryBasePath="/account/picks/summary"
            activityBasePath="/account/activity"
            revealBasePath="/account/reveal"
            multiProfileHeading="Choose profile"
          />
        </div>
      ) : null}

      <PicksDeadlineBannerFromPool poolId={selectedPoolId} className="mb-6" />

      {!standings.ok ? (
        <p
          className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          Could not load standings: {standings.error}
        </p>
      ) : (
        <PublicPoolLeaderboardView
          poolName={standings.poolName}
          rows={standings.rows}
          stats={null}
          statsError={null}
          leaderboardError={null}
          viewerParticipantId={ctx.selectedId}
          picksLocked={locked}
          revealHref={revealHref}
          audience="member"
          bracketOutlookEntries={bracketOutlookEntries}
          showBracketOutlook={showBracketOutlook}
        />
      )}
    </PageContainer>
  );
}
