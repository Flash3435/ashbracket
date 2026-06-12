import assert from "node:assert/strict";
import { ASHBRACKET_2026_POOL_LOCK_AT_ISO } from "../datetime/poolLockDeadline";
import { formatPoolPickDeadlineLabel } from "../picks/poolPickDeadlineDisplay";
import {
  defaultWc2026PoolLockAtForNewPool,
  isKnownBadWc2026PoolLockAt,
  shouldBackfillWc2026PoolLockAt,
  WC2026_OFFICIAL_POOL_LOCK_AT_ISO,
} from "./wc2026PoolLockDeadline";

assert.equal(WC2026_OFFICIAL_POOL_LOCK_AT_ISO, ASHBRACKET_2026_POOL_LOCK_AT_ISO);

// New live WC 2026 pool gets official default
assert.equal(
  defaultWc2026PoolLockAtForNewPool({
    tournamentEditionCode: "fifa_wc_2026",
    tournamentEditionIsSimulation: false,
    poolIsSimulation: false,
  }),
  WC2026_OFFICIAL_POOL_LOCK_AT_ISO,
);

// Simulation pools stay without a default deadline
assert.equal(
  defaultWc2026PoolLockAtForNewPool({
    tournamentEditionCode: "fifa_wc_2026",
    tournamentEditionIsSimulation: true,
    poolIsSimulation: true,
  }),
  null,
);

// NHL / other editions unchanged
assert.equal(
  defaultWc2026PoolLockAtForNewPool({
    tournamentEditionCode: "nhl_2026",
    tournamentEditionIsSimulation: false,
    poolIsSimulation: false,
  }),
  null,
);

const liveWc = {
  tournamentEditionCode: "fifa_wc_2026" as const,
  tournamentEditionIsSimulation: false,
  poolIsSimulation: false,
};

// Backfill null lock_at
assert.equal(
  shouldBackfillWc2026PoolLockAt({ ...liveWc, lockAtIso: null }),
  true,
);

// Backfill known old public default
assert.ok(isKnownBadWc2026PoolLockAt("2026-06-08T17:59:00.000Z"));
assert.equal(
  shouldBackfillWc2026PoolLockAt({
    ...liveWc,
    lockAtIso: "2026-06-08T17:59:00+00",
  }),
  true,
);

// Backfill suspected private-pool default (Jun 11 1:59 a.m. ET)
assert.ok(isKnownBadWc2026PoolLockAt("2026-06-11T05:59:00.000Z"));
assert.equal(
  shouldBackfillWc2026PoolLockAt({
    ...liveWc,
    lockAtIso: "2026-06-11T05:59:00+00",
  }),
  true,
);

// Backfill previous official default (Jun 10, 2026 11:59 p.m. ET)
assert.ok(isKnownBadWc2026PoolLockAt("2026-06-11T03:59:00.000Z"));
assert.equal(
  shouldBackfillWc2026PoolLockAt({
    ...liveWc,
    lockAtIso: "2026-06-11T03:59:00+00",
  }),
  true,
);

// Already correct — skip
assert.equal(
  shouldBackfillWc2026PoolLockAt({
    ...liveWc,
    lockAtIso: WC2026_OFFICIAL_POOL_LOCK_AT_ISO,
  }),
  false,
);

// Custom organizer deadline preserved
assert.equal(
  shouldBackfillWc2026PoolLockAt({
    ...liveWc,
    lockAtIso: "2026-06-09T12:00:00.000Z",
  }),
  false,
);

// Non–World Cup pools untouched
assert.equal(
  shouldBackfillWc2026PoolLockAt({
    tournamentEditionCode: "nhl_2026",
    tournamentEditionIsSimulation: false,
    poolIsSimulation: false,
    lockAtIso: null,
  }),
  false,
);

// Simulation WC edition untouched even when lock_at is null
assert.equal(
  shouldBackfillWc2026PoolLockAt({
    tournamentEditionCode: "fifa_wc_2026",
    tournamentEditionIsSimulation: true,
    poolIsSimulation: true,
    lockAtIso: null,
  }),
  false,
);

// Participant display uses Eastern Time for the official instant
{
  const label = formatPoolPickDeadlineLabel(WC2026_OFFICIAL_POOL_LOCK_AT_ISO);
  assert.ok(label.includes("Jun 11"), label);
  assert.ok(label.includes("12:00"), label);
  assert.ok(label.endsWith(" ET"), label);
}

console.log("wc2026PoolLockDeadline.selftest.ts: ok");
