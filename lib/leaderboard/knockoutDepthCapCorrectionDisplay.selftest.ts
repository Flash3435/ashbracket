/**
 * Run: npx tsx lib/leaderboard/knockoutDepthCapCorrectionDisplay.selftest.ts
 */
import assert from "node:assert/strict";
import {
  buildLatestPointsBreakdownForParticipant,
} from "./computeLatestMatchPointsBreakdown";
import {
  formatKnockoutDepthCapScoringCorrectionLine,
  formatLeaderboardLatestImpactSummary,
  formatNamedScoringCorrectionLine,
  formatOtherScoringAdjustmentsLine,
  formatThirdPlaceScoringCorrectionLine,
} from "./leaderboardBracketImpactDisplay";
import { parseLatestScoreEventContext } from "./parseLatestScoreEventContext";
import type { LeaderboardMomentumRow } from "./buildLeaderboardMomentum";
import {
  KNOCKOUT_DEPTH_CAP_SCORING_CORRECTION_LABEL,
  THIRD_PLACE_SCORING_CORRECTION_LABEL,
} from "./scoringCorrectionDisplay";

const spainId = "team-spain";
const rules = new Map([
  ["semifinalist", 16],
  ["finalist", 24],
]);

function momentum(
  participantId: string,
  gained: number,
  previousPoints = 200,
): LeaderboardMomentumRow {
  return {
    participantId,
    previousRank: 1,
    currentRank: 1,
    rankChange: 0,
    previousPoints,
    currentPoints: previousPoints + gained,
    recentPointsGained: gained,
    isNewEntry: false,
  };
}

const depthCapEvent = parseLatestScoreEventContext(
  {
    match_codes: [],
    trigger: "admin_manual_recompute",
    scoring_corrections: [{ kind: "knockout_prediction_depth_cap" }],
  },
  { hasValidSnapshot: true },
);

assert.equal(depthCapEvent.eventKind, "scoring_refresh");
assert.deepEqual(depthCapEvent.scoringCorrectionKinds, [
  "knockout_prediction_depth_cap",
]);

// −8 correction
{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "p8",
    momentum: momentum("p8", -8),
    event: depthCapEvent,
    predictions: [
      {
        participantId: "p8",
        predictionKind: "semifinalist",
        teamId: spainId,
        slotKey: "2",
      },
    ],
    matches: [],
    rulesByKind: rules,
  });
  assert.equal(breakdown?.knockoutPredictionDepthCapDelta, -8);
  assert.equal(breakdown?.otherScoringDelta, null);
  assert.equal(breakdown?.thirdPlaceQualifierDelta, null);
  assert.equal(
    formatKnockoutDepthCapScoringCorrectionLine(breakdown),
    `${KNOCKOUT_DEPTH_CAP_SCORING_CORRECTION_LABEL}: −8`,
  );
  assert.equal(formatThirdPlaceScoringCorrectionLine(breakdown), null);
  assert.equal(formatOtherScoringAdjustmentsLine(breakdown), null);
  const summary = formatLeaderboardLatestImpactSummary({
    totalPoints: 192,
    momentum: momentum("p8", -8),
    event: depthCapEvent,
    pointsBreakdown: breakdown,
  });
  assert.equal(summary.latestLine, `${KNOCKOUT_DEPTH_CAP_SCORING_CORRECTION_LABEL}: −8`);
  assert.equal(summary.correctionLine, `${KNOCKOUT_DEPTH_CAP_SCORING_CORRECTION_LABEL}: −8`);
  assert.equal(summary.otherScoringLine, null);
}

// −24 correction
{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "p24",
    momentum: momentum("p24", -24),
    event: depthCapEvent,
    predictions: [],
    matches: [],
    rulesByKind: rules,
  });
  assert.equal(breakdown?.knockoutPredictionDepthCapDelta, -24);
  assert.equal(
    formatNamedScoringCorrectionLine(breakdown),
    `${KNOCKOUT_DEPTH_CAP_SCORING_CORRECTION_LABEL}: −24`,
  );
}

