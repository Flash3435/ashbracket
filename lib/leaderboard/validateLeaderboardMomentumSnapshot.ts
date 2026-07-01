import {
  assignCompetitionRanks,
  type LeaderboardStandingsPointRow,
} from "./buildLeaderboardMomentum";
import type { LeaderboardPublicRow } from "../../types/leaderboard";

/** Standings snapshots captured with paginated pool ledger reads (post-1000-row cap fix). */
export const STANDINGS_CAPTURE_VERSION = 2;

export const STANDINGS_CAPTURE_VERSION_KEY = "standings_capture_version";

export type LeaderboardMomentumSnapshotValidation = {
  valid: boolean;
  reason?: string;
};

function readNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function parsePreviousStandingsFromMetadata(
  metadata: Record<string, unknown>,
): LeaderboardStandingsPointRow[] | null {
  const raw = metadata.previous_standings;
  if (!Array.isArray(raw)) return null;

  const rows: LeaderboardStandingsPointRow[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const participantId = readString(
      (item as { participant_id?: unknown }).participant_id,
    );
    const totalPoints = readNumber((item as { total_points?: unknown }).total_points);
    if (!participantId || totalPoints == null) continue;
    rows.push({ participantId, totalPoints });
  }

  return rows.length > 0 ? rows : null;
}

/**
 * Rejects movement baselines captured while pool-wide ledger reads were truncated
 * (PostgREST 1,000-row cap) or otherwise unreliable.
 */
export function validateLeaderboardMomentumSnapshot(input: {
  metadata: Record<string, unknown>;
  currentRows: ReadonlyArray<Pick<LeaderboardPublicRow, "participantId" | "totalPoints" | "rank">>;
}): LeaderboardMomentumSnapshotValidation {
  const captureVersion = readNumber(input.metadata[STANDINGS_CAPTURE_VERSION_KEY]);
  if (captureVersion != null && captureVersion >= STANDINGS_CAPTURE_VERSION) {
    return { valid: true };
  }

  const previousRows = parsePreviousStandingsFromMetadata(input.metadata);
  if (!previousRows) {
    return { valid: false, reason: "missing_previous_standings" };
  }

  const currentIds = new Set(input.currentRows.map((row) => row.participantId));
  if (previousRows.length < currentIds.size) {
    return { valid: false, reason: "previous_missing_participants" };
  }

  const previousRanks = assignCompetitionRanks(previousRows);
  let suspiciousZeroToScoredMovers = 0;

  for (const current of input.currentRows) {
    const previous = previousRows.find(
      (row) => row.participantId === current.participantId,
    );
    if (!previous) continue;

    if (previous.totalPoints !== 0 || current.totalPoints <= 0) continue;

    const previousRank = previousRanks.get(current.participantId) ?? current.rank;
    const rankChange = previousRank - current.rank;
    const pointsGained = current.totalPoints - previous.totalPoints;

    // Truncated snapshots often show 0 pts / bottom rank while ledger-backed
    // totals are already much higher — large upward jumps with full point totals.
    if (pointsGained >= current.totalPoints * 0.9 && rankChange >= 10) {
      suspiciousZeroToScoredMovers += 1;
    }
  }

  if (suspiciousZeroToScoredMovers > 0) {
    return {
      valid: false,
      reason: "truncated_or_invalid_baseline",
    };
  }

  const previousSum = previousRows.reduce((sum, row) => sum + row.totalPoints, 0);
  const currentSum = input.currentRows.reduce(
    (sum, row) => sum + row.totalPoints,
    0,
  );
  if (currentSum > 0 && previousSum < currentSum * 0.85) {
    const missingFromPrevious = [...currentIds].filter(
      (id) => !previousRows.some((row) => row.participantId === id),
    );
    if (missingFromPrevious.length > 0) {
      return { valid: false, reason: "previous_missing_participants" };
    }
  }

  return { valid: true };
}
