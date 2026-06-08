/**
 * Run: npx tsx lib/scoring/poolScoringConfig.selftest.ts
 */
import assert from "node:assert/strict";
import { computePoolScores } from "../../src/lib/scoring/computePoolScores";
import type { Prediction, Result, ScoringRule } from "../../src/types/domain";
import {
  DEFAULT_WORLD_CUP_GROUP_ADVANCE_EXACT_POINTS,
  DEFAULT_WORLD_CUP_GROUP_ADVANCE_WRONG_SLOT_POINTS,
  DEFAULT_WORLD_CUP_SCORING_RULE_ROWS,
} from "./worldcupPoolDefaults";
import {
  resolvePoolScoringConfig,
  resolveStage2PointsForRulesPage,
  thirdPlaceQualifierPointsFromRules,
} from "./poolScoringConfig";

const poolId = "pool-test-0000-0000-0000-000000000001";
const stageGroup = "stage-group-0001-0000-0000-000000000001";
const stageR32 = "stage-r32-0001-0000-0000-000000000001";
const now = "2026-01-01T00:00:00.000Z";

const scoringRules = DEFAULT_WORLD_CUP_SCORING_RULE_ROWS.map((row, index) => ({
  predictionKind: row.predictionKind,
  bonusKey: row.bonusKey,
  points: row.points,
  id: `rule-${index}`,
  poolId,
  createdAt: now,
  updatedAt: now,
})) satisfies ScoringRule[];

const resolved = resolvePoolScoringConfig({
  poolId,
  groupAdvanceExactPoints: DEFAULT_WORLD_CUP_GROUP_ADVANCE_EXACT_POINTS,
  groupAdvanceWrongSlotPoints: DEFAULT_WORLD_CUP_GROUP_ADVANCE_WRONG_SLOT_POINTS,
  scoringRules,
});

assert.deepEqual(resolved.groupAdvance, {
  exactPoints: 3,
  wrongSlotPoints: 1,
});
assert.equal(resolved.thirdPlaceQualifierPoints, 2);
assert.equal(resolved.knockoutPointsByKind.round_of_16, 4);

const stage2ForRules = resolveStage2PointsForRulesPage({
  rules: scoringRules,
  applyWorldCupDisplayDefaults: false,
});
assert.equal(stage2ForRules, 2);

assert.equal(
  resolveStage2PointsForRulesPage({
    rules: [],
    applyWorldCupDisplayDefaults: true,
  }),
  2,
);

assert.equal(
  resolveStage2PointsForRulesPage({
    rules: [],
    applyWorldCupDisplayDefaults: false,
  }),
  null,
);

assert.equal(
  thirdPlaceQualifierPointsFromRules([
    { predictionKind: "third_place_qualifier", points: 2 },
  ]),
  2,
);

const teamA = "team-a-0001-0000-0000-000000000001";
const teamB = "team-b-0001-0000-0000-000000000001";
const alice = "part-alice-0001-0000-0000-000000000001";

const predictions: Prediction[] = [
  {
    id: "pred-gw",
    poolId,
    participantId: alice,
    predictionKind: "group_winner",
    teamId: teamA,
    tournamentStageId: stageGroup,
    groupCode: "A",
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "pred-tpq",
    poolId,
    participantId: alice,
    predictionKind: "third_place_qualifier",
    teamId: teamB,
    tournamentStageId: stageR32,
    groupCode: "B",
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
];

const results: Result[] = [
  {
    id: "res-gw",
    tournamentStageId: stageGroup,
    kind: "group_winner",
    teamId: teamA,
    groupCode: "A",
    slotKey: null,
    valueText: null,
    resolvedAt: now,
    createdAt: now,
  },
  {
    id: "res-gr",
    tournamentStageId: stageGroup,
    kind: "group_runner_up",
    teamId: teamB,
    groupCode: "A",
    slotKey: null,
    valueText: null,
    resolvedAt: now,
    createdAt: now,
  },
  {
    id: "res-tpq",
    tournamentStageId: stageR32,
    kind: "third_place_qualifier",
    teamId: teamB,
    groupCode: null,
    slotKey: "1",
    valueText: null,
    resolvedAt: now,
    createdAt: now,
  },
];

const outcome = computePoolScores({
  poolId,
  predictions,
  results,
  scoringRules,
  groupStageScoring: {
    groupStageId: stageGroup,
    exactPoints: resolved.groupAdvance!.exactPoints,
    wrongSlotPoints: resolved.groupAdvance!.wrongSlotPoints,
  },
});

const deltas = outcome.ledgerLines.map((line) => line.pointsDelta).sort((a, b) => b - a);
assert.deepEqual(deltas, [3, 2]);

console.log("poolScoringConfig selftest: ok");