// Mixed: match gain + negative depth-cap correction
{
  const matchEvent = parseLatestScoreEventContext(
    {
      match_label: "England 2–1 Norway",
      scoreline: "England 2–1 Norway",
      match_codes: ["M99"],
      scoring_corrections: [{ kind: "knockout_prediction_depth_cap" }],
    },
    { hasValidSnapshot: true },
  );
  const englandId = "team-eng";
  const norwayId = "team-nor";
  const m99 = {
    matchCode: "M99",
    stageCode: "quarterfinal",
    groupCode: null,
    homeTeamId: norwayId,
    awayTeamId: englandId,
    winnerTeamId: englandId,
    scoringResultKind: "semifinalist",
    scoringSlotKey: "3",
  };
  const mixedRules = new Map([
    ["quarterfinalist", 8],
    ["semifinalist", 16],
  ]);
  // Match +8 for SF-predicted England, plus −24 residual correction → total −16
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "mixed",
    momentum: momentum("mixed", -16),
    event: matchEvent,
    predictions: [
      {
        participantId: "mixed",
        predictionKind: "semifinalist",
        teamId: englandId,
        slotKey: "3",
      },
    ],
    matches: [m99],
    rulesByKind: mixedRules,
  });
  assert.equal(breakdown?.latestMatchPointsDelta, 8);
  assert.equal(breakdown?.knockoutPredictionDepthCapDelta, -24);
  assert.equal(breakdown?.otherScoringDelta, null);
  const summary = formatLeaderboardLatestImpactSummary({
    totalPoints: 184,
    momentum: momentum("mixed", -16),
    event: matchEvent,
    pointsBreakdown: breakdown,
  });
  assert.equal(summary.latestLine, "Latest scoring: −16");
  assert.ok(
    summary.componentLines.some((line) => /Match progression \+8/.test(line)),
  );
  assert.ok(
    summary.componentLines.some((line) =>
      line.includes(`${KNOCKOUT_DEPTH_CAP_SCORING_CORRECTION_LABEL}`),
    ) ||
      summary.componentLines.some((line) => /Scoring correction −24/.test(line)),
  );
  assert.equal(summary.correctionLine, null);
  assert.equal(summary.otherScoringLine, null);
  assert.ok(
    !summary.componentLines.some((line) =>
      line.includes(THIRD_PLACE_SCORING_CORRECTION_LABEL),
    ),
  );
}

// Unaffected participant (0 delta) with correction metadata → no correction line
{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "ok",
    momentum: momentum("ok", 0),
    event: depthCapEvent,
    predictions: [],
    matches: [],
    rulesByKind: rules,
  });
  assert.equal(breakdown?.knockoutPredictionDepthCapDelta, null);
  assert.equal(formatKnockoutDepthCapScoringCorrectionLine(breakdown), null);
  assert.equal(formatNamedScoringCorrectionLine(breakdown), null);
}

// Missing/legacy metadata: negative residual falls back away from depth-cap label
{
  const legacyEvent = parseLatestScoreEventContext(
    {
      match_codes: [],
      trigger: "admin_manual_recompute",
    },
    { hasValidSnapshot: true },
  );
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "legacy",
    momentum: momentum("legacy", -8),
    event: legacyEvent,
    predictions: [],
    matches: [],
    rulesByKind: rules,
  });
  assert.equal(breakdown?.knockoutPredictionDepthCapDelta, null);
  assert.equal(formatKnockoutDepthCapScoringCorrectionLine(breakdown), null);
  // Negative residuals without metadata do not invent "Other scoring adjustments"
  assert.equal(formatOtherScoringAdjustmentsLine(breakdown), null);
  const summary = formatLeaderboardLatestImpactSummary({
    totalPoints: 192,
    momentum: momentum("legacy", -8),
    event: legacyEvent,
    pointsBreakdown: breakdown,
  });
  assert.equal(summary.latestLine, "Latest: Scoring adjustment −8");
  assert.equal(summary.correctionLine, null);
}

console.log("knockoutDepthCapCorrectionDisplay.selftest.ts: ok");
