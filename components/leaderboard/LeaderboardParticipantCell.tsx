import Link from "next/link";
import type { ReactNode } from "react";
import type { PublicPoolLeaderboardRowDisplay } from "@/lib/leaderboard/buildPublicPoolLeaderboardPresentation";
import type { LeaderboardMomentumRow } from "@/lib/leaderboard/buildLeaderboardMomentum";
import type { BracketImpactParticipantRow } from "@/lib/poolActivity/scoreImpact/buildBracketImpact";
import type { LeaderboardLatestScoreEventContext } from "@/lib/leaderboard/parseLatestScoreEventContext";
import type { LeaderboardLatestPointsBreakdown } from "@/lib/leaderboard/computeLatestMatchPointsBreakdown";
import {
  formatRemainingTournamentPicksDisplay,
  raceStatusBadgeClass,
} from "@/lib/leaderboard/leaderboardRaceRowContext";
import { formatRecentPointsDelta } from "@/lib/leaderboard/leaderboardMomentumDisplay";
import { formatPoolPoints } from "@/lib/format/poolPoints";
import { formatLeaderboardLatestImpactSummary } from "@/lib/leaderboard/leaderboardBracketImpactDisplay";
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
    showZero: false,
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
  compact = false,
}: {
  totalPoints: number;
  momentum?: LeaderboardMomentumRow | null;
  bracketImpact?: BracketImpactParticipantRow | null;
  latestScoreEvent?: LeaderboardLatestScoreEventContext | null;
  outlook?: ParticipantRaceOutlookRow | null;
  pointsBreakdown?: LeaderboardLatestPointsBreakdown | null;
  participantId?: string;
  displayName?: string | null;
  /** Mobile: result/correction lines only — hide race-analysis impact. */
  compact?: boolean;
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

  const showImpact = !compact && impactLine;
  if (!showLatest && !showImpact) return null;

  return (
    <div className={compact ? "space-y-0.5" : "mt-1 space-y-0.5"}>
      {showLatest && latestLine ? (
        <p className="text-xs leading-relaxed text-ash-text/90">{latestLine}</p>
      ) : null}
      {showLatest && correctionLine && latestLine !== correctionLine ? (
        <p className="text-xs leading-relaxed text-ash-muted">{correctionLine}</p>
      ) : null}
      {showLatest && otherScoringLine ? (
        <p className="text-xs leading-relaxed text-ash-muted">{otherScoringLine}</p>
      ) : null}
      {showImpact ? (
        <p className="text-xs leading-relaxed text-ash-muted">{impactLine}</p>
      ) : null}
    </div>
  );
}

