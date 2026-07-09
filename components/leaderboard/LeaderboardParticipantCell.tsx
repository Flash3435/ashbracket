import Link from "next/link";
import type { ReactNode } from "react";
import type { PublicPoolLeaderboardRowDisplay } from "@/lib/leaderboard/buildPublicPoolLeaderboardPresentation";
import type { LeaderboardMomentumRow } from "@/lib/leaderboard/buildLeaderboardMomentum";
import type { BracketImpactParticipantRow } from "@/lib/poolActivity/scoreImpact/buildBracketImpact";
import type { LeaderboardLatestScoreEventContext } from "@/lib/leaderboard/parseLatestScoreEventContext";
import type { LeaderboardLatestPointsBreakdown } from "@/lib/leaderboard/computeLatestMatchPointsBreakdown";
import {
  expandedTopRemainingPicks,
  formatExpandedRemainingPicksMoreLine,
  formatRaceOutlookLeaderComparison,
  formatTopRemainingPickLine,
  raceOutlookExpandedFallbackCopy,
  raceStatusBadgeClass,
} from "@/lib/leaderboard/leaderboardRaceRowContext";
import {
  formatExpandedMomentumContext,
  formatPointsWithRecentDelta,
} from "@/lib/leaderboard/leaderboardMomentumDisplay";
import {
  formatExpandedBracketImpactContext,
  formatLeaderboardLatestImpactSummary,
} from "@/lib/leaderboard/leaderboardBracketImpactDisplay";
import type { ParticipantRaceOutlookRow } from "@/lib/pool/buildParticipantRaceOutlook";
import { participantPublicProfileHref } from "@/lib/participant/participantProfileRouting";
import { ViewerYouChip } from "../ui/ViewerYouChip";

function latestPointsOptions(
  event: LeaderboardLatestScoreEventContext | null | undefined,
  pointsBreakdown?: LeaderboardLatestPointsBreakdown | null,
): {
  showZero?: boolean;
  latestSuffix?: boolean;
  pointsBreakdown?: LeaderboardLatestPointsBreakdown | null;
  event?: LeaderboardLatestScoreEventContext | null;
} {
  const isMatchAttributed =
    event?.eventKind === "single_match" || event?.eventKind === "multi_match";
  return {
    showZero: true,
    latestSuffix: isMatchAttributed,
    pointsBreakdown,
    event: event ?? undefined,
  };
}

type Props = {
  row: PublicPoolLeaderboardRowDisplay;
  isViewerRow: boolean;
  raceOutlook?: ParticipantRaceOutlookRow | null;
  momentum?: LeaderboardMomentumRow | null;
  bracketImpact?: BracketImpactParticipantRow | null;
  latestScoreEvent?: LeaderboardLatestScoreEventContext | null;
  pointsBreakdown?: LeaderboardLatestPointsBreakdown | null;
  layout: "table" | "mobile";
  rankCell?: ReactNode;
};

