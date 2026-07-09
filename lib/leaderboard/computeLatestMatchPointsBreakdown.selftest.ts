/**
 * Run: npx tsx lib/leaderboard/computeLatestMatchPointsBreakdown.selftest.ts
 */
import assert from "node:assert/strict";
import {
  buildLatestPointsBreakdownForParticipant,
  computeKnockoutMatchPickPointsDelta,
} from "./computeLatestMatchPointsBreakdown";
import {
  formatLatestMatchScoringLine,
  formatLeaderboardLatestImpactSummary,
  formatOtherScoringAdjustmentsLine,
  formatThirdPlaceScoringCorrectionLine,
} from "./leaderboardBracketImpactDisplay";
import { formatRecentPointsDelta } from "./leaderboardMomentumDisplay";
import { parseLatestScoreEventContext } from "./parseLatestScoreEventContext";
import type { LeaderboardMomentumRow } from "./buildLeaderboardMomentum";
import { THIRD_PLACE_SCORING_CORRECTION_LABEL } from "./scoringCorrectionDisplay";

const spainId = "team-spain";
const portugalId = "team-portugal";
const swedenId = "team-sweden";
const rules = new Map([
  ["round_of_16", 4],
  ["quarterfinalist", 8],
  ["third_place_qualifier", 4],
]);
const officialThirdPlace = new Set([swedenId]);

const m93Match = {
  matchCode: "M93",
  stageCode: "round_of_16",
  groupCode: null,
  homeTeamId: portugalId,
  awayTeamId: spainId,
  winnerTeamId: spainId,
  scoringResultKind: "quarterfinalist",
  scoringSlotKey: "5",
};

function momentum(
  participantId: string,
  points: number,
  previousPoints = 100,
): LeaderboardMomentumRow {
  return {
    participantId,
    previousRank: 1,
    currentRank: 1,
    rankChange: 0,
    previousPoints,
    currentPoints: previousPoints + points,
    recentPointsGained: points,
    isNewEntry: false,
  };
}

const singleMatchEvent = parseLatestScoreEventContext(
  {
    match_label: "Portugal 0–1 Spain",
    scoreline: "Portugal 0–1 Spain",
    match_codes: ["M93"],
  },
  { hasValidSnapshot: true },
);

const multiMatchEvent = parseLatestScoreEventContext(
  {
    match_codes: ["M96", "M97"],
    match_label: "Knockout results",
  },
  { hasValidSnapshot: true },
);

const scoringRefreshEvent = parseLatestScoreEventContext(
  {
    match_codes: [],
    trigger: "admin_manual_recompute",
  },
  { hasValidSnapshot: true },
);

// 1. Match update only
{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "winner",
    momentum: momentum("winner", 8),
    event: multiMatchEvent,
    predictions: [
      {
        participantId: "winner",
        predictionKind: "quarterfinalist",
        teamId: spainId,
        slotKey: "5",
      },
    ],
    matches: [m93Match, m93Match],
    rulesByKind: rules,
    officialThirdPlaceAdvancerTeamIds: officialThirdPlace,
    thirdPlaceQualifiersSettled: true,
  });
  assert.equal(breakdown?.latestMatchPointsDelta, 8);
  assert.equal(breakdown?.thirdPlaceQualifierDelta, null);
  assert.equal(breakdown?.otherScoringDelta, null);
  assert.equal(
    formatRecentPointsDelta(momentum("winner", 8), {
      showZero: true,
      latestSuffix: true,
      pointsBreakdown: breakdown,
      event: multiMatchEvent,
    }),
    "(+8 latest)",
  );
  assert.equal(
    formatLatestMatchScoringLine(momentum("winner", 8), multiMatchEvent, null, breakdown),
    "Latest matches: +8",
  );
  assert.equal(formatThirdPlaceScoringCorrectionLine(breakdown), null);
}

