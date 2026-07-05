import { PublicPoolLeaderboardView } from "@/components/leaderboard/PublicPoolLeaderboardView";
import { PicksDeadlineBannerFromPool } from "@/components/pool/PicksDeadlineBannerFromPool";
import { SimulationModeBanner } from "@/components/admin/SimulationModeBanner";
import { PageContainer } from "@/components/ui/PageContainer";
import { getMyParticipantIdInPool } from "@/lib/join/actions";
import { mapPublicLeaderboardRow } from "@/lib/leaderboard/publicLeaderboard";
import { fetchPoolPublicStats } from "@/lib/pool/fetchPoolPublicStats";
import { fetchPublicLiveScoresLastUpdated } from "@/lib/tournament/liveDailyUpdateStatus";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { poolLocked } from "@/lib/pools/poolLocked";
import { fetchBracketOutlookForPool } from "@/lib/leaderboard/fetchBracketOutlookForPool";
import { fetchChampionPickExposureForPool } from "@/lib/pool/fetchChampionPickExposureForPool";
import { fetchParticipantRaceOutlookForPool } from "@/lib/pool/fetchParticipantRaceOutlookForPool";
import { fetchLeaderboardLatestScoreImpactForPool } from "@/lib/leaderboard/fetchLeaderboardLatestScoreImpactForPool";
import { computeBracketOutlookSummary } from "@/lib/leaderboard/bracketOutlookSeparation";
import { TournamentStatLeadersPanel } from "@/components/tournament/TournamentStatLeadersPanel";
import { loadTournamentTeamStatLeaders } from "@/lib/tournament/matchTeamStats/loadTournamentTeamStatLeaders";
import type { LeaderboardPublicRowDb } from "../../../../types/leaderboard";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ poolId: string }>;
};

export default async function PublicPoolLeaderboardPage({ params }: PageProps) {
  const { poolId } = await params;
  const poolIdTrimmed = poolId.trim();
  if (!poolIdTrimmed) {
    notFound();
  }

  const service = createServiceRoleClient();
  const { data: pool, error: poolError } = await service
    .from("pools")
    .select("id, name, is_public, is_simulation, lock_at")
    .eq("id", poolIdTrimmed)
    .maybeSingle();

  if (poolError || !pool || !pool.is_public) {
    notFound();
  }

  const supabase = await createClient();
  const isLivePool = !pool.is_simulation;
  const [leaderboardRes, statsRes, viewerParticipantId, liveScoresLastUpdatedAt] =
    await Promise.all([
    supabase
      .from("leaderboard_public")
      .select("pool_id, pool_name, participant_id, display_name, total_points, rank")
      .eq("pool_id", poolIdTrimmed)
      .order("rank", { ascending: true }),
    fetchPoolPublicStats(supabase, poolIdTrimmed),
    getMyParticipantIdInPool(poolIdTrimmed),
    isLivePool ? fetchPublicLiveScoresLastUpdated(supabase) : Promise.resolve(null),
  ]);

  const rows = leaderboardRes.error
    ? []
    : (leaderboardRes.data ?? []).map((row) =>
        mapPublicLeaderboardRow(row as LeaderboardPublicRowDb),
      );

  const lockAt = (pool.lock_at as string | null) ?? null;
  const picksLocked = poolLocked(lockAt);
  const bonusWatchRes =
    isLivePool && picksLocked
      ? await loadTournamentTeamStatLeaders(supabase, { poolId: poolIdTrimmed })
      : null;
  const revealHref =
    picksLocked && viewerParticipantId
      ? `/account/reveal?participant=${viewerParticipantId}`
      : null;

  const outlookRes =
    picksLocked && !pool.is_simulation
      ? await fetchBracketOutlookForPool(poolIdTrimmed, {
          skipMembershipCheck: true,
        })
      : null;
  const showBracketOutlook =
    outlookRes?.ok === true && outlookRes.visibility.showOutlook;
  const bracketOutlookSummary =
    showBracketOutlook && outlookRes?.ok && outlookRes.outlook
      ? computeBracketOutlookSummary(
          outlookRes.outlook,
          outlookRes.totalParticipantCount,
          viewerParticipantId
            ? {
                participantId: viewerParticipantId,
                displayName:
                  rows.find((row) => row.participantId === viewerParticipantId)
                    ?.displayName ?? "",
              }
            : null,
        )
      : null;
  const decisiveResultCount =
    outlookRes?.ok ? outlookRes.completedMatchCount : 0;

  const exposureRes = picksLocked
    ? await fetchChampionPickExposureForPool(poolIdTrimmed)
    : null;
  const showChampionPickExposure =
    exposureRes?.ok === true && exposureRes.showExposure;
  const championPickExposure =
    showChampionPickExposure && exposureRes?.ok ? exposureRes.exposure : null;

  const raceOutlookRes = picksLocked
    ? await fetchParticipantRaceOutlookForPool(poolIdTrimmed, {
        leaderboardRows: rows,
        viewerParticipantId,
      })
    : null;
  const participantRaceOutlook =
    raceOutlookRes?.ok === true && raceOutlookRes.showOutlook
      ? raceOutlookRes.outlook
      : null;

  const latestScoreImpact =
    picksLocked && rows.length > 0
      ? await fetchLeaderboardLatestScoreImpactForPool(service, poolIdTrimmed, rows).catch(
          () => null,
        )
      : null;
  const leaderboardMomentum = latestScoreImpact?.momentum ?? null;
  const leaderboardBracketImpact = latestScoreImpact?.bracketImpact ?? null;
  const latestScoreEvent = latestScoreImpact?.event ?? null;

  return (
    <PageContainer>
      <PicksDeadlineBannerFromPool poolId={poolIdTrimmed} className="mb-6" />
      {pool.is_simulation ? (
        <SimulationModeBanner
          variant="simulation"
          audience="public"
          poolName={pool.name as string}
          className="mb-6"
        />
      ) : null}

      <PublicPoolLeaderboardView
        poolName={pool.name as string}
        rows={rows}
        stats={statsRes.stats}
        statsError={statsRes.error}
        leaderboardError={leaderboardRes.error?.message ?? null}
        viewerParticipantId={viewerParticipantId}
        liveScoresLastUpdatedAt={isLivePool ? liveScoresLastUpdatedAt : null}
        picksLocked={picksLocked}
        revealHref={revealHref}
        bonusWatchView={bonusWatchRes?.ok ? bonusWatchRes.view : null}
        bracketOutlookSummary={bracketOutlookSummary}
        showBracketOutlook={showBracketOutlook}
        decisiveResultCount={decisiveResultCount}
        championPickExposure={championPickExposure}
        showChampionPickExposure={showChampionPickExposure}
        participantRaceOutlook={participantRaceOutlook}
        leaderboardMomentum={leaderboardMomentum}
        leaderboardBracketImpact={leaderboardBracketImpact}
        latestScoreEvent={latestScoreEvent}
      />
    </PageContainer>
  );
}