function RaceStatusBadge({ outlook }: { outlook: ParticipantRaceOutlookRow }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${raceStatusBadgeClass(outlook.statusLabel)}`}
    >
      {outlook.statusLabel}
    </span>
  );
}

function LatestImpactLines({
  totalPoints,
  momentum = null,
  bracketImpact = null,
  latestScoreEvent = null,
  outlook = null,
  pointsBreakdown = null,
  participantId,
  displayName = null,
}: {
  totalPoints: number;
  momentum?: LeaderboardMomentumRow | null;
  bracketImpact?: BracketImpactParticipantRow | null;
  latestScoreEvent?: LeaderboardLatestScoreEventContext | null;
  outlook?: ParticipantRaceOutlookRow | null;
  pointsBreakdown?: LeaderboardLatestPointsBreakdown | null;
  participantId?: string;
  displayName?: string | null;
}) {
  const showLatest = momentum != null && latestScoreEvent?.hasValidSnapshot === true;
  const { latestLine, impactLine, correctionLine, otherScoringLine } =
    formatLeaderboardLatestImpactSummary({
      totalPoints,
      momentum,
      event: latestScoreEvent,
      outlook,
      bracketImpact,
      pointsBreakdown,
      participantId,
      displayName,
    });

  if (!showLatest && !impactLine) return null;

  return (
    <div className="mt-1 space-y-0.5">
      {showLatest && latestLine ? (
        <p className="text-xs leading-relaxed text-ash-text/90">{latestLine}</p>
      ) : null}
      {showLatest && correctionLine && latestLine !== correctionLine ? (
        <p className="text-xs leading-relaxed text-ash-muted">{correctionLine}</p>
      ) : null}
      {showLatest && otherScoringLine ? (
        <p className="text-xs leading-relaxed text-ash-muted">{otherScoringLine}</p>
      ) : null}
      {impactLine ? (
        <p className="text-xs leading-relaxed text-ash-muted">{impactLine}</p>
      ) : null}
    </div>
  );
}

function RaceOutlookDetails({
  outlook,
  momentum = null,
  bracketImpact = null,
  latestScoreEvent = null,
  pointsBreakdown = null,
}: {
  outlook: ParticipantRaceOutlookRow;
  momentum?: LeaderboardMomentumRow | null;
  bracketImpact?: BracketImpactParticipantRow | null;
  latestScoreEvent?: LeaderboardLatestScoreEventContext | null;
  pointsBreakdown?: LeaderboardLatestPointsBreakdown | null;
}) {
  const topPicks = expandedTopRemainingPicks(outlook);
  const moreLine = formatExpandedRemainingPicksMoreLine(outlook);
  const leaderComparison = formatRaceOutlookLeaderComparison(outlook);
  const momentumLine = formatExpandedMomentumContext(momentum);
  const bracketImpactLine = formatExpandedBracketImpactContext(
    bracketImpact,
    latestScoreEvent,
    momentum,
    pointsBreakdown,
  );

  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer text-xs font-medium text-ash-accent hover:underline">
        Details
      </summary>
      <div className="mt-2 space-y-1.5 text-xs leading-relaxed text-ash-muted">
        {topPicks.length > 0 ? (
          <div>
            <p className="font-medium text-ash-text">Most important remaining</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {topPicks.map((pick) => (
                <li key={`${pick.predictionKind}-${pick.teamId}`}>
                  {formatTopRemainingPickLine(pick)}
                </li>
              ))}
            </ul>
            {moreLine ? <p className="mt-1">{moreLine}</p> : null}
          </div>
        ) : (
          <p>{raceOutlookExpandedFallbackCopy(outlook)}</p>
        )}
        {momentumLine ? <p>{momentumLine}</p> : null}
        {bracketImpactLine ? <p>{bracketImpactLine}</p> : null}
        <p>{leaderComparison}</p>
      </div>
    </details>
  );
}

function ParticipantNameLink({
  row,
  isViewerRow,
  raceOutlook,
  emphasized = false,
}: {
  row: PublicPoolLeaderboardRowDisplay;
  isViewerRow: boolean;
  raceOutlook?: ParticipantRaceOutlookRow | null;
  emphasized?: boolean;
}) {
  const href = participantPublicProfileHref(row.participantId);
  const nameClass = emphasized
    ? "font-semibold text-ash-text hover:text-ash-accent hover:underline"
    : "font-medium text-ash-text hover:text-ash-accent hover:underline";

  const label = (
    <span className="inline-flex max-w-full flex-wrap items-center gap-2">
      {href ? (
        <Link href={href} className={nameClass}>
          {row.displayName}
        </Link>
      ) : (
        <span className={emphasized ? "font-semibold text-ash-text" : "font-medium text-ash-text"}>
          {row.displayName}
        </span>
      )}
      {isViewerRow ? <ViewerYouChip /> : null}
      {raceOutlook ? <RaceStatusBadge outlook={raceOutlook} /> : null}
    </span>
  );

  return label;
}

export function LeaderboardParticipantCell({
  row,
  isViewerRow,
  raceOutlook = null,
  momentum = null,
  bracketImpact = null,
  latestScoreEvent = null,
  pointsBreakdown = null,
  layout,
  rankCell = null,
}: Props) {
  const tiedNote = row.isTiedAtRank ? (
    <p className="text-xs text-ash-muted">Tied at rank {row.rank}</p>
  ) : null;

  const showLatestImpact =
    (momentum != null && latestScoreEvent?.hasValidSnapshot === true) ||
    bracketImpact != null;

  const pointsLabel = formatPointsWithRecentDelta(
    row.totalPoints,
    latestScoreEvent?.hasValidSnapshot ? momentum : null,
    latestPointsOptions(latestScoreEvent, pointsBreakdown),
  );

  const impactContext = showLatestImpact ? (
    <>
      <LatestImpactLines
        totalPoints={row.totalPoints}
        momentum={momentum}
        bracketImpact={bracketImpact}
        latestScoreEvent={latestScoreEvent}
        outlook={raceOutlook}
        pointsBreakdown={pointsBreakdown}
        participantId={row.participantId}
        displayName={row.displayName}
      />
      {raceOutlook ? (
        <RaceOutlookDetails
          outlook={raceOutlook}
          momentum={momentum}
          bracketImpact={bracketImpact}
          latestScoreEvent={latestScoreEvent}
          pointsBreakdown={pointsBreakdown}
        />
      ) : null}
    </>
  ) : raceOutlook ? (
    <RaceOutlookDetails
      outlook={raceOutlook}
      momentum={momentum}
      bracketImpact={bracketImpact}
      latestScoreEvent={latestScoreEvent}
      pointsBreakdown={pointsBreakdown}
    />
  ) : null;

  if (layout === "mobile") {
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {rankCell}
          <div className="min-w-0 flex-1">
            <ParticipantNameLink
              row={row}
              isViewerRow={isViewerRow}
              raceOutlook={raceOutlook}
              emphasized
            />
            {tiedNote}
            {impactContext}
          </div>
        </div>
        <span className="shrink-0 text-xl font-bold tabular-nums text-ash-text">
          {pointsLabel}
        </span>
      </div>
    );
  }

  return (
    <div>
      <ParticipantNameLink row={row} isViewerRow={isViewerRow} raceOutlook={raceOutlook} />
      {tiedNote}
      {impactContext}
    </div>
  );
}
