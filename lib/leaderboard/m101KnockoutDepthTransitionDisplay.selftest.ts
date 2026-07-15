/**
 * Presentation tests for the M101-only knockout depth transition correction.
 */
import assert from "node:assert/strict";
import type { LeaderboardMomentumRow } from "./buildLeaderboardMomentum";
import { buildLatestPointsBreakdownForParticipant } from "./computeLatestMatchPointsBreakdown";
import {
  formatM101KnockoutDepthTransitionLine,
  formatNamedScoringCorrectionLine,
  formatOtherScoringAdjustmentsLine,
  formatThirdPlaceScoringCorrectionLine,
} from "./leaderboardBracketImpactDisplay";
import type { LeaderboardLatestScoreEventContext } from "./parseLatestScoreEventContext";
import { M101_KNOCKOUT_DEPTH_TRANSITION_NOTICE } from "./scoringCorrectionDisplay";

function momentum(
  participantId: string,
  delta: number,
): LeaderboardMomentumRow {
  return {
    participantId,
    previousRank: 5,
    previousPoints: 100,
    currentRank: 5,
    currentPoints: 100 + delta,
    rankChange: 0,
    recentPointsGained: delta,
    isNewEntry: false,
  };
}

function event(
  kinds: LeaderboardLatestScoreEventContext["scoringCorrectionKinds"],
  eventKind: LeaderboardLatestScoreEventContext["eventKind"] = "scoring_refresh",
): LeaderboardLatestScoreEventContext {
  return {
    hasValidSnapshot: true,
    eventKind,
    matchLabel: null,
    scoreline: null,
    matchCodes: [],
    matchCount: 0,
    isSingleMatch: false,
    winnerTeamName: null,
    loserTeamName: null,
    matchupShortLabel: null,
    scoringCorrectionKinds: kinds,
  };
}

const emptyRules = new Map<string, number>();
const correctionEvent = event(["m101_knockout_depth_transition"]);

// 1. Spain SF-only participant: −8 → M101 scoring adjustment line
{
  const pid = "sf-only";
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: pid,
    momentum: momentum(pid, -8),
    event: correctionEvent,
    predictions: [],
    matches: [],
    rulesByKind: emptyRules,
  });
  assert.equal(breakdown?.m101KnockoutDepthTransitionDelta, -8);
  assert.equal(
    formatM101KnockoutDepthTransitionLine(breakdown),
    "M101 scoring adjustment: −8",
  );
  assert.equal(formatThirdPlaceScoringCorrectionLine(breakdown), null);
  assert.equal(
    M101_KNOCKOUT_DEPTH_TRANSITION_NOTICE,
    "Finalist points now require predicting the team to reach the final.",
  );
}

// 2. Spain finalist keeper: delta 0 → no correction line, no third-place label
{
  const pid = "finalist-keeper";
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: pid,
    momentum: momentum(pid, 0),
    event: correctionEvent,
    predictions: [],
    matches: [],
    rulesByKind: emptyRules,
  });
  assert.equal(breakdown?.m101KnockoutDepthTransitionDelta, null);
  assert.equal(formatM101KnockoutDepthTransitionLine(breakdown), null);
  assert.equal(formatNamedScoringCorrectionLine(breakdown), null);
  assert.equal(formatThirdPlaceScoringCorrectionLine(breakdown), null);
}

// 3. Mixed pool: corrected / retain / no-Spain — no cross-participant inheritance
{
  const corrected = buildLatestPointsBreakdownForParticipant({
    participantId: "a-corrected",
    momentum: momentum("a-corrected", -8),
    event: correctionEvent,
    predictions: [],
    matches: [],
    rulesByKind: emptyRules,
  });
  const retain = buildLatestPointsBreakdownForParticipant({
    participantId: "b-retain",
    momentum: momentum("b-retain", 0),
    event: correctionEvent,
    predictions: [],
    matches: [],
    rulesByKind: emptyRules,
  });
  const untouched = buildLatestPointsBreakdownForParticipant({
    participantId: "c-untouched",
    momentum: momentum("c-untouched", 0),
    event: correctionEvent,
    predictions: [],
    matches: [],
    rulesByKind: emptyRules,
  });

  assert.equal(
    formatM101KnockoutDepthTransitionLine(corrected),
    "M101 scoring adjustment: −8",
  );
  assert.equal(formatM101KnockoutDepthTransitionLine(retain), null);
  assert.equal(formatM101KnockoutDepthTransitionLine(untouched), null);
  assert.equal(corrected?.participantId, "a-corrected");
  assert.equal(retain?.participantId, "b-retain");
  assert.ok(!(retain && formatNamedScoringCorrectionLine(retain)?.includes("−8")));
}

// Must not be labelled third-place or full-history depth-cap
{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "p1",
    momentum: momentum("p1", -8),
    event: correctionEvent,
    predictions: [],
    matches: [],
    rulesByKind: emptyRules,
  });
  const line = formatNamedScoringCorrectionLine(breakdown) ?? "";
  assert.ok(!line.toLowerCase().includes("third-place"));
  assert.ok(!line.includes("Best third-place"));
  assert.ok(!line.includes("Knockout scoring correction"));
  assert.ok(line.startsWith("M101 scoring adjustment"));
  assert.equal(formatOtherScoringAdjustmentsLine(breakdown), null);
}

// Legacy metadata without correction kind does not invent M101 line
{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "p1",
    momentum: momentum("p1", -8),
    event: event([]),
    predictions: [],
    matches: [],
    rulesByKind: emptyRules,
  });
  assert.equal(breakdown?.m101KnockoutDepthTransitionDelta, null);
  assert.equal(formatM101KnockoutDepthTransitionLine(breakdown), null);
}

console.log("m101KnockoutDepthTransitionDisplay.selftest.ts: ok");
