import { ASHBRACKET_2026_POOL_LOCK_AT_ISO } from "../datetime/poolLockDeadline";

/** Canonical World Cup 2026 live-pool pick lock instant (June 10, 2026 11:59 p.m. ET). */
export const WC2026_OFFICIAL_POOL_LOCK_AT_ISO = ASHBRACKET_2026_POOL_LOCK_AT_ISO;

/** SQL timestamptz literal used in migrations. */
export const WC2026_OFFICIAL_POOL_LOCK_AT_SQL = "2026-06-11 03:59:00+00";

/** Known incorrect defaults to replace during backfill only. */
export const KNOWN_BAD_WC2026_POOL_LOCK_AT_ISO_VALUES = [
  /** Old public AshBracket 2026 default. */
  "2026-06-08T17:59:00.000Z",
  "2026-06-08T17:59:00Z",
  "2026-06-08T17:59:00+00:00",
  /** Suspected private-pool default (Jun 11, 2026 1:59 a.m. ET). */
  "2026-06-11T05:59:00.000Z",
  "2026-06-11T05:59:00Z",
  "2026-06-11T05:59:00+00:00",
] as const;

export const FIFA_WC_2026_EDITION_CODE = "fifa_wc_2026";

function normalizeLockAtIso(lockAtIso: string | null | undefined): string | null {
  if (lockAtIso == null || lockAtIso.trim() === "") return null;
  const ms = new Date(lockAtIso).getTime();
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

export function isKnownBadWc2026PoolLockAt(
  lockAtIso: string | null | undefined,
): boolean {
  const normalized = normalizeLockAtIso(lockAtIso);
  if (!normalized) return false;
  return KNOWN_BAD_WC2026_POOL_LOCK_AT_ISO_VALUES.some(
    (bad) => normalizeLockAtIso(bad) === normalized,
  );
}

export type Wc2026PoolLockBackfillCandidate = {
  tournamentEditionCode: string | null;
  tournamentEditionIsSimulation: boolean;
  poolIsSimulation: boolean;
  lockAtIso: string | null | undefined;
};

/**
 * Whether a live World Cup 2026 pool should receive the official default lock_at
 * during backfill. Preserves intentional custom deadlines.
 */
export function shouldBackfillWc2026PoolLockAt(
  pool: Wc2026PoolLockBackfillCandidate,
): boolean {
  if (pool.tournamentEditionCode !== FIFA_WC_2026_EDITION_CODE) return false;
  if (pool.tournamentEditionIsSimulation) return false;
  if (pool.poolIsSimulation) return false;

  const lockAt = normalizeLockAtIso(pool.lockAtIso);
  if (!lockAt) return true;
  if (lockAt === WC2026_OFFICIAL_POOL_LOCK_AT_ISO) return false;
  return isKnownBadWc2026PoolLockAt(lockAt);
}

export type NewWc2026PoolLockDefaultInput = {
  tournamentEditionCode: string | null;
  tournamentEditionIsSimulation: boolean;
  poolIsSimulation: boolean;
};

/** Default lock_at for newly created live World Cup 2026 pools. */
export function defaultWc2026PoolLockAtForNewPool(
  input: NewWc2026PoolLockDefaultInput,
): string | null {
  if (input.poolIsSimulation || input.tournamentEditionIsSimulation) return null;
  if (input.tournamentEditionCode !== FIFA_WC_2026_EDITION_CODE) return null;
  return WC2026_OFFICIAL_POOL_LOCK_AT_ISO;
}
