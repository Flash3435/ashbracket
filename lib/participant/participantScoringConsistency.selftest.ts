/**
 * Run: npx tsx lib/participant/participantScoringConsistency.selftest.ts
 */
import assert from "node:assert/strict";
import { buildPublicParticipantPresentation } from "./publicParticipantPresentation";
import {
  assertParticipantScoringTotalsConsistent,
  detectDuplicateDisplayNamesInPool,
  detectLedgerPoolMismatches,
  reconcileParticipantProfileTotals,
  scopeParticipantLedgerToPool,
  sumParticipantLedgerPoints,
} from "./participantScoringConsistency";
import type { PublicParticipantDetail } from "../../types/publicParticipant";

const poolA = "11111111-1111-4111-8111-111111111111";
const poolB = "22222222-2222-4222-8222-222222222222";
const participantId = "33333333-3333-4333-8333-333333333333";

const consistentDetail: PublicParticipantDetail = {
  displayName: "Vinay Menon",
  poolName: "FAMPOOL 2026",
  poolId: poolA,
  participantId,
  totalPoints: 59,
  rank: 12,
  picks: [
    {
      predictionId: "p1",
      predictionKind: "group_winner",
      groupCode: "A",
      slotKey: null,
      bonusKey: null,
      stageCode: "group",
      stageLabel: "Group",
      stageSortOrder: 10,
      teamName: "Team A",
      teamCountryCode: "USA",
    },
  ],
  ledger: [
    {
      id: "l1",
      pointsDelta: 3,
      predictionKind: "group_winner",
      createdAt: "2026-06-12T12:00:00.000Z",
      predictionId: "p1",
      resultId: "r1",
    },
    {
      id: "l2",
      pointsDelta: 56,
      predictionKind: "group_winner",
      createdAt: "2026-06-12T12:01:00.000Z",
      predictionId: "p1",
      resultId: "r2",
    },
  ],
};

const presentation = buildPublicParticipantPresentation(consistentDetail);
assertParticipantScoringTotalsConsistent({
  leaderboardTotal: consistentDetail.totalPoints,
  profileHeaderTotal: consistentDetail.totalPoints,
  ledgerTotal: sumParticipantLedgerPoints(consistentDetail.ledger),
  stageTotals: presentation.sections.map((section) => section.totalPoints),
});

const crossPoolLedger = [
  {
    id: "orphan",
    poolId: poolB,
    pointsDelta: 59,
    predictionKind: "group_winner",
    createdAt: "2026-06-12T12:00:00.000Z",
    predictionId: "p1",
    resultId: "r1",
  },
];

assert.deepEqual(
  scopeParticipantLedgerToPool(crossPoolLedger, poolA),
  [],
  "orphan ledger rows from another pool must be excluded from profile totals",
);

assert.equal(
  detectLedgerPoolMismatches({
    participantPoolId: poolA,
    ledger: crossPoolLedger,
  }).length,
  1,
);

const mismatchedDetail: PublicParticipantDetail = {
  ...consistentDetail,
  totalPoints: 0,
  rank: 41,
  ledger: crossPoolLedger.map((row) => ({
    id: row.id,
    pointsDelta: row.pointsDelta,
    predictionKind: row.predictionKind,
    createdAt: row.createdAt,
    predictionId: row.predictionId,
    resultId: row.resultId,
  })),
};

const mismatchedPresentation = buildPublicParticipantPresentation(mismatchedDetail);
assert.throws(
  () =>
    assertParticipantScoringTotalsConsistent({
      leaderboardTotal: 0,
      profileHeaderTotal: 0,
      ledgerTotal: sumParticipantLedgerPoints(mismatchedDetail.ledger),
      stageTotals: mismatchedPresentation.sections.map(
        (section) => section.totalPoints,
      ),
    }),
  /leaderboard total is 0 but pool-scoped ledger sums to 59/,
  "regression guard catches leaderboard/profile vs ledger divergence",
);

const reconciled = reconcileParticipantProfileTotals({
  ...mismatchedDetail,
  ledger: [],
});
assert.equal(reconciled.detail.totalPoints, 0);
assert.equal(reconciled.issues.length, 0);

const duplicateIssues = detectDuplicateDisplayNamesInPool([
  {
    participantId: "a",
    displayName: "Vinay Menon",
    poolId: poolA,
  },
  {
    participantId: "b",
    displayName: "vinay menon",
    poolId: poolA,
  },
]);
assert.equal(duplicateIssues.length, 1);
assert.equal(duplicateIssues[0]?.kind, "duplicate_display_name");

console.log("participantScoringConsistency selftest: ok");
