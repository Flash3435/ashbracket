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
const stageGroup = "stage-group-0001-0000-0000-000000000001";
const teamBr = "team-br-0001-0000-0000-000000000001";
const teamAr = "team-ar-0001-0000-0000-000000000001";
const teamMx = "team-mx-0001-0000-0000-000000000001";
const alice = "part-alice-0001-0000-0000-000000000001";
const bob = "part-bob-0001-0000-0000-000000000001";

const now = "2026-01-01T00:00:00.000Z";

const rules: ScoringRule[] = [
  {
    id: "rule-1",
    poolId,
    predictionKind: "champion",
    bonusKey: null,
    points: 25.5,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "rule-2",
    poolId,
    predictionKind: "quarterfinalist",
    bonusKey: null,
    points: 5,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "rule-3",
    poolId,
    predictionKind: "bonus_pick",
    bonusKey: "most_goals",
    points: 50,
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
  {
    id: "res-goals",
    tournamentStageId: stageGroup,
    kind: "bonus_pick",
    teamId: teamMx,
    groupCode: null,
    slotKey: "most_goals",
    valueText: null,
    resolvedAt: now,
    createdAt: now,
  },
  {
    id: "res-gw-a",
    tournamentStageId: stageGroup,
    kind: "group_winner",
    teamId: teamAr,
    groupCode: "A",
    slotKey: null,
    valueText: null,
    resolvedAt: now,
    createdAt: now,
  },
  {
    id: "res-gr-a",
    tournamentStageId: stageGroup,
    kind: "group_runner_up",
    teamId: teamBr,
    groupCode: "A",
    slotKey: null,
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
  {
    id: "pred-alice-goals",
    poolId,
    participantId: alice,
    predictionKind: "bonus_pick",
    teamId: teamMx,
    tournamentStageId: stageGroup,
    groupCode: null,
    slotKey: null,
    bonusKey: "most_goals",
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "pred-alice-gw-wrong",
    poolId,
    participantId: alice,
    predictionKind: "group_winner",
    teamId: teamBr,
    tournamentStageId: stageGroup,
    groupCode: "A",
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "pred-bob-gr-exact",
    poolId,
    participantId: bob,
    predictionKind: "group_runner_up",
    teamId: teamBr,
    tournamentStageId: stageGroup,
    groupCode: "A",
    slotKey: null,
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
  groupStageScoring: {
    groupStageId: stageGroup,
    exactPoints: 5,
    wrongSlotPoints: 2.5,
  },
});

assert.deepEqual(outcome.totalsByParticipantId, {
  [alice]: 25.5 + 5 + 50 + 2.5,
  [bob]: 5,
});
assert.equal(outcome.ledgerLines.length, 5);

const again = computePoolScores({
  poolId,
  predictions,
  results,
  scoringRules: rules,
  groupStageScoring: {
    groupStageId: stageGroup,
    exactPoints: 5,
    wrongSlotPoints: 2.5,
  },
});
assert.deepEqual(again.ledgerLines, outcome.ledgerLines);

console.log("scoring selftest: ok");

// Third-place qualifiers: set-based match (official slot order does not matter)
const stageR32 = "stage-r32-0001-0000-0000-000000000001";
const teamThirdA = "team-third-a-0001-0000-0000-000000000001";
const teamThirdB = "team-third-b-0001-0000-0000-000000000001";

const thirdRules: ScoringRule[] = [
  {
    id: "rule-tpq",
    poolId,
    predictionKind: "third_place_qualifier",
    bonusKey: null,
    points: 3,
    createdAt: now,
    updatedAt: now,
  },
];

const thirdResults: Result[] = [
  {
    id: "res-tpq-slot3",
    tournamentStageId: stageR32,
    kind: "third_place_qualifier",
    teamId: teamThirdA,
    groupCode: null,
    slotKey: "3",
    valueText: null,
    resolvedAt: now,
    createdAt: now,
  },
  {
    id: "res-tpq-slot1",
    tournamentStageId: stageR32,
    kind: "third_place_qualifier",
    teamId: teamThirdB,
    groupCode: null,
    slotKey: "1",
    valueText: null,
    resolvedAt: now,
    createdAt: now,
  },
];

const thirdPreds: Prediction[] = [
  {
    id: "pred-tpq-user-slot7",
    poolId,
    participantId: alice,
    predictionKind: "third_place_qualifier",
    teamId: teamThirdA,
    tournamentStageId: stageR32,
    groupCode: null,
    slotKey: "7",
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
];

const thirdOutcome = computePoolScores({
  poolId,
  predictions: thirdPreds,
  results: thirdResults,
  scoringRules: thirdRules,
});

assert.equal(thirdOutcome.totalsByParticipantId[alice], 3);
assert.equal(thirdOutcome.ledgerLines.length, 1);
assert.equal(thirdOutcome.ledgerLines[0]?.resultId, "res-tpq-slot3");

console.log("scoring selftest third-place set match: ok");
