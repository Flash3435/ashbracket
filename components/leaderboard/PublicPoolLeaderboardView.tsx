import Link from "next/link";
import type { ReactNode } from "react";
import {
  buildPublicPoolLeaderboardPresentation,
  poolLeaderboardSummaryCards,
  type PublicPoolLeaderboardRowDisplay,
} from "@/lib/leaderboard/buildPublicPoolLeaderboardPresentation";
import { buildViewerLeaderComparison } from "@/lib/leaderboard/buildViewerLeaderComparison";
import {
  mapRaceOutlookByParticipantId,
} from "@/lib/leaderboard/leaderboardRaceRowContext";
import {
  mapLeaderboardMomentumByParticipantId,
  pickBiggestMovers,
  type LeaderboardMomentumResult,
  type LeaderboardMomentumRow,
} from "@/lib/leaderboard/buildLeaderboardMomentum";
import { formatPointsWithRecentDelta } from "@/lib/leaderboard/leaderboardMomentumDisplay";
import { JumpToMyLeaderboardRowButton } from "./JumpToMyLeaderboardRowButton";
import { ViewerLeaderComparisonSummary } from "./ViewerLeaderComparisonSummary";
import { LeaderboardParticipantCell } from "./LeaderboardParticipantCell";
import { LeaderboardRankMovementIndicator } from "./LeaderboardRankMovementIndicator";
import { LeaderboardBiggestMoversCard } from "./LeaderboardBiggestMoversCard";
import { LeaderboardBiggestBracketImpactCard } from "./LeaderboardBiggestBracketImpactCard";
import { LiveScoresUpdateNotice } from "../tournament/LiveScoresUpdateNotice";
import type { LeaderboardPublicRow } from "../../types/leaderboard";
import type { PoolPublicStats } from "../../lib/pool/fetchPoolPublicStats";
import { PoolPublicStatsSummary } from "../pool/PoolPublicStatsSummary";
import { formatUsdCents } from "@/lib/format/usdCents";
import { poolLeaderboardIsActiveFromRows } from "@/lib/leaderboard/poolLeaderboardIsActive";
import { resolveLeaderboardStandingsSubtitle } from "@/lib/leaderboard/leaderboardPageCopy";
import { LeaderboardPostLockIntro } from "./LeaderboardPostLockIntro";
import { BracketOutlookView } from "./BracketOutlookView";
import type { BracketOutlookSummary } from "@/lib/leaderboard/bracketOutlookSeparation";
import { TournamentStatLeadersPanel } from "@/components/tournament/TournamentStatLeadersPanel";
import type { TournamentStatLeadersView } from "@/lib/tournament/matchTeamStats/buildTournamentStatLeadersView";
import { ChampionPickExposureCard } from "@/components/pool/ChampionPickExposureCard";
import type { ChampionPickExposure } from "@/lib/pool/buildChampionPickExposure";
import type { ParticipantRaceOutlook } from "@/lib/pool/buildParticipantRaceOutlook";
import type { LeaderboardBracketImpactResult } from "@/lib/leaderboard/fetchLeaderboardBracketImpactForPool";
import type { LeaderboardLatestScoreEventContext } from "@/lib/leaderboard/parseLatestScoreEventContext";

function summaryCard(label: string, value: string, hint: string) {
  return (
    <div className="rounded-xl border border-ash-border/70 bg-ash-body/25 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ash-muted">
        {label}
      </p>
      <p className="mt-2 line-clamp-2 text-lg font-semibold leading-snug text-ash-text sm:text-xl">
        {value}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-ash-muted">{hint}</p>
    </div>
  );
}

