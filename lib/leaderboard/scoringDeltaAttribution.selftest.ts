/**
 * Run: npx tsx lib/leaderboard/scoringDeltaAttribution.selftest.ts
 */
import assert from "node:assert/strict";
import {
  attributeTournamentBonusResidual,
  buildTournamentBonusAttributions,
  formatScoringDeltaAttributionLabel,
  presentScoringDeltaAttributions,
} from "./scoringDeltaAttribution";
import { buildLatestPointsBreakdownForParticipant } from "./computeLatestMatchPointsBreakdown";
import {
  formatLatestMatchScoringLine,
  formatLatestScoringComponentLines,
  formatLeaderboardLatestImpactSummary,
  formatOtherScoringAdjustmentsLine,
} from "./leaderboardBracketImpactDisplay";
import { formatRecentPointsDelta } from "./leaderboardMomentumDisplay";
import { parseLatestScoreEventContext } from "./parseLatestScoreEventContext";
import type { LeaderboardMomentumRow } from "./buildLeaderboardMomentum";
import type { BracketImpactParticipantRow } from "@/lib/poolActivity/scoreImpact/buildBracketImpact";

const franceId = "team-france";
const englandId = "team-england";
const qatarId = "team-qatar";

function momentum(
  participantId: string,
  points: number,
  previousPoints = 206,
): LeaderboardMomentumRow {
  return {
    participantId,
    previousRank: 5,
    currentRank: 4,
    rankChange: 1,
    previousPoints,
    currentPoints: previousPoints + points,
    recentPointsGained: points,
    isNewEntry: false,
  };
}

const englandInferredEvent = parseLatestScoreEventContext(
  {
    match_label: "France 4–6 England",
    scoreline: "France 4–6 England",
    match_codes: ["M103"],
  },
  { hasValidSnapshot: true },
);

const bonusRefreshEvent = parseLatestScoreEventContext(
  {
    match_codes: [],
    trigger: "admin_result_edit",
  },
  { hasValidSnapshot: true },
);

const m103NoScoringKind = {
  matchCode: "M103",
  stageCode: "third_place",
  groupCode: null,
  homeTeamId: franceId,
  awayTeamId: englandId,
  winnerTeamId: englandId,
  scoringResultKind: null,
  scoringSlotKey: null,
};

const m99EnglandProgression = {
  matchCode: "M99",
  stageCode: "quarterfinal",
  groupCode: null,
  homeTeamId: "team-norway",
  awayTeamId: englandId,
  winnerTeamId: englandId,
  scoringResultKind: "semifinalist",
  scoringSlotKey: "3",
};

const englandProgressionEvent = parseLatestScoreEventContext(
  {
    match_label: "Norway 1–2 England",
    scoreline: "Norway 1–2 England",
    match_codes: ["M99"],
  },
  { hasValidSnapshot: true },
);

const rules = new Map([
  ["semifinalist", 16],
  ["quarterfinalist", 8],
  ["bonus_pick:most_goals", 25],
  ["bonus_pick:most_red_cards", 10],
  ["bonus_pick:most_yellow_cards", 10],
  ["champion", 30],
]);

const publishedWinners = new Map<string, Set<string>>([
  ["most_goals", new Set([franceId, englandId])],
  ["most_red_cards", new Set([qatarId])],
]);

const pointsByBonusKey = new Map([
  ["most_goals", 25],
  ["most_red_cards", 10],
  ["most_yellow_cards", 10],
]);

const upsetImpact: BracketImpactParticipantRow = {
  participantId: "seema",
  displayName: "Seema",
  livePathsBefore: 2,
  livePathsAfter: 2,
  livePathsDelta: 0,
  championAliveBefore: true,
  championAliveAfter: true,
  finalistPathAliveBefore: false,
  finalistPathAliveAfter: false,
  semifinalistPathAliveBefore: false,
  semifinalistPathAliveAfter: false,
  pickedUpsetWinner: true,
  pickedEliminatedTeam: false,
  upsetImpact: "benefited",
};

// --- Helper: residual attribution ---
{
  const attr = attributeTournamentBonusResidual({
    residual: 35,
    earnedByKey: new Map([
      ["most_goals", 25],
      ["most_red_cards", 10],
    ]),
  });
  assert.equal(attr.attributedTotal, 35);
  assert.equal(attr.attributedByKey.most_goals, 25);
  assert.equal(attr.attributedByKey.most_red_cards, 10);
  assert.equal(attr.remaining, 0);
}