{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "loser",
    momentum: momentum("loser", 0),
    event: multiMatchEvent,
    predictions: [
      {
        participantId: "loser",
        predictionKind: "quarterfinalist",
        teamId: portugalId,
        slotKey: "5",
      },
    ],
    matches: [m93Match, m93Match],
    rulesByKind: rules,
    officialThirdPlaceAdvancerTeamIds: officialThirdPlace,
    thirdPlaceQualifiersSettled: true,
  });
  assert.equal(breakdown?.latestMatchPointsDelta, 0);
  assert.equal(
    formatRecentPointsDelta(momentum("loser", 0), {
      showZero: true,
      latestSuffix: true,
      pointsBreakdown: breakdown,
      event: multiMatchEvent,
    }),
    "(+0)",
  );
}

// 2. Third-place correction only
{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "a",
    momentum: momentum("a", 4),
    event: scoringRefreshEvent,
    predictions: [
      {
        participantId: "a",
        predictionKind: "third_place_qualifier",
        teamId: swedenId,
        slotKey: "F",
      },
    ],
    matches: [],
    rulesByKind: rules,
    officialThirdPlaceAdvancerTeamIds: officialThirdPlace,
    thirdPlaceQualifiersSettled: true,
  });
  assert.equal(breakdown?.latestMatchPointsDelta, null);
  assert.equal(breakdown?.thirdPlaceQualifierDelta, 4);
  assert.equal(breakdown?.otherScoringDelta, null);
  assert.equal(
    formatLatestMatchScoringLine(momentum("a", 4), scoringRefreshEvent, null, breakdown),
    `${THIRD_PLACE_SCORING_CORRECTION_LABEL}: +4`,
  );
  assert.equal(
    formatRecentPointsDelta(momentum("a", 4), {
      showZero: true,
      latestSuffix: true,
      pointsBreakdown: breakdown,
      event: scoringRefreshEvent,
    }),
    null,
  );
}

{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "b",
    momentum: momentum("b", 12),
    event: scoringRefreshEvent,
    predictions: [
      {
        participantId: "b",
        predictionKind: "third_place_qualifier",
        teamId: swedenId,
        slotKey: "F",
      },
      {
        participantId: "b",
        predictionKind: "third_place_qualifier",
        teamId: "team-bih",
        slotKey: "B",
      },
      {
        participantId: "b",
        predictionKind: "third_place_qualifier",
        teamId: "team-par",
        slotKey: "D",
      },
    ],
    matches: [],
    rulesByKind: rules,
    officialThirdPlaceAdvancerTeamIds: new Set([
      swedenId,
      "team-bih",
      "team-par",
    ]),
    thirdPlaceQualifiersSettled: true,
  });
  assert.equal(breakdown?.thirdPlaceQualifierDelta, 12);
  assert.equal(
    formatThirdPlaceScoringCorrectionLine(breakdown),
    `${THIRD_PLACE_SCORING_CORRECTION_LABEL}: +12`,
  );
}

// 3. Mixed event: match points + correction points
{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "adarsh",
    momentum: momentum("adarsh", 12),
    event: multiMatchEvent,
    predictions: [
      {
        participantId: "adarsh",
        predictionKind: "quarterfinalist",
        teamId: spainId,
        slotKey: "5",
      },
      {
        participantId: "adarsh",
        predictionKind: "quarterfinalist",
        teamId: spainId,
        slotKey: "5",
      },
      {
        participantId: "adarsh",
        predictionKind: "third_place_qualifier",
        teamId: swedenId,
        slotKey: "F",
      },
    ],
    matches: [m93Match, m93Match],
    rulesByKind: rules,
    officialThirdPlaceAdvancerTeamIds: officialThirdPlace,
    thirdPlaceQualifiersSettled: true,
  });
  assert.equal(breakdown?.latestMatchPointsDelta, 8);
  assert.equal(breakdown?.thirdPlaceQualifierDelta, 4);
  assert.equal(breakdown?.otherScoringDelta, null);
  const summary = formatLeaderboardLatestImpactSummary({
    totalPoints: 142,
    momentum: momentum("adarsh", 12),
    event: multiMatchEvent,
    pointsBreakdown: breakdown,
  });
  assert.equal(summary.latestLine, "Latest matches: +8");
  assert.equal(
    summary.correctionLine,
    `${THIRD_PLACE_SCORING_CORRECTION_LABEL}: +4`,
  );
  assert.equal(summary.otherScoringLine, null);
  assert.equal(
    formatRecentPointsDelta(momentum("adarsh", 12), {
      showZero: true,
      latestSuffix: true,
      pointsBreakdown: breakdown,
      event: multiMatchEvent,
    }),
    "(+8 latest)",
  );
}

