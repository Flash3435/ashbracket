/**
 * Run: npm run test:scoring
 * Small deterministic check for computePoolScores (no DB).
 */
import assert from "node:assert/strict";
import type { Prediction, Result, ScoringRule } from "../../types/domain";
import { computePoolScores } from "./computePoolScores";

const poolId = "pool-1111-1111-1111-111111111111";
const stageFinal = "stage-final-0001-0000-0000-000000000001";
const stageQf = "stage-qf-0001-0000-0000-000000000001";
const teamBr = "team-br-0001-0000-0000-000000000001";
const teamAr = "team-ar-0001-0000-0000-000000000001";
const alice = "part-alice-0001-0000-0000-000000000001";
const bob = "part-bob-0001-0000-0000-000000000001";

const now = "2026-01-01T00:00:00.000Z";

const rules: ScoringRule[] = [
  {
    id: "rule-1",
    poolId,
    predictionKind: "champion",
    points: 25,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "rule-2",
    poolId,
    predictionKind: "quarterfinalist",
    points: 5,
    createdAt: now,
    updatedAt: now,
  },
];

const results: Result[] = [
  {
    id: "res-champ",
    tournamentStageId: stageFinal,
    kind: "champion",
    teamId: teamBr,
    groupCode: null,
    slotKey: null,
    valueText: null,
    resolvedAt: now,
    createdAt: now,
  },
  {
    id: "res-qf1",
    tournamentStageId: stageQf,
    kind: "quarterfinalist",
    teamId: teamBr,
    groupCode: null,
    slotKey: "1",
    valueText: null,
    resolvedAt: now,
    createdAt: now,
  },
];

const predictions: Prediction[] = [
  {
    id: "pred-alice-champ",
    poolId,
    participantId: alice,
    predictionKind: "champion",
    teamId: teamBr,
    tournamentStageId: stageFinal,
    groupCode: null,
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "pred-bob-champ",
    poolId,
    participantId: bob,
    predictionKind: "champion",
    teamId: teamAr,
    tournamentStageId: stageFinal,
    groupCode: null,
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "pred-alice-qf",
    poolId,
    participantId: alice,
    predictionKind: "quarterfinalist",
    teamId: teamBr,
    tournamentStageId: stageQf,
    groupCode: null,
    slotKey: "1",
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
];

const outcome = computePoolScores({
  poolId,
  predictions,
  results,
  scoringRules: rules,
});

assert.deepEqual(outcome.totalsByParticipantId, {
  [alice]: 30,
});
assert.equal(outcome.ledgerLines.length, 2);
assert.equal(
  outcome.ledgerLines.reduce((s, l) => s + l.pointsDelta, 0),
  30,
);

// Second run identical (determinism)
const again = computePoolScores({
  poolId,
  predictions,
  results,
  scoringRules: rules,
});
assert.deepEqual(again.ledgerLines, outcome.ledgerLines);

console.log("scoring selftest: ok");