// --- 1. Tournament bonus only (Fampool Seema) ---
{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "seema",
    momentum: momentum("seema", 25, 206),
    event: bonusRefreshEvent,
    predictions: [
      {
        participantId: "seema",
        predictionKind: "bonus_pick",
        teamId: franceId,
        slotKey: "most_goals",
        bonusKey: "most_goals",
      },
    ],
    matches: [],
    rulesByKind: rules,
    publishedWinnerTeamIdsByBonusKey: publishedWinners,
    pointsByBonusKey,
  });
  assert.equal(breakdown?.tournamentBonusDeltaByKey.most_goals, 25);
  assert.equal(breakdown?.otherScoringDelta, null);
  assert.equal(breakdown?.latestMatchPointsDelta, null);

  const latest = formatLatestMatchScoringLine(
    momentum("seema", 25, 206),
    bonusRefreshEvent,
    upsetImpact,
    breakdown,
  );
  assert.equal(latest, "Latest: Most Goals bonus +25");
  assert.ok(!latest?.toLowerCase().includes("england"));
  assert.ok(!latest?.toLowerCase().includes("upset"));
  assert.equal(formatOtherScoringAdjustmentsLine(breakdown), null);
  assert.equal(
    formatRecentPointsDelta(momentum("seema", 25, 206), {
      latestSuffix: true,
      pointsBreakdown: breakdown,
      event: bonusRefreshEvent,
    }),
    "(+25 since last update)",
  );
}

// --- Fampool regression: inferred England match must not steal bonus label ---
{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "seema",
    momentum: momentum("seema", 25, 206),
    event: englandInferredEvent,
    predictions: [
      {
        participantId: "seema",
        predictionKind: "bonus_pick",
        teamId: franceId,
        slotKey: "most_goals",
        bonusKey: "most_goals",
      },
    ],
    matches: [m103NoScoringKind],
    rulesByKind: rules,
    publishedWinnerTeamIdsByBonusKey: publishedWinners,
    pointsByBonusKey,
  });
  // M103 has no scoring_result_kind → match attribution null; residual → Most Goals.
  assert.equal(breakdown?.latestMatchPointsDelta, null);
  assert.equal(breakdown?.tournamentBonusDeltaByKey.most_goals, 25);

  const latest = formatLatestMatchScoringLine(
    momentum("seema", 25, 206),
    englandInferredEvent,
    upsetImpact,
    breakdown,
  );
  assert.equal(latest, "Latest: Most Goals bonus +25");
  assert.ok(!latest?.toLowerCase().includes("england"));
  assert.ok(!latest?.toLowerCase().includes("upset"));
}

// --- 2. Multiple bonuses ---
{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "joel",
    momentum: momentum("joel", 35, 226),
    event: bonusRefreshEvent,
    predictions: [
      {
        participantId: "joel",
        predictionKind: "bonus_pick",
        teamId: englandId,
        slotKey: "most_goals",
        bonusKey: "most_goals",
      },
      {
        participantId: "joel",
        predictionKind: "bonus_pick",
        teamId: qatarId,
        slotKey: "most_red_cards",
        bonusKey: "most_red_cards",
      },
    ],
    matches: [],
    rulesByKind: rules,
    publishedWinnerTeamIdsByBonusKey: publishedWinners,
    pointsByBonusKey,
  });
  assert.equal(breakdown?.tournamentBonusDelta, 35);
  const summary = formatLeaderboardLatestImpactSummary({
    totalPoints: 261,
    momentum: momentum("joel", 35, 226),
    event: bonusRefreshEvent,
    pointsBreakdown: breakdown,
  });
  assert.equal(summary.latestLine, "Latest: Tournament bonuses +35");
  assert.deepEqual(summary.componentLines, [
    "Most Goals bonus +25",
    "Most Red Cards bonus +10",
  ]);
  assert.ok(!summary.latestLine?.toLowerCase().includes("england"));
}

// --- 3. Match progression only ---
{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "p",
    momentum: momentum("p", 8, 100),
    event: englandProgressionEvent,
    predictions: [
      {
        participantId: "p",
        predictionKind: "semifinalist",
        teamId: englandId,
        slotKey: "3",
      },
    ],
    matches: [m99EnglandProgression],
    rulesByKind: rules,
  });
  assert.equal(breakdown?.latestMatchPointsDelta, 8);
  assert.equal(
    formatLatestMatchScoringLine(
      momentum("p", 8, 100),
      englandProgressionEvent,
      null,
      breakdown,
    ),
    "England def. Norway: +8",
  );
}

