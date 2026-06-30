import Link from "next/link";
import type { ReactNode } from "react";
import type { PublicPoolLeaderboardRowDisplay } from "@/lib/leaderboard/buildPublicPoolLeaderboardPresentation";
import {
  formatLeaderboardChampionDetail,
  formatLeaderboardRaceSummary,
  raceOutlookDetailExplanation,
  raceStatusBadgeClass,
} from "@/lib/leaderboard/leaderboardRaceRowContext";
import type { ParticipantRaceOutlookRow } from "@/lib/pool/buildParticipantRaceOutlook";
import { participantPublicProfileHref } from "@/lib/participant/participantProfileRouting";
import { ViewerYouChip } from "../ui/ViewerYouChip";

type Props = {
  row: PublicPoolLeaderboardRowDisplay;
  isViewerRow: boolean;
  raceOutlook?: ParticipantRaceOutlookRow | null;
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

function RaceOutlookDetails({ outlook }: { outlook: ParticipantRaceOutlookRow }) {
  const championLabel = outlook.hasChampionPick
    ? `${outlook.championTeamName ?? "Champion"} — ${formatLeaderboardChampionDetail(outlook).toLowerCase()}`
    : "No champion pick";

  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer text-xs font-medium text-ash-accent hover:underline">
        Details
      </summary>
      <div className="mt-2 space-y-1 text-xs leading-relaxed text-ash-muted">
        <p>
          <span className="font-medium text-ash-text">Champion pick:</span> {championLabel}
        </p>
        <p>
          <span className="font-medium text-ash-text">Live knockout picks:</span>{" "}
          {outlook.liveKnockoutPicksRemaining}
        </p>
        <p>{raceOutlookDetailExplanation(outlook)}</p>
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
  layout,
  rankCell = null,
}: Props) {
  const tiedNote = row.isTiedAtRank ? (
    <p className="text-xs text-ash-muted">Tied at rank {row.rank}</p>
  ) : null;

  const raceContext = raceOutlook ? (
    <div className="mt-1 space-y-1">
      <p className="text-xs leading-relaxed text-ash-muted">
        {formatLeaderboardRaceSummary(raceOutlook)}
      </p>
      <RaceOutlookDetails outlook={raceOutlook} />
    </div>
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
          {row.pointsLabel}
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
