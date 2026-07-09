/**
 * Run: npx tsx lib/poolActivity/scoreImpact/buildScoreImpactDisplay.selftest.ts
 */
import assert from "node:assert/strict";
import { buildScoreImpactDisplayLines } from "./buildScoreImpactDisplay";
import { THIRD_PLACE_SCORING_BACKFILL_NOTICE } from "@/lib/leaderboard/scoringCorrectionDisplay";

const display = buildScoreImpactDisplayLines(
  {
    match_label: "Switzerland 0–0 Colombia",
    scoreline: "Switzerland 0–0 Colombia",
    match_codes: ["M96", "M97"],
    points_changed: true,
    affected_count: 42,
    reason: "knockout_result",
    scoring_corrections: [{ kind: "third_place_qualifier" }],
  },
  {
    allowParticipantNames: true,
  },
);

assert.ok(display, "score impact display should render");
assert.match(display!.headline ?? "", /Switzerland 0–0 Colombia is final/);
assert.ok(
  display!.detailLines.some((line) => line.includes(THIRD_PLACE_SCORING_BACKFILL_NOTICE)),
  "activity card should explain delayed third-place scoring",
);

console.log("buildScoreImpactDisplay.selftest.ts: ok");
