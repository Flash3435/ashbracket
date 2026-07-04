import type { LeaderboardPublicRow } from "../../types/leaderboard";

export type LeaderboardMomentumRow = {
  participantId: string;
  previousRank: number | null;
  currentRank: number;
  /** Positive = moved up, negative = moved down, 0 = unchanged. */
  rankChange: number;
  previousPoints: number | null;
  currentPoints: number;
  recentPointsGained: number;
  isNewEntry: boolean;
};

export type LeaderboardMomentumResult = {
  hasPreviousSnapshot: boolean;
  rows: LeaderboardMomentumRow[];
};

export type LeaderboardStandingsPointRow = {
  participantId: string;
  totalPoints: number;
};

/** SQL RANK()-style ranks for tied totals (1, 1, 3 …). */
export function assignCompetitionRanks(
  rows: ReadonlyArray<LeaderboardStandingsPointRow>,
): Map<string, number> {
  const sorted = [...rows].sort((a, b) => b.totalPoints - a.totalPoints);
  const ranks = new Map<string, number>();

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]!;
    const rank =
      i === 0 || row.totalPoints !== sorted[i - 1]!.totalPoints
        ? i + 1
        : ranks.get(sorted[i - 1]!.participantId)!;
    ranks.set(row.participantId, rank);
  }

  return ranks;
}

/**
 * Compare current leaderboard rows against a previous scoring snapshot.
 * Display-only: does not alter standings or scoring.
 */
export function buildLeaderboardMomentum(input: {
  currentRows: ReadonlyArray<Pick<LeaderboardPublicRow, "participantId" | "totalPoints" | "rank">>;
  previousRows: ReadonlyArray<LeaderboardStandingsPointRow> | null | undefined;
}): LeaderboardMomentumResult {
  if (!input.previousRows || input.previousRows.length === 0) {
    return { hasPreviousSnapshot: false, rows: [] };
  }

  const previousById = new Map(
    input.previousRows.map((row) => [row.participantId, row.totalPoints]),
  );
  const previousRanks = assignCompetitionRanks(input.previousRows);
  const currentPointRows = input.currentRows.map((row) => ({
    participantId: row.participantId,
    totalPoints: row.totalPoints,
  }));
  const currentRanks = assignCompetitionRanks(currentPointRows);

  const rows: LeaderboardMomentumRow[] = input.currentRows.map((current) => {
    const previousPoints = previousById.get(current.participantId);
    const isNewEntry = previousPoints == null;
    const currentRank =
      currentRanks.get(current.participantId) ?? current.rank;

    if (isNewEntry) {
      return {
        participantId: current.participantId,
        previousRank: null,
        currentRank,
        rankChange: 0,
        previousPoints: null,
        currentPoints: current.totalPoints,
        recentPointsGained: 0,
        isNewEntry: true,
      };
    }

    const previousRank = previousRanks.get(current.participantId) ?? currentRank;
    const pointsGained = Math.max(0, current.totalPoints - previousPoints);

    return {
      participantId: current.participantId,
      previousRank,
      currentRank,
      rankChange: previousRank - currentRank,
      previousPoints,
      currentPoints: current.totalPoints,
      recentPointsGained: pointsGained,
      isNewEntry: false,
    };
  });

  return { hasPreviousSnapshot: true, rows };
}

export function mapLeaderboardMomentumByParticipantId(
  momentum: LeaderboardMomentumResult | null | undefined,
): Map<string, LeaderboardMomentumRow> {
  const map = new Map<string, LeaderboardMomentumRow>();
  if (!momentum?.hasPreviousSnapshot) return map;
  for (const row of momentum.rows) {
    map.set(row.participantId, row);
  }
  return map;
}

export function pickBiggestMovers(
  momentum: LeaderboardMomentumResult,
  limit = 3,
): LeaderboardMomentumRow[] {
  if (!momentum.hasPreviousSnapshot) return [];

  return [...momentum.rows]
    .filter((row) => !row.isNewEntry && row.rankChange !== 0)
    .sort((a, b) => {
      const absDiff = Math.abs(b.rankChange) - Math.abs(a.rankChange);
      if (absDiff !== 0) return absDiff;
      if (b.rankChange !== a.rankChange) return b.rankChange - a.rankChange;
      return a.currentRank - b.currentRank;
    })
    .slice(0, limit);
}