function RaceOutlookDetails({
  outlook,
  compact = false,
}: {
  outlook: ParticipantRaceOutlookRow;
  compact?: boolean;
}) {
  const remainingPicks = formatRemainingTournamentPicksDisplay(
    outlook.remainingTournamentPicks,
  );

  return (
    <details className={compact ? "mt-1" : "mt-1.5"}>
      <summary
        className={
          compact
            ? "cursor-pointer py-1.5 text-xs font-medium text-ash-accent hover:underline"
            : "cursor-pointer text-xs font-medium text-ash-accent hover:underline"
        }
      >
        Details
      </summary>
      <div className="mt-1.5 text-xs leading-snug text-ash-muted">
        <p className="font-medium text-ash-text">Tournament Picks</p>
        {compact ? (
          <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2.5 sm:gap-x-4">
            {remainingPicks.map((pick) => (
              <div key={pick.key} className="contents">
                <span className="whitespace-nowrap text-ash-muted">
                  <span className="mr-1" aria-hidden>
                    {pick.icon}
                  </span>
                  {pick.label}
                </span>
                <span className="min-w-0 break-words text-right font-medium text-ash-text">
                  {pick.teamName}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <ul className="mt-2 space-y-2">
            {remainingPicks.map((pick) => (
              <li key={pick.key}>
                <p className="text-ash-muted">
                  <span className="mr-1" aria-hidden>
                    {pick.icon}
                  </span>
                  {pick.label}
                </p>
                <p className="font-medium text-ash-text">{pick.teamName}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function ParticipantNameLink({
  row,
  isViewerRow,
  raceOutlook,
  emphasized = false,
  stackedBadge = false,
}: {
  row: PublicPoolLeaderboardRowDisplay;
  isViewerRow: boolean;
  raceOutlook?: ParticipantRaceOutlookRow | null;
  emphasized?: boolean;
  /** Mobile: badge under the name instead of wrapping inline. */
  stackedBadge?: boolean;
}) {
  const href = participantPublicProfileHref(row.participantId);
  const nameClass = emphasized
    ? "font-semibold text-ash-text hover:text-ash-accent hover:underline"
    : "font-medium text-ash-text hover:text-ash-accent hover:underline";

  const name = href ? (
    <Link href={href} className={`break-words ${nameClass}`}>
      {row.displayName}
    </Link>
  ) : (
    <span
      className={`break-words ${emphasized ? "font-semibold text-ash-text" : "font-medium text-ash-text"}`}
    >
      {row.displayName}
    </span>
  );

  if (stackedBadge) {
    return (
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          {name}
          {isViewerRow ? <ViewerYouChip /> : null}
        </div>
        {raceOutlook ? (
          <div className="mt-1">
            <RaceStatusBadge outlook={raceOutlook} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-2">
      {name}
      {isViewerRow ? <ViewerYouChip /> : null}
      {raceOutlook ? <RaceStatusBadge outlook={raceOutlook} /> : null}
    </span>
  );
}

function MobileScoreBlock({
  totalPoints,
  momentum,
  latestScoreEvent,
  pointsBreakdown,
}: {
  totalPoints: number;
  momentum: LeaderboardMomentumRow | null;
  latestScoreEvent: LeaderboardLatestScoreEventContext | null;
  pointsBreakdown: LeaderboardLatestPointsBreakdown | null;
}) {
  const deltaRaw = latestScoreEvent?.hasValidSnapshot
    ? formatRecentPointsDelta(
        momentum,
        latestPointsOptions(latestScoreEvent, pointsBreakdown),
      )
    : null;
  const deltaLabel = deltaRaw?.replace(/^\(|\)$/g, "") ?? null;

  return (
    <div className="shrink-0 text-right tabular-nums">
      <p className="whitespace-nowrap text-base font-bold leading-tight text-ash-text">
        {formatPoolPoints(totalPoints)} pts
      </p>
      {deltaLabel ? (
        <p className="mt-0.5 whitespace-nowrap text-[11px] font-medium leading-tight text-ash-muted">
          {deltaLabel}
        </p>
      ) : null}
    </div>
  );
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

  if (layout === "mobile") {
    const mobileImpact =
      showLatestImpact ? (
        <LatestImpactLines
          totalPoints={row.totalPoints}
          momentum={momentum}
          bracketImpact={bracketImpact}
          latestScoreEvent={latestScoreEvent}
          outlook={raceOutlook}
          pointsBreakdown={pointsBreakdown}
          participantId={row.participantId}
          displayName={row.displayName}
          compact
        />
      ) : null;

    return (
      <div className="min-w-0 space-y-2">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5">
          <div className="pt-0.5">{rankCell}</div>
          <div className="min-w-0">
            <ParticipantNameLink
              row={row}
              isViewerRow={isViewerRow}
              raceOutlook={raceOutlook}
              emphasized
              stackedBadge
            />
            {tiedNote}
          </div>
          <MobileScoreBlock
            totalPoints={row.totalPoints}
            momentum={momentum}
            latestScoreEvent={latestScoreEvent}
            pointsBreakdown={pointsBreakdown}
          />
        </div>
        {mobileImpact}
        {raceOutlook ? <RaceOutlookDetails outlook={raceOutlook} compact /> : null}
      </div>
    );
  }

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
      {raceOutlook ? <RaceOutlookDetails outlook={raceOutlook} /> : null}
    </>
  ) : raceOutlook ? (
    <RaceOutlookDetails outlook={raceOutlook} />
  ) : null;

  return (
    <div>
      <ParticipantNameLink row={row} isViewerRow={isViewerRow} raceOutlook={raceOutlook} />
      {tiedNote}
      {impactContext}
    </div>
  );
}
