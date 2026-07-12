/**
 * Run: npx tsx lib/leaderboard/computeLatestMatchPointsBreakdown.selftest.ts
 */
import assert from "node:assert/strict";
import {
  buildLatestPointsBreakdownForParticipant,
  computeKnockoutMatchPickPointsDelta,
  computeKnockoutOncePerTeamProgressionDelta,
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
const englandId = "team-england";
const norwayId = "team-norway";
const rules = new Map([
  ["round_of_16", 4],
  ["quarterfinalist", 8],
  ["semifinalist", 16],
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

const m99Match = {
  matchCode: "M99",
  stageCode: "quarterfinal",
  groupCode: null,
  homeTeamId: norwayId,
  awayTeamId: englandId,
  winnerTeamId: englandId,
  scoringResultKind: "semifinalist",
  scoringSlotKey: "3",
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
    scoring_corrections: [{ kind: "third_place_qualifier" }],
  },
  { hasValidSnapshot: true },
);

const englandEvent = parseLatestScoreEventContext(
  {
    match_label: "Norway 1–2 England",
    scoreline: "Norway 1–2 England",
    match_codes: ["M99"],
  },
  { hasValidSnapshot: true },
);

// 1. Match update only (once-per-team progression: R16→QF = +4)
{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "winner",
    momentum: momentum("winner", 4),
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
  assert.equal(breakdown?.latestMatchPointsDelta, 4);
  assert.equal(breakdown?.thirdPlaceQualifierDelta, null);
  assert.equal(breakdown?.otherScoringDelta, null);
  assert.equal(
    formatRecentPointsDelta(momentum("winner", 4), {
      showZero: true,
      latestSuffix: true,
      pointsBreakdown: breakdown,
      event: multiMatchEvent,
    }),
    "(+4 latest)",
  );
  assert.equal(
    formatLatestMatchScoringLine(momentum("winner", 4), multiMatchEvent, null, breakdown),
    "Latest matches: +4",
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

// 2. Third-place correction only (explicit scoring_corrections on event)
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

// 3. Mixed event: match points + explicit third-place correction
{
  const mixedEvent = parseLatestScoreEventContext(
    {
      match_codes: ["M96", "M97"],
      match_label: "Knockout results",
      scoring_corrections: [{ kind: "third_place_qualifier" }],
    },
    { hasValidSnapshot: true },
  );
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "adarsh",
    momentum: momentum("adarsh", 8),
    event: mixedEvent,
    predictions: [
      {
        participantId: "adarsh",
        predictionKind: "round_of_16",
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
    matches: [m93Match],
    rulesByKind: rules,
    officialThirdPlaceAdvancerTeamIds: officialThirdPlace,
    thirdPlaceQualifiersSettled: true,
  });
  assert.equal(breakdown?.latestMatchPointsDelta, 4);
  assert.equal(breakdown?.thirdPlaceQualifierDelta, 4);
  assert.equal(breakdown?.otherScoringDelta, null);
  const summary = formatLeaderboardLatestImpactSummary({
    totalPoints: 142,
    momentum: momentum("adarsh", 8),
    event: mixedEvent,
    pointsBreakdown: breakdown,
  });
  assert.equal(summary.latestLine, "Latest matches: +4");
  assert.equal(
    summary.correctionLine,
    `${THIRD_PLACE_SCORING_CORRECTION_LABEL}: +4`,
  );
}

// 4. Later match must NOT relabel residual as third-place without scoring_corrections
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
    matches: [m93Match],
    rulesByKind: rules,
    officialThirdPlaceAdvancerTeamIds: new Set([
      swedenId,
      "team-bih",
      "team-par",
    ]),
    thirdPlaceQualifiersSettled: true,
  });
  assert.equal(breakdown?.latestMatchPointsDelta, 0);
  assert.equal(breakdown?.thirdPlaceQualifierDelta, null);
  assert.equal(breakdown?.otherScoringDelta, 12);
  assert.equal(formatThirdPlaceScoringCorrectionLine(breakdown), null);
}

// 5. Emil-style: England in bracket but not SF slot pick → once-per-team +8, not third-place
{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "emil",
    momentum: momentum("emil", 8, 198),
    event: englandEvent,
    predictions: [
      {
        participantId: "emil",
        predictionKind: "quarterfinalist",
        teamId: englandId,
        slotKey: "4",
      },
      {
        participantId: "emil",
        predictionKind: "third_place_qualifier",
        teamId: swedenId,
        slotKey: "F",
      },
      {
        participantId: "emil",
        predictionKind: "third_place_qualifier",
        teamId: "team-par",
        slotKey: "D",
      },
    ],
    matches: [m99Match],
    rulesByKind: rules,
    officialThirdPlaceAdvancerTeamIds: new Set([swedenId, "team-par"]),
    thirdPlaceQualifiersSettled: true,
  });
  assert.equal(breakdown?.latestMatchPointsDelta, 8);
  assert.equal(breakdown?.thirdPlaceQualifierDelta, null);
  assert.equal(breakdown?.otherScoringDelta, null);
  const summary = formatLeaderboardLatestImpactSummary({
    totalPoints: 206,
    momentum: momentum("emil", 8, 198),
    event: englandEvent,
    pointsBreakdown: breakdown,
    participantId: "emil",
    displayName: "Emil",
  });
  assert.equal(summary.latestLine, "England def. Norway: +8");
  assert.equal(summary.correctionLine, null);
}

