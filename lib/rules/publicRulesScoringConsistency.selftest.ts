/**
 * Run: npx tsx lib/rules/publicRulesScoringConsistency.selftest.ts
 *
 * Guards against /rules showing values that differ from computePoolScores defaults.
 */
import assert from "node:assert/strict";
import {
  DEFAULT_PUBLIC_RULES_GROUP_ADVANCE,
  DEFAULT_PUBLIC_RULES_STAGE2_CORRECT,
  PUBLIC_RULES_BONUS_ROWS,
  PUBLIC_RULES_KNOCKOUT_ROWS,
} from "./publicRulesDisplayDefaults";
import {
  DEFAULT_WORLD_CUP_GROUP_ADVANCE_EXACT_POINTS,
  DEFAULT_WORLD_CUP_GROUP_ADVANCE_WRONG_SLOT_POINTS,
  DEFAULT_WORLD_CUP_SCORING_RULE_ROWS,
} from "../scoring/worldcupPoolDefaults";
import { bonusRulesTableRowsFromPublicRules } from "./bonusRulesTableRows";
import { knockoutRulesTableRowsFromPublicRules } from "./knockoutRulesTableRows";
import { labelPublicScoringRule } from "./scoringRulePublicLabels";
import { partitionPublicRulesForDisplay } from "./partitionPublicRulesForDisplay";
import {
  resolvePoolScoringConfig,
  resolveStage2PointsForRulesPage,
} from "../scoring/poolScoringConfig";

assert.equal(DEFAULT_PUBLIC_RULES_STAGE2_CORRECT, 4);
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

assert.equal(rulesPageStage2, 4);
assert.equal(config.groupAdvance?.exactPoints, 3);
assert.equal(config.groupAdvance?.wrongSlotPoints, 1);

const goalsRow = PUBLIC_RULES_BONUS_ROWS.find(
  (row) => row.label === "Team with the most goals",
);
assert.ok(goalsRow);
assert.equal(goalsRow!.points, 25);
assert.equal(
  PUBLIC_RULES_BONUS_ROWS.find((row) => row.label.includes("yellow"))?.points,
  10,
);
assert.equal(
  PUBLIC_RULES_BONUS_ROWS.find((row) => row.label.includes("red"))?.points,
  10,
);
assert.deepEqual(
  PUBLIC_RULES_KNOCKOUT_ROWS.map((row) => row.points),
  [4, 8, 16, 24, 32],
);

// Legacy misleading default (5) must not reappear for empty third-place rows.
assert.notEqual(DEFAULT_PUBLIC_RULES_STAGE2_CORRECT, 5);

const bonusTableFallback = bonusRulesTableRowsFromPublicRules([]);
assert.equal(
  bonusTableFallback.find((row) => row.label.includes("most goals"))?.points,
  25,
);

const bonusTableFromDb = bonusRulesTableRowsFromPublicRules(
  rules.map((row) => ({
    predictionKind: row.predictionKind,
    bonusKey: row.bonusKey,
    points: row.points,
    label:
      row.bonusKey === "most_goals"
        ? "Team with the most goals in the tournament"
        : row.bonusKey ?? row.predictionKind,
  })),
);
assert.equal(
  bonusTableFromDb.find((row) => row.label.includes("most goals"))?.points,
  25,
);

const publicRuleRows = rules.map((row) => ({
  predictionKind: row.predictionKind,
  bonusKey: row.bonusKey,
  points: row.points,
  label: labelPublicScoringRule(row.predictionKind, row.bonusKey),
}));
const { knockoutRules, bonusRules } =
  partitionPublicRulesForDisplay(publicRuleRows);
const knockoutTable = knockoutRulesTableRowsFromPublicRules(knockoutRules);
assert.deepEqual(
  knockoutTable.map((row) => row.points),
  [4, 8, 16, 24, 32],
);
assert.notDeepEqual(knockoutTable.map((row) => row.points), [10, 20, 50, 100]);

const stage2Points =
  resolvePoolScoringConfig({
    poolId,
    groupAdvanceExactPoints: 3,
    groupAdvanceWrongSlotPoints: 1,
    scoringRules: rules,
  }).thirdPlaceQualifierPoints ?? null;
assert.equal(stage2Points, 4);
assert.equal(
  bonusRulesTableRowsFromPublicRules(bonusRules).find((row) =>
    row.label.includes("most goals"),
  )?.points,
  25,
);

console.log("publicRulesScoringConsistency selftest: ok");
