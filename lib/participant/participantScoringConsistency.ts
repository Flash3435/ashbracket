import type {
  PublicParticipantDetail,
  PublicParticipantLedgerRow,
  PublicParticipantPick,
} from "../../types/publicParticipant";

export type ParticipantScoringIntegrityIssue =
  | {
      kind: "ledger_pool_mismatch";
      ledgerId: string;
      ledgerPoolId: string;
      participantPoolId: string;
      pointsDelta: number;
    }
  | {
      kind: "prediction_pool_mismatch";
      predictionId: string;
      predictionPoolId: string;
      participantPoolId: string;
    }
  | {
      kind: "header_total_mismatch";
      leaderboardTotal: number;
      ledgerTotal: number;
      participantPoolId: string;
    }
  | {
      kind: "duplicate_display_name";
      displayName: string;
      participantIds: string[];
      poolId: string;
    };

export function sumParticipantLedgerPoints(
  ledger: PublicParticipantLedgerRow[],
): number {
  return ledger.reduce((sum, row) => sum + row.pointsDelta, 0);
}

/** Keep only rows belonging to the participant's canonical pool. */
export function scopeParticipantLedgerToPool(
  ledger: ReadonlyArray<PublicParticipantLedgerRow & { poolId?: string }>,
  poolId: string,
): PublicParticipantLedgerRow[] {
  return ledger.filter((row) => !row.poolId || row.poolId === poolId);
}

/** Keep only picks belonging to the participant's canonical pool. */
export function scopeParticipantPicksToPool(
  picks: ReadonlyArray<PublicParticipantPick & { poolId?: string }>,
  poolId: string,
): PublicParticipantPick[] {
  return picks.filter((pick) => !pick.poolId || pick.poolId === poolId);
}

export function detectLedgerPoolMismatches(input: {
  participantPoolId: string;
  ledger: ReadonlyArray<
    PublicParticipantLedgerRow & { poolId?: string; id?: string }
  >;
}): ParticipantScoringIntegrityIssue[] {
  const issues: ParticipantScoringIntegrityIssue[] = [];
  for (const row of input.ledger) {
    if (!row.poolId || row.poolId === input.participantPoolId) continue;
    issues.push({
      kind: "ledger_pool_mismatch",
      ledgerId: row.id,
      ledgerPoolId: row.poolId,
      participantPoolId: input.participantPoolId,
      pointsDelta: row.pointsDelta,
    });
  }
  return issues;
}

export function detectPredictionPoolMismatches(input: {
  participantPoolId: string;
  picks: ReadonlyArray<PublicParticipantPick & { poolId?: string }>;
}): ParticipantScoringIntegrityIssue[] {
  const issues: ParticipantScoringIntegrityIssue[] = [];
  for (const pick of input.picks) {
    if (!pick.poolId || pick.poolId === input.participantPoolId) continue;
    issues.push({
      kind: "prediction_pool_mismatch",
      predictionId: pick.predictionId,
      predictionPoolId: pick.poolId,
      participantPoolId: input.participantPoolId,
    });
  }
  return issues;
}

export function detectDuplicateDisplayNamesInPool(
  rows: ReadonlyArray<{
    participantId: string;
    displayName: string;
    poolId: string;
  }>,
): ParticipantScoringIntegrityIssue[] {
  const byKey = new Map<string, string[]>();
  for (const row of rows) {
    const key = `${row.poolId}::${row.displayName.trim().toLowerCase()}`;
    const list = byKey.get(key) ?? [];
    list.push(row.participantId);
    byKey.set(key, list);
  }

  const issues: ParticipantScoringIntegrityIssue[] = [];
  for (const [, participantIds] of byKey) {
    if (participantIds.length < 2) continue;
    const sample = rows.find((row) => row.participantId === participantIds[0]);
    if (!sample) continue;
    issues.push({
      kind: "duplicate_display_name",
      displayName: sample.displayName,
      participantIds: [...participantIds],
      poolId: sample.poolId,
    });
  }
  return issues;
}

/**
 * Participant profile totals must agree with pool-scoped ledger rows.
 */
export function reconcileParticipantProfileTotals(
  detail: PublicParticipantDetail,
): {
  detail: PublicParticipantDetail;
  issues: ParticipantScoringIntegrityIssue[];
} {
  const ledgerTotal = sumParticipantLedgerPoints(detail.ledger);
  const issues: ParticipantScoringIntegrityIssue[] = [];

  if (detail.totalPoints !== ledgerTotal) {
    issues.push({
      kind: "header_total_mismatch",
      leaderboardTotal: detail.totalPoints,
      ledgerTotal,
      participantPoolId: detail.poolId,
    });
  }

  return {
    detail,
    issues,
  };
}

/**
 * Regression guard: scored awards for a pool-scoped participant must match header total.
 */
export function assertParticipantScoringTotalsConsistent(input: {
  leaderboardTotal: number;
  profileHeaderTotal: number;
  ledgerTotal: number;
  stageTotals: number[];
}): void {
  const stageSum = input.stageTotals.reduce((sum, value) => sum + value, 0);

  if (input.ledgerTotal > 0 && input.leaderboardTotal === 0) {
    throw new Error(
      `leaderboard total is 0 but pool-scoped ledger sums to ${input.ledgerTotal}`,
    );
  }

  if (input.profileHeaderTotal !== input.leaderboardTotal) {
    throw new Error(
      `profile header total (${input.profileHeaderTotal}) != leaderboard total (${input.leaderboardTotal})`,
    );
  }

  if (input.ledgerTotal !== input.profileHeaderTotal) {
    throw new Error(
      `ledger total (${input.ledgerTotal}) != profile header total (${input.profileHeaderTotal})`,
    );
  }

  if (stageSum !== input.ledgerTotal) {
    throw new Error(
      `stage summary total (${stageSum}) != ledger total (${input.ledgerTotal})`,
    );
  }
}
