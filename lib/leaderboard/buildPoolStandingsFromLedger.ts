import type { LeaderboardPublicRow } from "../../types/leaderboard";

export type PoolStandingsLedgerLine = {
  participant_id: string;
  points_delta: number | string | null;
};

export type PoolStandingsParticipantRow = {
  id: string;
  display_name: string | null;
};

/**
 * Builds ranked standings from official points_ledger totals (awarded points only).
 * Matches SQL RANK() behavior for tied totals.
 */
export function buildPoolStandingsFromLedger(input: {
  poolId: string;
  poolName: string;
  participants: PoolStandingsParticipantRow[];
  ledgerLines: PoolStandingsLedgerLine[];
}): LeaderboardPublicRow[] {
  const totals = new Map<string, number>();
  for (const p of input.participants) {
    totals.set(p.id, 0);
  }
  for (const line of input.ledgerLines) {
    const pid = line.participant_id;
    const delta = Number(line.points_delta ?? 0);
    totals.set(pid, (totals.get(pid) ?? 0) + delta);
  }

  const sorted = input.participants
    .map((p) => ({
      participantId: p.id,
      displayName: (p.display_name ?? "").trim() || "Participant",
      totalPoints: totals.get(p.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.totalPoints - a.totalPoints ||
        a.displayName.localeCompare(b.displayName, undefined, {
          sensitivity: "base",
        }),
    );

  const rows: LeaderboardPublicRow[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const rank =
      i === 0 || sorted[i]!.totalPoints !== sorted[i - 1]!.totalPoints
        ? i + 1
        : rows[i - 1]!.rank;
    rows.push({
      poolId: input.poolId,
      poolName: input.poolName,
      participantId: sorted[i]!.participantId,
      displayName: sorted[i]!.displayName,
      totalPoints: sorted[i]!.totalPoints,
      rank,
    });
  }
  return rows;
}

import { LEADERBOARD_ACTIVE_SUBTITLE } from "./leaderboardPageCopy";

export const LEADERBOARD_AWARDED_POINTS_NOTE = LEADERBOARD_ACTIVE_SUBTITLE;
