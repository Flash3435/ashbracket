/**
 * Run: npx tsx lib/participant/publicParticipantPresentation.selftest.ts
 */
import assert from "node:assert/strict";
import {
  buildPublicParticipantPresentation,
  pickStatusPresentation,
  settledGroupCodesFromOfficialRows,
  type PickDisplayState,
} from "./publicParticipantPresentation";
import type {
  PublicParticipantDetail,
  PublicParticipantPick,
} from "../../types/publicParticipant";
import {
  assertParticipantScoringTotalsConsistent,
  sumParticipantLedgerPoints,
} from "./participantScoringConsistency";

function statusLabel(state: PickDisplayState): string {
  return pickStatusPresentation(state).label;
}

function pick(partial: Partial<PublicParticipantPick> & Pick<PublicParticipantPick, "predictionId" | "predictionKind">): PublicParticipantPick {
  return {
    groupCode: null,
    slotKey: null,
    bonusKey: null,
    stageCode: "group",
    stageLabel: "Group",
    stageSortOrder: 10,
    teamName: null,
    teamCountryCode: null,
    ...partial,
  };
}

assert.equal(statusLabel("scored"), "Scored");
assert.equal(statusLabel("awaiting"), "Awaiting score");
assert.equal(statusLabel("missed"), "Missed");
assert.equal(statusLabel("empty"), "No pick");
assert.match(
  pickStatusPresentation("missed", { predictionKind: "third_place_qualifier" })
    .meaning,
  /third-place/i,
);
assert.match(
  pickStatusPresentation("missed", { predictionKind: "group_runner_up" }).meaning,
  /group results/i,
);

assert.deepEqual(
  settledGroupCodesFromOfficialRows([
    { kind: "group_winner", group_code: "a" },
    { kind: "group_runner_up", group_code: "A" },
    { kind: "group_winner", group_code: "B" },
    // B runner-up missing → B unsettled
    { kind: "group_winner", group_code: "C" },
    { kind: "group_runner_up", groupCode: "C" },
  ]),
  ["A", "C"],
);

const detail: PublicParticipantDetail = {
  displayName: "Test",
  poolName: "Pool",
  poolId: "pool-1",
  participantId: "part-1",
  totalPoints: 3,
  rank: 1,
  picks: [
    pick({
      predictionId: "p1",
      predictionKind: "group_winner",
      groupCode: "A",
      teamName: "Team A",
      teamCountryCode: "USA",
    }),
    pick({
      predictionId: "p2",
      predictionKind: "group_winner",
      groupCode: "B",
      teamName: "Team B",
      teamCountryCode: "CAN",
    }),
    pick({
      predictionId: "p3",
      predictionKind: "group_winner",
      groupCode: "C",
    }),
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
  ],
};

const { summary, sections, ledgerItems } = buildPublicParticipantPresentation(detail);

assert.equal(summary.scoredPicksCount, 1);
assert.equal(summary.missedPicksCount, 0);
assert.equal(summary.awaitingScoreCount, 1);
assert.equal(summary.emptyPicksCount, 1);
assert.equal(summary.pointAwardsCount, 1);

const group = sections.find((s) => s.key === "group_stage");
assert.ok(group);
assert.equal(group!.scoredPicksCount, 1);
assert.equal(group!.awaitingScoreCount, 1);
assert.equal(group!.emptyPicksCount, 1);

assert.equal(ledgerItems[0]?.dateLabel.length > 0, true);
assert.equal(ledgerItems[0]?.stageLabel, "Group stage");

assertParticipantScoringTotalsConsistent({
  leaderboardTotal: detail.totalPoints,
  profileHeaderTotal: detail.totalPoints,
  ledgerTotal: sumParticipantLedgerPoints(detail.ledger),
  stageTotals: sections.map((section) => section.totalPoints),
});

console.log("publicParticipantPresentation selftest: ok");

const settledThirdDetail: PublicParticipantDetail = {
  ...detail,
  thirdPlaceQualifiersSettled: true,
  picks: [
    ...detail.picks,
    pick({
      predictionId: "p-tpq-hit",
      predictionKind: "third_place_qualifier",
      groupCode: "A",
      stageCode: "round_of_32",
      stageLabel: "Round of 32",
      stageSortOrder: 20,
      teamName: "Team TPQ Hit",
      teamCountryCode: "USA",
    }),
    pick({
      predictionId: "p-tpq-miss",
      predictionKind: "third_place_qualifier",
      groupCode: "B",
      stageCode: "round_of_32",
      stageLabel: "Round of 32",
      stageSortOrder: 20,
      teamName: "Team TPQ Miss",
      teamCountryCode: "CAN",
    }),
  ],
  ledger: [
    ...detail.ledger,
    {
      id: "l-tpq",
      pointsDelta: 4,
      predictionKind: "third_place_qualifier",
      createdAt: "2026-06-30T12:00:00.000Z",
      predictionId: "p-tpq-hit",
      resultId: "r-tpq",
    },
  ],
};

