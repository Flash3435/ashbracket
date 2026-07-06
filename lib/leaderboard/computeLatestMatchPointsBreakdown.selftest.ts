/**
 * Run: npx tsx lib/leaderboard/computeLatestMatchPointsBreakdown.selftest.ts
 */
import assert from "node:assert/strict";
import {
  buildLatestPointsBreakdownForParticipant,
  computeKnockoutMatchPickPointsDelta,
} from "./computeLatestMatchPointsBreakdown";
import { formatLatestMatchScoringLine, formatOtherScoringAdjustmentsLine } from "./leaderboardBracketImpactDisplay";
import { formatRecentPointsDelta } from "./leaderboardMomentumDisplay";
import { parseLatestScoreEventContext } from "./parseLatestScoreEventContext";
import type { LeaderboardMomentumRow } from "./buildLeaderboardMomentum";

const spainId = "team-spain";
const portugalId = "team-portugal";
const rules = new Map([
  ["round_of_16", 4],
  ["quarterfinalist", 8],
]);

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

function momentum(points: number): LeaderboardMomentumRow {
  return {
    participantId: "p1",
    previousRank: 1,
    currentRank: 1,
    rankChange: 0,
    previousPoints: 100,
    currentPoints: 100 + points,
    recentPointsGained: points,
    isNewEntry: false,
  };
}

const event = parseLatestScoreEventContext(
  {
    match_label: "Portugal 0–1 Spain",
    scoreline: "Portugal 0–1 Spain",
    match_codes: ["M93"],
  },
  { hasValidSnapshot: true },
);

// Spain picker gets +4 match points
{
  const preds = [
    {
      participantId: "winner",
      predictionKind: "quarterfinalist",
      teamId: spainId,
      slotKey: "5",
    },
  ];
  assert.equal(
    computeKnockoutMatchPickPointsDelta(preds, m93Match, rules),
    4,
    "Spain slot pick awards round_of_16 points",
  );
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "winner",
    momentum: momentum(4),
    event,
    predictions: preds,
    matches: [m93Match],
    rulesByKind: rules,
  });
  assert.equal(breakdown?.latestMatchPointsDelta, 4);
  assert.equal(breakdown?.isMixedUpdate, false);
  assert.equal(
    formatLatestMatchScoringLine(momentum(4), event, null, breakdown),
    "Spain def. Portugal: +4",
  );
}

// Portugal picker gets +0 match points even when total delta is +4
{
  const preds = [
    {
      participantId: "loser",
      predictionKind: "quarterfinalist",
      teamId: portugalId,
      slotKey: "5",
    },
  ];
  assert.equal(computeKnockoutMatchPickPointsDelta(preds, m93Match, rules), 0);
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "loser",
    momentum: momentum(4),
    event,
    predictions: preds,
    matches: [m93Match],
    rulesByKind: rules,
  });
  assert.equal(breakdown?.latestMatchPointsDelta, 0);
  assert.equal(breakdown?.isMixedUpdate, true);
  assert.equal(breakdown?.otherScoringDelta, 4);
  assert.equal(
    formatLatestMatchScoringLine(momentum(4), event, null, breakdown),
    "Spain def. Portugal: +0",
  );
  assert.equal(
    formatOtherScoringAdjustmentsLine(breakdown),
    "Other scoring adjustments: +4",
  );
  assert.equal(
    formatRecentPointsDelta(momentum(4), {
      showZero: true,
      latestSuffix: true,
      pointsBreakdown: breakdown,
      event,
    }),
    "(+4 refresh)",
  );
}

// Mixed recompute: +0 match, +4 other — row must not show Spain def. Portugal: +4
{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "loser",
    momentum: momentum(4),
    event,
    predictions: [
      {
        participantId: "loser",
        predictionKind: "quarterfinalist",
        teamId: portugalId,
        slotKey: "5",
      },
    ],
    matches: [m93Match],
    rulesByKind: rules,
  });
  const line = formatLatestMatchScoringLine(momentum(4), event, null, breakdown);
  assert.ok(line?.includes("+0"), "mixed update shows +0 for loser");
  assert.ok(!line?.includes("+4"), "must not label total delta as match delta");
}

// All participants +4 total but mixed match deltas
{
  const spainBreakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "a",
    momentum: momentum(4),
    event,
    predictions: [
      {
        participantId: "a",
        predictionKind: "quarterfinalist",
        teamId: spainId,
        slotKey: "5",
      },
    ],
    matches: [m93Match],
    rulesByKind: rules,
  });
  const portugalBreakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "b",
    momentum: momentum(4),
    event,
    predictions: [
      {
        participantId: "b",
        predictionKind: "quarterfinalist",
        teamId: portugalId,
        slotKey: "5",
      },
    ],
    matches: [m93Match],
    rulesByKind: rules,
  });
  assert.equal(spainBreakdown?.latestMatchPointsDelta, 4);
  assert.equal(portugalBreakdown?.latestMatchPointsDelta, 0);
  assert.equal(spainBreakdown?.latestTotalDelta, 4);
  assert.equal(portugalBreakdown?.latestTotalDelta, 4);
}

console.log("computeLatestMatchPointsBreakdown.selftest.ts: ok");
