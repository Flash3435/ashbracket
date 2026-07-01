/**
 * Run: npx tsx lib/leaderboard/fetchPoolLedgerLinesForStandings.selftest.ts
 */
import assert from "node:assert/strict";
import { buildPoolStandingsFromLedger } from "./buildPoolStandingsFromLedger";
import { SUPABASE_MAX_ROWS_PER_REQUEST } from "@/lib/supabase/fetchAllRows";

const poolId = "pool-1";
const vinayId = "vinay-id";
const otherId = "other-id";

const participants = [
  { id: vinayId, display_name: "Vinay Menon" },
  { id: otherId, display_name: "Other" },
];

function ledgerLine(participantId: string, points: number, index: number) {
  return {
    participant_id: participantId,
    points_delta: points,
    _index: index,
  };
}

// Simulate PostgREST returning only the first page of a large pool ledger.
const fullLedger = [
  ...Array.from({ length: SUPABASE_MAX_ROWS_PER_REQUEST }, (_, index) =>
    ledgerLine(otherId, 1, index),
  ),
  ledgerLine(vinayId, 3, SUPABASE_MAX_ROWS_PER_REQUEST),
  ledgerLine(vinayId, 72, SUPABASE_MAX_ROWS_PER_REQUEST + 1),
];

const truncatedLedger = fullLedger.slice(0, SUPABASE_MAX_ROWS_PER_REQUEST);

const truncatedStandings = buildPoolStandingsFromLedger({
  poolId,
  poolName: "FAMPOOL",
  participants,
  ledgerLines: truncatedLedger,
});

const fullStandings = buildPoolStandingsFromLedger({
  poolId,
  poolName: "FAMPOOL",
  participants,
  ledgerLines: fullLedger,
});

const vinayTruncated = truncatedStandings.find(
  (row) => row.participantId === vinayId,
);
const vinayFull = fullStandings.find((row) => row.participantId === vinayId);

assert.equal(vinayTruncated?.totalPoints ?? 0, 0, "truncated ledger hides Vinay points");
assert.equal(vinayFull?.totalPoints, 75, "full ledger restores Vinay total");
assert.equal(
  fullLedger.length > SUPABASE_MAX_ROWS_PER_REQUEST,
  true,
  "fixture exceeds single-page cap",
);

console.log("fetchPoolLedgerLinesForStandings selftest: ok");