// --- 4. Match plus bonus ---
{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "mix",
    momentum: momentum("mix", 33, 100),
    event: englandProgressionEvent,
    predictions: [
      {
        participantId: "mix",
        predictionKind: "semifinalist",
        teamId: englandId,
        slotKey: "3",
      },
      {
        participantId: "mix",
        predictionKind: "bonus_pick",
        teamId: franceId,
        slotKey: "most_goals",
        bonusKey: "most_goals",
      },
    ],
    matches: [m99EnglandProgression],
    rulesByKind: rules,
    publishedWinnerTeamIdsByBonusKey: publishedWinners,
    pointsByBonusKey,
  });
  assert.equal(breakdown?.latestMatchPointsDelta, 8);
  assert.equal(breakdown?.tournamentBonusDeltaByKey.most_goals, 25);
  const summary = formatLeaderboardLatestImpactSummary({
    totalPoints: 133,
    momentum: momentum("mix", 33, 100),
    event: englandProgressionEvent,
    pointsBreakdown: breakdown,
  });
  assert.equal(summary.latestLine, "Latest scoring: +33");
  assert.ok(summary.componentLines.some((l) => l.includes("Most Goals")));
  assert.ok(summary.componentLines.some((l) => /Match progression \+8/.test(l)));
  assert.ok(!summary.latestLine?.toLowerCase().includes("upset"));
}

// --- 5. Champion only ---
{
  const presentation = presentScoringDeltaAttributions({
    attributions: [
      { category: "champion", points: 30, label: "Champion pick" },
    ],
    totalDelta: 30,
  });
  assert.equal(presentation.latestLine, "Latest: Champion pick +30");
}

// --- 6. Manual adjustment ---
{
  assert.equal(
    formatScoringDeltaAttributionLabel({
      category: "manual_adjustment",
      points: 5,
      label: "",
    }),
    "Manual scoring adjustment +5",
  );
  const presentation = presentScoringDeltaAttributions({
    attributions: [
      { category: "manual_adjustment", points: 5, label: "" },
    ],
    totalDelta: 5,
  });
  assert.equal(presentation.latestLine, "Latest: Manual scoring adjustment +5");
}

// --- 7. Unknown legacy row ---
{
  const presentation = presentScoringDeltaAttributions({
    attributions: [{ category: "unknown", points: 12, label: "" }],
    totalDelta: 12,
    matchContext: {
      matchupShortLabel: "England def. France",
      winnerTeamName: "England",
      eventKind: "single_match",
    },
  });
  assert.equal(presentation.latestLine, "Latest: Scoring adjustment +12");
  assert.ok(!presentation.latestLine?.includes("England"));
}

// --- 8. Negative correction / bonus removal ---
{
  assert.equal(
    formatScoringDeltaAttributionLabel({
      category: "most_goals",
      points: -25,
      label: "",
    }),
    "Most Goals bonus removed −25",
  );
  const attr = attributeTournamentBonusResidual({
    residual: -25,
    earnedByKey: new Map([["most_goals", -25]]),
  });
  assert.equal(attr.attributedByKey.most_goals, -25);
  assert.deepEqual(buildTournamentBonusAttributions(attr.attributedByKey), [
    {
      category: "most_goals",
      points: -25,
      label: "Most Goals bonus removed −25",
      detail: undefined,
    },
  ]);
}

// --- 9. Idempotent recompute (no delta) ---
{
  const breakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "seema",
    momentum: momentum("seema", 0, 231),
    event: bonusRefreshEvent,
    predictions: [
      {
        participantId: "seema",
        predictionKind: "bonus_pick",
        teamId: franceId,
        slotKey: "most_goals",
        bonusKey: "most_goals",
      },
    ],
    matches: [],
    rulesByKind: rules,
    publishedWinnerTeamIdsByBonusKey: publishedWinners,
    pointsByBonusKey,
  });
  assert.equal(
    formatLatestMatchScoringLine(
      momentum("seema", 0, 231),
      bonusRefreshEvent,
      null,
      breakdown,
    ),
    null,
  );
  assert.deepEqual(
    formatLatestScoringComponentLines(breakdown, momentum("seema", 0, 231), bonusRefreshEvent),
    [],
  );
}

// admin_result_edit classifies as scoring_refresh (not a match)
assert.equal(bonusRefreshEvent.eventKind, "scoring_refresh");

console.log("scoringDeltaAttribution.selftest.ts: ok");
