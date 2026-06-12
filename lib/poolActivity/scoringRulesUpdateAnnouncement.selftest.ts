/**
 * Run: npx tsx lib/poolActivity/scoringRulesUpdateAnnouncement.selftest.ts
 */
import assert from "node:assert/strict";
import {
  SCORING_RULES_UPDATE_2026_BODY,
  SCORING_RULES_UPDATE_2026_SOURCE_KEY,
  isScoringRulesUpdate2026Activity,
  scoringRulesUpdate2026ActivityTypeLabel,
} from "./scoringRulesUpdateAnnouncement";

assert.equal(
  SCORING_RULES_UPDATE_2026_SOURCE_KEY,
  "rules_update_2026_third_place_4_most_goals_25",
);
assert.match(SCORING_RULES_UPDATE_2026_BODY, /4 points each/);
assert.match(SCORING_RULES_UPDATE_2026_BODY, /25 points/);
assert.doesNotMatch(SCORING_RULES_UPDATE_2026_BODY, /sorry|apolog/i);

const milestone = {
  type: "pool_milestone" as const,
  metadata_json: {
    source_key: SCORING_RULES_UPDATE_2026_SOURCE_KEY,
    milestone_label: "POOL UPDATE",
  },
};

assert.equal(isScoringRulesUpdate2026Activity(milestone), true);
assert.equal(
  scoringRulesUpdate2026ActivityTypeLabel(milestone),
  "AshBot · Scoring update",
);

assert.equal(
  isScoringRulesUpdate2026Activity({
    type: "pool_milestone",
    metadata_json: { source_key: "lock_passed" },
  }),
  false,
);

console.log("scoringRulesUpdateAnnouncement.selftest: ok");