// 6. Match winner SF slot picker: +8 progression (QF→SF), no third-place echo
{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "wwcd",
    momentum: momentum("wwcd", 8, 191),
    event: englandEvent,
    predictions: [
      {
        participantId: "wwcd",
        predictionKind: "semifinalist",
        teamId: englandId,
        slotKey: "3",
      },
      {
        participantId: "wwcd",
        predictionKind: "third_place_qualifier",
        teamId: swedenId,
        slotKey: "F",
      },
    ],
    matches: [m99Match],
    rulesByKind: rules,
    officialThirdPlaceAdvancerTeamIds: officialThirdPlace,
    thirdPlaceQualifiersSettled: true,
  });
  assert.equal(breakdown?.latestMatchPointsDelta, 8);
  assert.equal(breakdown?.thirdPlaceQualifierDelta, null);
  assert.equal(
    formatThirdPlaceScoringCorrectionLine(breakdown),
    null,
  );
}

// 7. Match loser / no England knockout pick: +0, no third-place echo
{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "arjie",
    momentum: momentum("arjie", 0, 149),
    event: englandEvent,
    predictions: [
      {
        participantId: "arjie",
        predictionKind: "group_winner",
        teamId: englandId,
        slotKey: null,
      },
      {
        participantId: "arjie",
        predictionKind: "third_place_qualifier",
        teamId: swedenId,
        slotKey: "F",
      },
    ],
    matches: [m99Match],
    rulesByKind: rules,
    officialThirdPlaceAdvancerTeamIds: officialThirdPlace,
    thirdPlaceQualifiersSettled: true,
  });
  assert.equal(breakdown?.latestMatchPointsDelta, 0);
  assert.equal(breakdown?.thirdPlaceQualifierDelta, null);
  assert.equal(breakdown?.otherScoringDelta, null);
  assert.equal(
    formatLatestMatchScoringLine(momentum("arjie", 0, 149), englandEvent, null, breakdown),
    "England def. Norway: +0",
  );
}

// 8. Stale baseline residual must not become third-place on match events
{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "stale",
    momentum: momentum("stale", 8, 190),
    event: englandEvent,
    predictions: [
      {
        participantId: "stale",
        predictionKind: "semifinalist",
        teamId: norwayId,
        slotKey: "3",
      },
      {
        participantId: "stale",
        predictionKind: "third_place_qualifier",
        teamId: swedenId,
        slotKey: "F",
      },
      {
        participantId: "stale",
        predictionKind: "third_place_qualifier",
        teamId: "team-par",
        slotKey: "D",
      },
    ],
    matches: [m99Match],
    rulesByKind: rules,
    officialThirdPlaceAdvancerTeamIds: new Set([swedenId, "team-par"]),
    thirdPlaceQualifiersSettled: true,
  });
  assert.equal(breakdown?.latestMatchPointsDelta, 0);
  assert.equal(breakdown?.thirdPlaceQualifierDelta, null);
  assert.equal(breakdown?.otherScoringDelta, 8);
}

// 9. Unknown adjustment fallback
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

// Progression helpers
assert.equal(
  computeKnockoutOncePerTeamProgressionDelta(
    [
      {
        participantId: "winner",
        predictionKind: "round_of_16",
        teamId: spainId,
        slotKey: "5",
      },
    ],
    m93Match,
    rules,
  ),
  4,
);
assert.equal(
  computeKnockoutOncePerTeamProgressionDelta(
    [
      {
        participantId: "emil",
        predictionKind: "quarterfinalist",
        teamId: englandId,
        slotKey: "4",
      },
    ],
    m99Match,
    rules,
  ),
  8,
);
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
  8,
);

console.log("computeLatestMatchPointsBreakdown.selftest.ts: ok");
