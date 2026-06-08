import { formatPoolPoints } from "@/lib/format/poolPoints";
import type { LeaderboardPublicRow } from "../../types/leaderboard";
import { buildPublicPoolLeaderboardPresentation } from "./buildPublicPoolLeaderboardPresentation";

export type ViewerLeaderComparisonStatus =
  | "sole_leader"
  | "tied_for_first"
  | "trailing";

export type ViewerLeaderComparisonChip = {
  label: string;
  value: string;
};

/** Display-only summary for a signed-in participant vs pool leader (no ranking changes). */
export type ViewerLeaderComparison = {
  rank: number;
  totalPoints: number;
  status: ViewerLeaderComparisonStatus;
  gapToFirst: number | null;
  headline: string;
  detail: string;
  chips: ViewerLeaderComparisonChip[];
};

function rankChipValue(rank: number, isTiedAtRank: boolean): string {
  return isTiedAtRank ? `#${rank} (tied)` : `#${rank}`;
}

/**
 * Builds a conservative viewer-vs-leader summary from public leaderboard rows.
 * Returns null when the viewer cannot be matched to a row in this pool.
 */
export function buildViewerLeaderComparison(
  rows: LeaderboardPublicRow[],
  viewerParticipantId: string | null | undefined,
): ViewerLeaderComparison | null {
  if (!viewerParticipantId) return null;

  const viewer = rows.find((r) => r.participantId === viewerParticipantId);
  if (!viewer) return null;

  const presentation = buildPublicPoolLeaderboardPresentation(rows);
  const { leader, leaderTiedCount, allScoresZero, participantCount } =
    presentation;
  if (!leader) return null;

  const viewerDisplay = presentation.rows.find(
    (r) => r.participantId === viewerParticipantId,
  );
  const isTiedAtRank = viewerDisplay?.isTiedAtRank ?? false;
  const pointsLabel = formatPoolPoints(viewer.totalPoints);
  const rankValue = rankChipValue(viewer.rank, isTiedAtRank);

  const chips: ViewerLeaderComparisonChip[] = [
    { label: "Rank", value: rankValue },
    { label: "Points", value: pointsLabel },
  ];

  if (viewer.rank === 1 && leaderTiedCount === 1) {
    let detail = `${rankValue} · ${pointsLabel} pts`;
    if (participantCount === 1) {
      detail = `${detail} · only entry in this pool`;
    } else if (allScoresZero) {
      detail = `${detail} · everyone is still at zero`;
    }

    return {
      rank: viewer.rank,
      totalPoints: viewer.totalPoints,
      status: "sole_leader",
      gapToFirst: null,
      headline: "You're leading this pool",
      detail,
      chips,
    };
  }

  if (viewer.rank === 1 && leaderTiedCount > 1) {
    const tieLabel =
      leaderTiedCount === 2 ? "2-way tie" : `${leaderTiedCount}-way tie`;
    const detail = allScoresZero
      ? `${pointsLabel} pts · ${tieLabel} at the top · everyone is still at zero`
      : `${pointsLabel} pts · ${tieLabel} at the top`;

    return {
      rank: viewer.rank,
      totalPoints: viewer.totalPoints,
      status: "tied_for_first",
      gapToFirst: 0,
      headline: "You're tied for 1st",
      detail,
      chips,
    };
  }

  const gap = Math.max(0, leader.totalPoints - viewer.totalPoints);
  const gapLabel = formatPoolPoints(gap);
  chips.push({ label: "Behind 1st", value: gapLabel });

  return {
    rank: viewer.rank,
    totalPoints: viewer.totalPoints,
    status: "trailing",
    gapToFirst: gap,
    headline: `${gapLabel} pts behind 1st`,
    detail: `${rankValue} · ${pointsLabel} pts`,
    chips,
  };
}