function rankCell(
  row: PublicPoolLeaderboardRowDisplay,
  momentum: LeaderboardMomentumRow | null = null,
) {
  const base =
    "inline-flex min-w-[2.25rem] items-center justify-center rounded-full px-2 py-0.5 text-sm font-bold tabular-nums";

  let badge: ReactNode;
  if (row.podium === "gold") {
    badge = (
      <span className={`${base} border border-amber-500/50 bg-amber-500/20 text-amber-100`}>
        {row.rank}
      </span>
    );
  } else if (row.podium === "silver") {
    badge = (
      <span className={`${base} border border-slate-400/40 bg-slate-500/15 text-slate-200`}>
        {row.rank}
      </span>
    );
  } else if (row.podium === "bronze") {
    badge = (
      <span className={`${base} border border-orange-500/40 bg-orange-600/15 text-orange-100`}>
        {row.rank}
      </span>
    );
  } else {
    badge = (
      <span className={`${base} border border-ash-border/60 bg-ash-body/40 text-ash-muted`}>
        {row.rank}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {badge}
      <LeaderboardRankMovementIndicator momentum={momentum} />
    </span>
  );
}

function rowSurfaceClass(
  row: PublicPoolLeaderboardRowDisplay,
  isViewerRow: boolean,
): string {
  let base: string;
  if (row.podium === "gold") {
    base = "border-l-4 border-amber-500/80 bg-amber-500/[0.08]";
  } else if (row.podium === "silver") {
    base = "border-l-4 border-slate-400/70 bg-slate-400/[0.06]";
  } else if (row.podium === "bronze") {
    base = "border-l-4 border-orange-500/70 bg-orange-500/[0.06]";
  } else {
    base = "border-l-4 border-transparent";
  }

  if (isViewerRow && row.podium == null) {
    return `${base} ring-1 ring-inset ring-sky-400/25 bg-gradient-to-r from-sky-500/[0.07] to-transparent`;
  }

  return base;
}

function viewerRowScrollProps(isViewerRow: boolean): {
  "data-viewer-leaderboard-entry"?: true;
  tabIndex?: -1;
  className?: string;
} {
  if (!isViewerRow) return {};
  return {
    "data-viewer-leaderboard-entry": true,
    tabIndex: -1,
    className: "scroll-mt-24",
  };
}

type Props = {
  poolName: string;
  rows: LeaderboardPublicRow[];
  stats: PoolPublicStats | null;
  statsError: string | null;
  leaderboardError: string | null;
  viewerParticipantId?: string | null;
  liveScoresLastUpdatedAt?: string | null;
  picksLocked?: boolean;
  revealHref?: string | null;
  audience?: "public" | "member";
  bonusWatchView?: TournamentStatLeadersView | null;
  bracketOutlookSummary?: BracketOutlookSummary | null;
  showBracketOutlook?: boolean;
  decisiveResultCount?: number;
  championPickExposure?: ChampionPickExposure | null;
  showChampionPickExposure?: boolean;
  participantRaceOutlook?: ParticipantRaceOutlook | null;
  leaderboardMomentum?: LeaderboardMomentumResult | null;
  leaderboardBracketImpact?: LeaderboardBracketImpactResult | null;
  latestScoreEvent?: LeaderboardLatestScoreEventContext | null;
};

export function PublicPoolLeaderboardView({
  poolName,
  rows,
  stats,
  statsError,
  leaderboardError,
  viewerParticipantId = null,
  liveScoresLastUpdatedAt = null,
  picksLocked = false,
  revealHref = null,
  audience = "public",
  bonusWatchView = null,
  bracketOutlookSummary = null,
  showBracketOutlook = false,
  decisiveResultCount = 0,
  championPickExposure = null,
  showChampionPickExposure = false,
  participantRaceOutlook = null,
  leaderboardMomentum = null,
  leaderboardBracketImpact = null,
  latestScoreEvent = null,
}: Props) {
  if (leaderboardError) {
    return (
      <p
        className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
        role="alert"
      >
        Could not load the leaderboard: {leaderboardError}
      </p>
    );
  }

  const presentation = buildPublicPoolLeaderboardPresentation(rows);
  const cards = poolLeaderboardSummaryCards(presentation, stats);
  const leaderboardActive = poolLeaderboardIsActiveFromRows(rows);
  const viewerComparison = buildViewerLeaderComparison(rows, viewerParticipantId);
  const hasViewerRow =
    viewerParticipantId != null &&
    presentation.rows.some((r) => r.participantId === viewerParticipantId);
  const raceOutlookByParticipantId = mapRaceOutlookByParticipantId(participantRaceOutlook);
  const momentumByParticipantId = mapLeaderboardMomentumByParticipantId(leaderboardMomentum);
  const biggestMovers = pickBiggestMovers(leaderboardMomentum ?? { hasPreviousSnapshot: false, rows: [] });
  const bracketImpactByParticipantId =
    leaderboardBracketImpact?.rowsByParticipantId ?? new Map();
  const showBracketImpactCard =
    biggestMovers.length === 0 &&
    leaderboardBracketImpact?.hasBracketImpact === true &&
    leaderboardBracketImpact.summary != null;
  const displayNameByParticipantId = new Map(
    presentation.rows.map((row) => [row.participantId, row.displayName]),
  );
  const hasMomentum = leaderboardMomentum?.hasPreviousSnapshot === true;
  const hasRaceOutlook = raceOutlookByParticipantId.size > 0;
  const leaderboardSubtitle = resolveLeaderboardStandingsSubtitle({
    hasMomentum,
    hasRaceOutlook,
    participantCount: presentation.participantCount,
  });

  if (presentation.participantCount > 0 && !leaderboardActive) {
    return (
      <div className="space-y-8">
        {picksLocked ? (
          <LeaderboardPostLockIntro revealHref={revealHref} />
        ) : null}
        <BracketOutlookView
          poolName={poolName}
          entryCount={presentation.participantCount}
          decisiveResultCount={decisiveResultCount}
          revealHref={revealHref}
          showOutlook={showBracketOutlook && bracketOutlookSummary != null}
          summary={bracketOutlookSummary}
        />
        {showChampionPickExposure && championPickExposure ? (
          <ChampionPickExposureCard exposure={championPickExposure} collapsible />
        ) : null}
      </div>
    );
  }

  if (presentation.participantCount === 0) {
    return (
      <div className="space-y-8">
        <section className="ash-surface px-5 py-8 text-center sm:px-8">
          <p className="text-3xl" aria-hidden>
            🏆
          </p>
          <h2 className="mt-4 text-xl font-bold text-ash-text">{poolName}</h2>
          <p className="mt-2 text-sm text-ash-muted">
            No participants on the public leaderboard yet. Entries appear here after
            people join and the pool is open for standings.
          </p>
          <Link href="/rules" className="ash-link mt-4 inline-block text-sm">
            View pool rules
          </Link>
        </section>
        <PoolPublicStatsSummary
          poolLabel={poolName}
          stats={stats}
          errorMessage={statsError}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 sm:space-y-10">
      {picksLocked ? (
        <LeaderboardPostLockIntro revealHref={revealHref} />
      ) : null}
      {bonusWatchView ? (
        <TournamentStatLeadersPanel variant="user" view={bonusWatchView} />
      ) : null}
      <section className="ash-surface relative overflow-hidden px-5 py-5 sm:px-6 sm:py-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(22,163,74,0.14),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_70%)]" />
        <div className="relative space-y-4">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-ash-border/70 bg-ash-body/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ash-muted">
              {audience === "member" ? "Pool standings" : " Public leaderboard"}
            </span>
            {stats?.prizePoolCents != null && stats.entryFeeCents != null ? (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-950/25 px-3 py-1 text-[11px] font-semibold text-emerald-100">
                Est. prize {formatUsdCents(stats.prizePoolCents)}
              </span>
            ) : null}
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-ash-text sm:text-4xl">
              {poolName}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ash-muted sm:text-base">
              See who is leading, how tight the race is, and tap any name for picks
              and a full scoring breakdown.
            </p>
            <LiveScoresUpdateNotice
              lastUpdatedAt={liveScoresLastUpdatedAt}
              className="mt-4 max-w-3xl"
            />
            {presentation.allScoresZero ? (
              <p className="mt-2 text-sm text-amber-100/90">
                Everyone is still at zero — the board will come alive as match results
                award points.
              </p>
            ) : null}
          </div>
          <p className="text-sm">
            <Link href="/rules" className="ash-link">
              Pool rules & scoring
            </Link>
          </p>
          {hasViewerRow ? (
            <div className="space-y-3">
              {viewerComparison ? (
                <ViewerLeaderComparisonSummary comparison={viewerComparison} />
              ) : null}
              <JumpToMyLeaderboardRowButton />
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCard("Current leader", cards.leaderLine, cards.leaderHint)}
        {summaryCard("Race for 2nd", cards.raceLine, cards.raceHint)}
        {summaryCard("On the board", cards.progressLine, cards.progressHint)}
        {summaryCard("Entries", cards.entriesLine, cards.entriesHint)}
      </section>

      <section className="space-y-4">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ash-muted">
            Standings
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-ash-text">
            Leaderboard
          </h2>
          <p className="max-w-3xl text-sm leading-relaxed text-ash-muted">
            {leaderboardSubtitle}
          </p>
        </div>

        {biggestMovers.length > 0 ? (
          <LeaderboardBiggestMoversCard
            movers={biggestMovers}
            displayNameByParticipantId={displayNameByParticipantId}
          />
        ) : showBracketImpactCard ? (
          <LeaderboardBiggestBracketImpactCard
            summary={leaderboardBracketImpact!.summary!}
            uniformPointsDelta={leaderboardBracketImpact!.uniformPointsDelta}
            affectedCount={presentation.participantCount}
          />
        ) : null}

        <div className="hidden overflow-hidden rounded-xl border border-ash-border/70 md:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ash-border bg-ash-body/50 text-xs font-medium uppercase tracking-wide text-ash-muted">
              <tr>
                <th className="w-20 px-4 py-3">Rank</th>
                <th className="px-4 py-3">Participant</th>
                <th className="px-4 py-3 text-right">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ash-border/60">
              {presentation.rows.map((row) => {
                const isViewerRow =
                  viewerParticipantId != null &&
                  row.participantId === viewerParticipantId;
                const scrollProps = viewerRowScrollProps(isViewerRow);
                const raceOutlook =
                  raceOutlookByParticipantId.get(row.participantId) ?? null;
                const momentum =
                  momentumByParticipantId.get(row.participantId) ?? null;
                const bracketImpact =
                  bracketImpactByParticipantId.get(row.participantId) ?? null;

                return (
                  <tr
                    key={row.participantId}
                    className={`${rowSurfaceClass(row, isViewerRow)} ${scrollProps.className ?? ""}`.trim()}
                    aria-current={isViewerRow ? "true" : undefined}
                    data-viewer-leaderboard-entry={scrollProps["data-viewer-leaderboard-entry"]}
                    tabIndex={scrollProps.tabIndex}
                  >
                    <td className="px-4 py-3.5 align-top">{rankCell(row, momentum)}</td>
                    <td className="px-4 py-3.5 align-top">
                      <LeaderboardParticipantCell
                        row={row}
                        isViewerRow={isViewerRow}
                        raceOutlook={raceOutlook}
                        momentum={momentum}
                        bracketImpact={bracketImpact}
                        latestScoreEvent={latestScoreEvent}
                        layout="table"
                      />
                    </td>
                    <td className="px-4 py-3.5 text-right align-top">
                      <span className="text-lg font-bold tabular-nums text-ash-text">
                        {formatPointsWithRecentDelta(
                          row.totalPoints,
                          latestScoreEvent?.hasValidSnapshot ? momentum : null,
                          { showZero: true, latestSuffix: true },
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="space-y-3 md:hidden">
          {presentation.rows.map((row) => {
            const isViewerRow =
              viewerParticipantId != null &&
              row.participantId === viewerParticipantId;
            const scrollProps = viewerRowScrollProps(isViewerRow);
            const raceOutlook =
              raceOutlookByParticipantId.get(row.participantId) ?? null;
            const momentum =
              momentumByParticipantId.get(row.participantId) ?? null;
            const bracketImpact =
              bracketImpactByParticipantId.get(row.participantId) ?? null;

            return (
              <li
                key={row.participantId}
                className={scrollProps.className}
                data-viewer-leaderboard-entry={scrollProps["data-viewer-leaderboard-entry"]}
                tabIndex={scrollProps.tabIndex}
                aria-current={isViewerRow ? "true" : undefined}
              >
                <div
                  className={`rounded-xl border border-ash-border/70 px-4 py-4 ${rowSurfaceClass(row, isViewerRow)}`}
                >
                  <LeaderboardParticipantCell
                    row={row}
                    isViewerRow={isViewerRow}
                    raceOutlook={raceOutlook}
                    momentum={momentum}
                    bracketImpact={bracketImpact}
                    latestScoreEvent={latestScoreEvent}
                    layout="mobile"
                    rankCell={rankCell(row, momentum)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <PoolPublicStatsSummary
        poolLabel={poolName}
        stats={stats}
        errorMessage={statsError}
      />

      {showChampionPickExposure && championPickExposure ? (
        <ChampionPickExposureCard exposure={championPickExposure} collapsible />
      ) : null}
    </div>
  );
}