const thirdPresentation = buildPublicParticipantPresentation(settledThirdDetail);
const thirdSection = thirdPresentation.sections.find(
  (s) => s.key === "third_place_advancers",
);
assert.ok(thirdSection);
assert.equal(thirdSection!.scoredPicksCount, 1);
assert.equal(thirdSection!.missedPicksCount, 1);
assert.equal(thirdSection!.awaitingScoreCount, 0);
assert.match(
  thirdSection!.picks.find((p) => p.predictionId === "p-tpq-miss")!.status.meaning,
  /third-place/i,
);

console.log("publicParticipantPresentation third-place settled selftest: ok");

// --- Per-group settlement: settled misses vs unsettled awaiting ---
const groupSettlementDetail: PublicParticipantDetail = {
  displayName: "Group settle",
  poolName: "Pool",
  poolId: "pool-1",
  participantId: "part-g",
  totalPoints: 3,
  rank: 1,
  settledGroupCodes: ["C", "G"],
  picks: [
    pick({
      predictionId: "gw-c-scored",
      predictionKind: "group_winner",
      groupCode: "C",
      teamName: "Brazil",
      teamCountryCode: "BRA",
    }),
    pick({
      predictionId: "gr-c-miss",
      predictionKind: "group_runner_up",
      groupCode: "C",
      teamName: "Scotland",
      teamCountryCode: "SCO",
    }),
    pick({
      predictionId: "gr-g-miss",
      predictionKind: "group_runner_up",
      groupCode: "G",
      teamName: "New Zealand",
      teamCountryCode: "NZL",
    }),
    pick({
      predictionId: "gr-h-await",
      predictionKind: "group_runner_up",
      groupCode: "H",
      teamName: "Uruguay",
      teamCountryCode: "URU",
    }),
    pick({
      predictionId: "gw-c-empty",
      predictionKind: "group_winner",
      groupCode: "G",
      teamName: null,
      teamCountryCode: null,
    }),
  ],
  ledger: [
    {
      id: "l-gw-c",
      pointsDelta: 3,
      predictionKind: "group_winner",
      createdAt: "2026-06-20T12:00:00.000Z",
      predictionId: "gw-c-scored",
      resultId: "r-c-w",
    },
  ],
};

const settledGroupPresentation =
  buildPublicParticipantPresentation(groupSettlementDetail);
const settledGroupSection = settledGroupPresentation.sections.find(
  (s) => s.key === "group_stage",
)!;
assert.ok(settledGroupSection);

const byId = new Map(
  settledGroupSection.picks.map((p) => [p.predictionId, p]),
);

assert.equal(byId.get("gw-c-scored")!.state, "scored");
assert.equal(byId.get("gr-c-miss")!.state, "missed");
assert.equal(byId.get("gr-g-miss")!.state, "missed");
assert.equal(byId.get("gr-h-await")!.state, "awaiting");
assert.equal(byId.get("gw-c-empty")!.state, "empty");

assert.equal(settledGroupPresentation.summary.scoredPicksCount, 1);
assert.equal(settledGroupPresentation.summary.missedPicksCount, 2);
assert.equal(settledGroupPresentation.summary.awaitingScoreCount, 1);
assert.equal(settledGroupPresentation.summary.emptyPicksCount, 1);
assert.equal(settledGroupSection.missedPicksCount, 2);
assert.equal(settledGroupSection.awaitingScoreCount, 1);
assert.equal(byId.get("gr-c-miss")!.status.label, "Missed");
assert.match(byId.get("gr-c-miss")!.status.meaning, /group results/i);

console.log("publicParticipantPresentation per-group settlement selftest: ok");

// pickIsOut still wins over settlement/ledger absence
const outDetail: PublicParticipantDetail = {
  displayName: "Out",
  poolName: "Pool",
  poolId: "pool-1",
  participantId: "part-out",
  totalPoints: 0,
  rank: 2,
  settledGroupCodes: ["A"],
  picks: [
    pick({
      predictionId: "pred-out",
      predictionKind: "round_of_16",
      slotKey: "2",
      stageCode: "round_of_16",
      stageLabel: "Round of 16",
      stageSortOrder: 40,
      teamName: "Germany",
      teamCountryCode: "GER",
      pickIsOut: true,
    }),
  ],
  ledger: [],
};
const outPresentation = buildPublicParticipantPresentation(outDetail);
assert.equal(outPresentation.sections.flatMap((s) => s.picks)[0]!.state, "out");
assert.equal(outPresentation.summary.awaitingScoreCount, 0);
assert.equal(outPresentation.summary.missedPicksCount, 0);

console.log("publicParticipantPresentation pickIsOut selftest: ok");
