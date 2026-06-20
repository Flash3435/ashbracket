import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveStandingsNav } from "@/lib/pool/leaderboardNavHref";
import { fetchPoolHasAwardedLeaderboardPoints } from "@/lib/leaderboard/poolLeaderboardIsActive";
import { fetchBracketOutlookForPool } from "@/lib/leaderboard/fetchBracketOutlookForPool";
import { poolLocked } from "../../lib/pools/poolLocked";
import { loadPoolActivityForViewer } from "../../lib/poolActivity/loadPoolActivityForViewer";
import { PoolActivityFeedPanel } from "./PoolActivityFeedPanel";

type Props = {
  poolId: string;
  viewAllHref: string;
  /** Viewer participant profile in this pool (for reactions). */
  viewerParticipantId?: string | null;
  /** Preview depth on Home; full page uses a larger limit at the call site. */
  itemLimit?: number;
  compact?: boolean;
  /**
   * When false, render nothing if there are no items and no error (legacy preview behavior).
   */
  showWhenEmpty?: boolean;
  showFilters?: boolean;
  showAnnouncementComposer?: boolean;
  isPoolAdmin?: boolean;
};

export async function PoolRecentActivitySection({
  poolId,
  viewAllHref,
  viewerParticipantId = null,
  itemLimit = 5,
  compact = true,
  showWhenEmpty = true,
  showFilters = false,
  showAnnouncementComposer = false,
  isPoolAdmin = false,
}: Props) {
  const supabase = await createClient();
  let activity: Awaited<ReturnType<typeof loadPoolActivityForViewer>> | null =
    null;
  let loadError: string | null = null;
  let locked = false;
  let revealHref: string | null = null;
  let leaderboardHref: string | null = null;
  let outlookHref: string | null = null;
  try {
    const { data: poolRow } = await supabase
      .from("pools")
      .select("lock_at, is_public")
      .eq("id", poolId)
      .maybeSingle();
    locked = poolLocked((poolRow?.lock_at as string | null) ?? null);
    revealHref =
      locked && viewerParticipantId
        ? `/account/reveal?participant=${viewerParticipantId}`
        : null;
    if (poolRow && viewerParticipantId) {
      let hasAwardedPoints = false;
      let outlookHasMeaningfulSeparation = false;
      if (locked) {
        try {
          hasAwardedPoints = await fetchPoolHasAwardedLeaderboardPoints(poolId);
        } catch {
          hasAwardedPoints = false;
        }
        if (!hasAwardedPoints) {
          try {
            const {
              data: { user },
            } = await supabase.auth.getUser();
            const outlookRes = await fetchBracketOutlookForPool(poolId, {
              supabase,
              viewerUserId: user?.id ?? null,
              skipMembershipCheck: Boolean(poolRow.is_public),
            });
            outlookHasMeaningfulSeparation =
              outlookRes.ok && outlookRes.visibility.showOutlook;
          } catch {
            outlookHasMeaningfulSeparation = false;
          }
        }
      }
      const standingsNav = resolveStandingsNav({
        poolId,
        isPublic: Boolean(poolRow.is_public),
        participantId: viewerParticipantId,
        picksLocked: locked,
        hasAwardedPoints,
        outlookHasMeaningfulSeparation,
      });
      leaderboardHref =
        standingsNav.label === "Leaderboard" ? standingsNav.href : null;
      outlookHref = standingsNav.label === "Outlook" ? standingsNav.href : null;
    }
    activity = await loadPoolActivityForViewer(supabase, poolId, {
      ensureDailyRecap: true,
      limit: itemLimit,
      viewerParticipantId,
    });
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Could not load pool activity.";
  }

  if (!showWhenEmpty && !loadError && activity && activity.items.length === 0) {
    return null;
  }

  return (
    <section className="mb-8 rounded-xl border border-ash-border bg-ash-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-ash-text">Recent activity</h2>
        <Link
          href={viewAllHref}
          className="text-xs font-medium text-ash-accent underline-offset-2 hover:underline"
        >
          View all activity
        </Link>
      </div>
      {loadError ? (
        <p
          className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          {loadError}
        </p>
      ) : (
        <PoolActivityFeedPanel
          items={activity?.items ?? []}
          poolId={poolId}
          viewerParticipantId={viewerParticipantId}
          reactions={
            activity?.reactions ?? { counts: {}, viewerReactions: {}, summaries: {} }
          }
          isPoolAdmin={isPoolAdmin}
          compact={compact}
          liveRecapFacts={activity?.liveRecapFacts ?? null}
          liveRecapDateYmd={activity?.liveRecapDateYmd ?? null}
          ashbotEnabled={activity?.ashbotEnabled ?? true}
          showFilters={showFilters}
          showAnnouncementComposer={showAnnouncementComposer}
          poolLocked={locked}
          revealHref={revealHref}
          leaderboardHref={leaderboardHref ?? outlookHref}
        />
      )}
    </section>
  );
}
