/**
 * Run: `npx tsx lib/scoring/worldcupPoolDefaults.selftest.ts`
 */
import assert from "node:assert/strict";
import { simulationPoolNeedsDefaultScoringConfig } from "./worldcupPoolDefaults";

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

console.log("worldcupPoolDefaults selftest: ok");
