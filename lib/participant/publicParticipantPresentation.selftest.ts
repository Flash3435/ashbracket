/**
 * Run: npx tsx lib/participant/publicParticipantPresentation.selftest.ts
 */
import assert from "node:assert/strict";
import {
  buildPublicParticipantPresentation,
  pickStatusPresentation,
  type PickDisplayState,
} from "./publicParticipantPresentation";
import type { PublicParticipantDetail } from "../../types/publicParticipant";

function statusLabel(state: PickDisplayState): string {
  return pickStatusPresentation(state).label;
}

assert.equal(statusLabel("scored"), "Scored");
assert.equal(statusLabel("awaiting"), "Awaiting score");
assert.equal(statusLabel("empty"), "No pick");

const detail: PublicParticipantDetail = {
  displayName: "Test",
  poolName: "Pool",
  poolId: "pool-1",
  participantId: "part-1",
  totalPoints: 5,
  rank: 1,
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
    {
      predictionId: "p2",
      predictionKind: "group_winner",
      groupCode: "B",
      slotKey: null,
      bonusKey: null,
      stageCode: "group",
      stageLabel: "Group",
      stageSortOrder: 10,
      teamName: "Team B",
      teamCountryCode: "CAN",
    },
    {
      predictionId: "p3",
      predictionKind: "group_winner",
      groupCode: "C",
      slotKey: null,
      bonusKey: null,
      stageCode: "group",
      stageLabel: "Group",
      stageSortOrder: 10,
      teamName: null,
      teamCountryCode: null,
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
  ],
};

const { summary, sections, ledgerItems } = buildPublicParticipantPresentation(detail);

assert.equal(summary.scoredPicksCount, 1);
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

console.log("publicParticipantPresentation selftest: ok");