{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "missed",
    momentum: momentum("missed", 12),
    event: multiMatchEvent,
    predictions: [
      {
        participantId: "missed",
        predictionKind: "quarterfinalist",
        teamId: portugalId,
        slotKey: "5",
      },
      {
        participantId: "missed",
        predictionKind: "third_place_qualifier",
        teamId: swedenId,
        slotKey: "F",
      },
      {
        participantId: "missed",
        predictionKind: "third_place_qualifier",
        teamId: "team-bih",
        slotKey: "B",
      },
      {
        participantId: "missed",
        predictionKind: "third_place_qualifier",
        teamId: "team-par",
        slotKey: "D",
      },
    ],
    matches: [m93Match, m93Match],
    rulesByKind: rules,
    officialThirdPlaceAdvancerTeamIds: new Set([
      swedenId,
      "team-bih",
      "team-par",
    ]),
    thirdPlaceQualifiersSettled: true,
  });
  assert.equal(breakdown?.latestMatchPointsDelta, 0);
  assert.equal(breakdown?.thirdPlaceQualifierDelta, 12);
  assert.equal(
    formatRecentPointsDelta(momentum("missed", 12), {
      showZero: true,
      latestSuffix: true,
      pointsBreakdown: breakdown,
      event: multiMatchEvent,
    }),
    "(+0)",
  );
}

// Legacy Spain/Portugal mixed backfill maps to third-place correction label
{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "loser",
    momentum: momentum("loser", 4),
    event: singleMatchEvent,
    predictions: [
      {
        participantId: "loser",
        predictionKind: "quarterfinalist",
        teamId: portugalId,
        slotKey: "5",
      },
      {
        participantId: "loser",
        predictionKind: "third_place_qualifier",
        teamId: swedenId,
        slotKey: "F",
      },
    ],
    matches: [m93Match],
    rulesByKind: rules,
    officialThirdPlaceAdvancerTeamIds: officialThirdPlace,
    thirdPlaceQualifiersSettled: true,
  });
  assert.equal(breakdown?.latestMatchPointsDelta, 0);
  assert.equal(breakdown?.thirdPlaceQualifierDelta, 4);
  assert.equal(
    formatThirdPlaceScoringCorrectionLine(breakdown),
    `${THIRD_PLACE_SCORING_CORRECTION_LABEL}: +4`,
  );
  assert.equal(formatOtherScoringAdjustmentsLine(breakdown), null);
}

// 4. Unknown adjustment fallback
{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "unknown",
    momentum: momentum("unknown", 5),
    event: singleMatchEvent,
    predictions: [
      {
        participantId: "unknown",
        predictionKind: "quarterfinalist",
        teamId: portugalId,
        slotKey: "5",
      },
    ],
    matches: [m93Match],
    rulesByKind: rules,
    officialThirdPlaceAdvancerTeamIds: officialThirdPlace,
    thirdPlaceQualifiersSettled: true,
  });
  assert.equal(breakdown?.latestMatchPointsDelta, 0);
  assert.equal(breakdown?.thirdPlaceQualifierDelta, null);
  assert.equal(breakdown?.otherScoringDelta, 5);
  assert.equal(
    formatOtherScoringAdjustmentsLine(breakdown, {
      participantId: "unknown",
      displayName: "Unknown",
    }),
    "Other scoring adjustments: +5",
  );
}

// Spain picker gets +4 match points
assert.equal(
  computeKnockoutMatchPickPointsDelta(
    [
      {
        participantId: "winner",
        predictionKind: "quarterfinalist",
        teamId: spainId,
        slotKey: "5",
      },
    ],
    m93Match,
    rules,
  ),
  4,
);

console.log("computeLatestMatchPointsBreakdown.selftest.ts: ok");
