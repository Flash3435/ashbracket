import Link from "next/link";
import type { ReactNode } from "react";
import type { PublicPoolLeaderboardRowDisplay } from "@/lib/leaderboard/buildPublicPoolLeaderboardPresentation";
import type { LeaderboardMomentumRow } from "@/lib/leaderboard/buildLeaderboardMomentum";
import type { BracketImpactParticipantRow } from "@/lib/poolActivity/scoreImpact/buildBracketImpact";
import {
  expandedTopRemainingPicks,
  formatExpandedRemainingPicksMoreLine,
  formatLeaderboardRaceSummary,
  formatRaceOutlookLeaderComparison,
  formatTopRemainingPickLine,
  raceOutlookExpandedFallbackCopy,
  raceStatusBadgeClass,
} from "@/lib/leaderboard/leaderboardRaceRowContext";
import {
  formatExpandedMomentumContext,
  formatPointsWithRecentDelta,
} from "@/lib/leaderboard/leaderboardMomentumDisplay";
import { formatExpandedBracketImpactContext, formatMinimalBracketImpactLine } from "@/lib/leaderboard/leaderboardBracketImpactDisplay";
import type { ParticipantRaceOutlookRow } from "@/lib/pool/buildParticipantRaceOutlook";
import { participantPublicProfileHref } from "@/lib/participant/participantProfileRouting";
import { ViewerYouChip } from "../ui/ViewerYouChip";

type Props = {
  row: PublicPoolLeaderboardRowDisplay;
  isViewerRow: boolean;
  raceOutlook?: ParticipantRaceOutlookRow | null;
  momentum?: LeaderboardMomentumRow | null;
  bracketImpact?: BracketImpactParticipantRow | null;
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

function RaceOutlookDetails({
  outlook,
  momentum = null,
  bracketImpact = null,
}: {
  outlook: ParticipantRaceOutlookRow;
  momentum?: LeaderboardMomentumRow | null;
  bracketImpact?: BracketImpactParticipantRow | null;
}) {
  const topPicks = expandedTopRemainingPicks(outlook);
  const moreLine = formatExpandedRemainingPicksMoreLine(outlook);
  const leaderComparison = formatRaceOutlookLeaderComparison(outlook);
  const momentumLine = formatExpandedMomentumContext(momentum);
  const bracketImpactLine = formatExpandedBracketImpactContext(bracketImpact);

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
  layout,
  rankCell = null,
}: Props) {
  const tiedNote = row.isTiedAtRank ? (
    <p className="text-xs text-ash-muted">Tied at rank {row.rank}</p>
  ) : null;

  const pointsLabel = formatPointsWithRecentDelta(row.totalPoints, momentum, {
    showZero: true,
  });

  const raceContext = raceOutlook ? (
    <div className="mt-1 space-y-1">
      <p className="text-xs leading-relaxed text-ash-muted">
        {formatLeaderboardRaceSummary(raceOutlook, momentum, bracketImpact)}
      </p>
      <RaceOutlookDetails
        outlook={raceOutlook}
        momentum={momentum}
        bracketImpact={bracketImpact}
      />
    </div>
  ) : bracketImpact ? (
    <p className="mt-1 text-xs leading-relaxed text-ash-muted">
      {formatMinimalBracketImpactLine(momentum, bracketImpact, row.totalPoints)}
    </p>
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
            {raceContext}
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
      {raceContext}
    </div>
  );
}
