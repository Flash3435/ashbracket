import { formatPoolPoints } from "@/lib/format/poolPoints";
import type { LeaderboardPublicRow } from "../../types/leaderboard";
import type { PoolPublicStats } from "../pool/fetchPoolPublicStats";

export type PublicPoolLeaderboardRowDisplay = LeaderboardPublicRow & {
  podium: "gold" | "silver" | "bronze" | null;
  isTiedAtRank: boolean;
  pointsLabel: string;
};

export type PublicPoolLeaderboardPresentation = {
  rows: PublicPoolLeaderboardRowDisplay[];
  participantCount: number;
  participantsWithPointsCount: number;
  allScoresZero: boolean;
  leader: LeaderboardPublicRow | null;
  leaderTiedCount: number;
  runnerUp: LeaderboardPublicRow | null;
  pointsGapToSecond: number | null;
  highestPoints: number;
};

function countAtRank(rows: LeaderboardPublicRow[], rank: number): number {
  return rows.filter((r) => r.rank === rank).length;
}

function podiumForRank(
  rank: number,
  tiedAtRank: boolean,
): "gold" | "silver" | "bronze" | null {
  if (tiedAtRank && rank > 1) return null;
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return null;
}

/**
 * Derived display-only stats from `leaderboard_public` rows (no ranking changes).
 */
export function buildPublicPoolLeaderboardPresentation(
  rows: LeaderboardPublicRow[],
): PublicPoolLeaderboardPresentation {
  const sorted = [...rows].sort((a, b) => a.rank - b.rank || b.totalPoints - a.totalPoints);
  const leaderTiedCount = countAtRank(sorted, 1);
  const leader = sorted.find((r) => r.rank === 1) ?? null;
  const runnerUp =
    leaderTiedCount === 1 ? (sorted.find((r) => r.rank === 2) ?? null) : null;
  const highestPoints = sorted.reduce((max, r) => Math.max(max, r.totalPoints), 0);
  const participantsWithPointsCount = sorted.filter((r) => r.totalPoints > 0).length;
  const allScoresZero = sorted.length > 0 && highestPoints <= 0;

  let pointsGapToSecond: number | null = null;
  if (leader && runnerUp && leaderTiedCount === 1) {
    pointsGapToSecond = leader.totalPoints - runnerUp.totalPoints;
  }

  const displayRows: PublicPoolLeaderboardRowDisplay[] = sorted.map((row) => {
    const tiedAtRank = countAtRank(sorted, row.rank) > 1;
    return {
      ...row,
      podium: podiumForRank(row.rank, tiedAtRank),
      isTiedAtRank: tiedAtRank,
      pointsLabel: formatPoolPoints(row.totalPoints),
    };
  });

  return {
    rows: displayRows,
    participantCount: sorted.length,
    participantsWithPointsCount,
    allScoresZero,
    leader,
    leaderTiedCount,
    runnerUp,
    pointsGapToSecond,
    highestPoints,
  };
}

export function formatPointsGap(gap: number | null): string | null {
  if (gap == null) return null;
  if (gap <= 0) return "Tied at the top";
  return `${formatPoolPoints(gap)} ahead of 2nd`;
}

export type PoolLeaderboardSummaryCards = {
  leaderLine: string;
  leaderHint: string;
  raceLine: string;
  raceHint: string;
  progressLine: string;
  progressHint: string;
  entriesLine: string;
  entriesHint: string;
};

export function poolLeaderboardSummaryCards(
  presentation: PublicPoolLeaderboardPresentation,
  stats: PoolPublicStats | null | undefined,
): PoolLeaderboardSummaryCards {
  const { leader, leaderTiedCount, runnerUp, pointsGapToSecond, allScoresZero } =
    presentation;
  const registered = stats?.registeredCount ?? presentation.participantCount;

  let leaderLine = "—";
  let leaderHint = "Leader appears once scores are on the board.";
  if (leader) {
    if (leaderTiedCount > 1) {
      leaderLine = `${leaderTiedCount}-way tie`;
      leaderHint = `Tied for 1st at ${formatPoolPoints(leader.totalPoints)} pts — tap a name below for picks and scoring.`;
    } else {
      leaderLine = leader.displayName;
      leaderHint = `${formatPoolPoints(leader.totalPoints)} pts — tap their name for picks and how points were earned.`;
    }
  } else if (presentation.participantCount === 0) {
    leaderLine = "No entries yet";
    leaderHint = "Participants will show here after they join the pool.";
  }

  let raceLine = "—";
  let raceHint = "Gap to second place once the field has separated.";
  if (allScoresZero && presentation.participantCount > 0) {
    raceLine = "All tied at 0";
    raceHint = "Everyone is even until official results start awarding points.";
  } else if (leaderTiedCount > 1) {
    raceLine = "Tied at the top";
    raceHint = "Multiple entries share first place on total points.";
  } else if (pointsGapToSecond != null && runnerUp) {
    raceLine = formatPointsGap(pointsGapToSecond) ?? "—";
    raceHint = `${runnerUp.displayName} is in 2nd with ${formatPoolPoints(runnerUp.totalPoints)} pts.`;
  } else if (leader && !runnerUp) {
    raceLine = "Solo leader";
    raceHint = "Only one entry on the board so far.";
  }

  const onBoard = presentation.participantsWithPointsCount;
  const progressLine =
    presentation.participantCount > 0
      ? `${onBoard} of ${presentation.participantCount}`
      : "0";
  const progressHint =
    onBoard === 0 && presentation.participantCount > 0
      ? "No points on the board yet — standings update when results are in and the pool recalculates."
      : `${onBoard} ${onBoard === 1 ? "entry has" : "entries have"} at least one point on the board. Totals refresh when official results are saved.`;

  const entriesLine = String(registered);
  const entriesHint =
    stats?.prizePoolCents != null && stats.entryFeeCents != null
      ? "Registered entries in this public pool. Prize pool estimate is shown below."
      : stats?.partial
        ? "Count from the public leaderboard. Payment and prize details may appear when available."
        : "Everyone registered in this pool.";

  return {
    leaderLine,
    leaderHint,
    raceLine,
    raceHint,
    progressLine,
    progressHint,
    entriesLine,
    entriesHint,
  };
}
