/**
 * Run: `npx tsx lib/scoring/worldcupPoolDefaults.selftest.ts`
 */
import assert from "node:assert/strict";
import {
  DEFAULT_WORLD_CUP_SCORING_RULE_ROWS,
  simulationPoolNeedsDefaultScoringConfig,
} from "./worldcupPoolDefaults";

assert.equal(
  simulationPoolNeedsDefaultScoringConfig({
    isSimulation: true,
    groupAdvanceExactPoints: null,
    groupAdvanceWrongSlotPoints: null,
    scoringRuleCount: 0,
  }),
  true,
);

assert.equal(
  simulationPoolNeedsDefaultScoringConfig({
    isSimulation: false,
    groupAdvanceExactPoints: null,
    groupAdvanceWrongSlotPoints: null,
    scoringRuleCount: 0,
  }),
  false,
);

assert.equal(
  simulationPoolNeedsDefaultScoringConfig({
    isSimulation: true,
    groupAdvanceExactPoints: 3,
    groupAdvanceWrongSlotPoints: 1,
    scoringRuleCount: 9,
  }),
  false,
);

const thirdPlace = DEFAULT_WORLD_CUP_SCORING_RULE_ROWS.find(
  (row) => row.predictionKind === "third_place_qualifier",
);
const mostGoals = DEFAULT_WORLD_CUP_SCORING_RULE_ROWS.find(
  (row) => row.bonusKey === "most_goals",
);
const yellowCards = DEFAULT_WORLD_CUP_SCORING_RULE_ROWS.find(
  (row) => row.bonusKey === "most_yellow_cards",
);
const redCards = DEFAULT_WORLD_CUP_SCORING_RULE_ROWS.find(
  (row) => row.bonusKey === "most_red_cards",
);

assert.equal(thirdPlace?.points, 4);
assert.equal(mostGoals?.points, 25);
assert.equal(yellowCards?.points, 10);
assert.equal(redCards?.points, 10);

console.log("worldcupPoolDefaults selftest: ok");
