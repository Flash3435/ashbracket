/** Admin-facing pot breakdown for a paid pool. */
export type PoolPotSummary = {
  paidCount: number;
  unpaidCount: number;
  totalActiveCount: number;
  currentPot: number | null;
  potentialPot: number | null;
  unpaidAmount: number | null;
};

/**
 * Active participants = all rows in the pool (organizer list).
 * Pot amounts are null when no entry fee is configured.
 */
export function computePoolPotSummary(
  participants: readonly { paid: boolean }[],
  entryFeeAmount: number | null,
): PoolPotSummary {
  const totalActiveCount = participants.length;
  const paidCount = participants.filter((p) => p.paid).length;
  const unpaidCount = totalActiveCount - paidCount;

  if (entryFeeAmount == null) {
    return {
      paidCount,
      unpaidCount,
      totalActiveCount,
      currentPot: null,
      potentialPot: null,
      unpaidAmount: null,
    };
  }

  return {
    paidCount,
    unpaidCount,
    totalActiveCount,
    currentPot: paidCount * entryFeeAmount,
    potentialPot: totalActiveCount * entryFeeAmount,
    unpaidAmount: unpaidCount * entryFeeAmount,
  };
}

/** Participant-visible pot (aggregates only). */
export type PoolPotParticipantSummary = {
  showPot: boolean;
  currentPot: number | null;
  potentialPot: number | null;
  entryFeeAmount: number | null;
  currencyCode: string;
};

export function parsePoolPotParticipantRpc(
  data: unknown,
): PoolPotParticipantSummary | null {
  if (data == null || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (row.show_pot !== true) {
    return {
      showPot: false,
      currentPot: null,
      potentialPot: null,
      entryFeeAmount: null,
      currencyCode: "CAD",
    };
  }
  const parseNum = (v: unknown): number | null => {
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    showPot: true,
    currentPot: parseNum(row.current_pot),
    potentialPot: parseNum(row.potential_pot),
    entryFeeAmount: parseNum(row.entry_fee_amount),
    currencyCode:
      typeof row.currency_code === "string" && row.currency_code.trim()
        ? row.currency_code.trim().toUpperCase()
        : "CAD",
  };
}
