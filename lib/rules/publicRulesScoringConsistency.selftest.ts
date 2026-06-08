/**
 * Run: npx tsx lib/rules/publicRulesScoringConsistency.selftest.ts
 *
 * Guards against /rules showing Stage 2 = 5 while computePoolScores awards 2.
 */
import assert from "node:assert/strict";
import {
  DEFAULT_PUBLIC_RULES_GROUP_ADVANCE,
  DEFAULT_PUBLIC_RULES_STAGE2_CORRECT,
} from "./publicRulesDisplayDefaults";
import {
  DEFAULT_WORLD_CUP_GROUP_ADVANCE_EXACT_POINTS,
  DEFAULT_WORLD_CUP_GROUP_ADVANCE_WRONG_SLOT_POINTS,
  DEFAULT_WORLD_CUP_SCORING_RULE_ROWS,
} from "../scoring/worldcupPoolDefaults";
import {
  resolvePoolScoringConfig,
  resolveStage2PointsForRulesPage,
} from "../scoring/poolScoringConfig";

assert.equal(DEFAULT_PUBLIC_RULES_STAGE2_CORRECT, 2);
assert.equal(DEFAULT_PUBLIC_RULES_GROUP_ADVANCE.exactPoints, 3);
assert.equal(DEFAULT_PUBLIC_RULES_GROUP_ADVANCE.wrongSlotPoints, 1);

assert.equal(
  DEFAULT_PUBLIC_RULES_GROUP_ADVANCE.exactPoints,
  DEFAULT_WORLD_CUP_GROUP_ADVANCE_EXACT_POINTS,
);
assert.equal(
  DEFAULT_PUBLIC_RULES_GROUP_ADVANCE.wrongSlotPoints,
  DEFAULT_WORLD_CUP_GROUP_ADVANCE_WRONG_SLOT_POINTS,
);

const poolId = "pool-rules-0000-0000-0000-000000000001";
const rules = DEFAULT_WORLD_CUP_SCORING_RULE_ROWS.map((row) => ({
  predictionKind: row.predictionKind,
  bonusKey: row.bonusKey,
  points: row.points,
}));

const config = resolvePoolScoringConfig({
  poolId,
  groupAdvanceExactPoints: 3,
  groupAdvanceWrongSlotPoints: 1,
  scoringRules: rules,
});

const rulesPageStage2 =
  config.thirdPlaceQualifierPoints ??
  resolveStage2PointsForRulesPage({
    rules: [],
    applyWorldCupDisplayDefaults: true,
  });

assert.equal(rulesPageStage2, 2);
assert.equal(config.groupAdvance?.exactPoints, 3);
assert.equal(config.groupAdvance?.wrongSlotPoints, 1);

// Legacy misleading default (5) must not reappear for empty third-place rows.
assert.notEqual(DEFAULT_PUBLIC_RULES_STAGE2_CORRECT, 5);

console.log("publicRulesScoringConsistency selftest: ok");
