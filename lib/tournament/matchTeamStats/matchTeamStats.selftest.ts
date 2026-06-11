/**
 * Match team stats selftests.
 * Run: npx tsx lib/tournament/matchTeamStats/matchTeamStats.selftest.ts
 */
import assert from "node:assert/strict";
import { MATCH_SCORE_UPDATE_KEYS } from "../matchGoals/buildMatchScoreUpdate";
import {
  buildTeamStatUpsertRows,
  MATCH_TEAM_STAT_ROW_KEYS,
  teamStatsAreEmpty,
} from "./buildTeamStatUpsertRows";
import { deriveTeamStatTotals, goalsForTeamFromMatch, topTeamStatLeaders } from "./deriveTeamStatTotals";
import {
  assertTeamIdsBelongToMatch,
  validateMatchTeamStatsPayload,
} from "./validateMatchTeamStatsPayload";

const editionId = "ed-1";
const matchId = "m-1";
const homeTeamId = "team-home";
const awayTeamId = "team-away";

// 1. valid final score save payload
const validScore = validateMatchTeamStatsPayload({
  homeGoals: 2,
  awayGoals: 1,
  homeYellowCards: null,
  awayYellowCards: null,
  homeRedCards: null,
  awayRedCards: null,
});
assert.equal(validScore.ok, true);

// 2. valid card totals payload
const validCards = validateMatchTeamStatsPayload({
  homeGoals: null,
  awayGoals: null,
  homeYellowCards: 3,
  awayYellowCards: 1,
  homeRedCards: 0,
  awayRedCards: 2,
});
assert.equal(validCards.ok, true);
if (validCards.ok) {
  assert.equal(validCards.value.homeYellowCards, 3);
  assert.equal(validCards.value.awayRedCards, 2);
}

// 3. invalid negative score rejected
assert.equal(
  validateMatchTeamStatsPayload({
    homeGoals: -1,
    awayGoals: 0,
    homeYellowCards: null,
    awayYellowCards: null,
    homeRedCards: null,
    awayRedCards: null,
  }).ok,
  false,
);

// 4. invalid negative yellow/red cards rejected
assert.equal(
  validateMatchTeamStatsPayload({
    homeGoals: null,
    awayGoals: null,
    homeYellowCards: -1,
    awayYellowCards: null,
    homeRedCards: null,
    awayRedCards: null,
  }).ok,
  false,
);
assert.equal(
  validateMatchTeamStatsPayload({
    homeGoals: null,
    awayGoals: null,
    homeYellowCards: null,
    awayYellowCards: null,
    homeRedCards: null,
    awayRedCards: -2,
  }).ok,
  false,
);

// 5. blank optional stat clears value
const blankStats = validateMatchTeamStatsPayload({
  homeGoals: null,
  awayGoals: null,
  homeYellowCards: null,
  awayYellowCards: null,
  homeRedCards: null,
  awayRedCards: null,
});
assert.equal(blankStats.ok, true);
if (blankStats.ok) {
  assert.equal(teamStatsAreEmpty(blankStats.value), true);
  const rows = buildTeamStatUpsertRows({
    editionId,
    matchId,
    homeTeamId,
    awayTeamId,
    stats: blankStats.value,
  });
  assert.equal(rows[0]!.yellow_cards, null);
  assert.equal(rows[1]!.red_cards, null);
}

// 6. team stat rows limited to match home/away team IDs
assert.equal(assertTeamIdsBelongToMatch({ homeTeamId, awayTeamId }).ok, true);
assert.equal(assertTeamIdsBelongToMatch({ homeTeamId: null, awayTeamId }).ok, false);

// 7. score save writes tournament_matches.home_goals / away_goals (via shared helper keys)
assert.ok(MATCH_SCORE_UPDATE_KEYS.includes("home_goals"));
assert.ok(MATCH_SCORE_UPDATE_KEYS.includes("away_goals"));

// 8. stats save writes exactly two team stat rows
if (validCards.ok) {
  const rows = buildTeamStatUpsertRows({
    editionId,
    matchId,
    homeTeamId,
    awayTeamId,
    stats: validCards.value,
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.team_id, homeTeamId);
  assert.equal(rows[1]!.team_id, awayTeamId);
  assert.deepEqual([...MATCH_TEAM_STAT_ROW_KEYS].sort(), Object.keys(rows[0]!).sort());
}

// 9. total goals derived from scores
const totals = deriveTeamStatTotals({
  matches: [
    {
      id: "m1",
      homeTeamId: "A",
      awayTeamId: "B",
      homeGoals: 2,
      awayGoals: 1,
    },
    {
      id: "m2",
      homeTeamId: "A",
      awayTeamId: "C",
      homeGoals: 1,
      awayGoals: 0,
    },
    {
      id: "m3",
      homeTeamId: "D",
      awayTeamId: "E",
      homeGoals: null,
      awayGoals: null,
    },
  ],
  teamStats: [],
});
assert.equal(totals.goalsByTeamId.get("A"), 3);
assert.equal(totals.goalsByTeamId.get("B"), 1);
assert.equal(totals.goalsByTeamId.get("C"), 0);
assert.equal(totals.goalsByTeamId.has("D"), false);
assert.equal(
  goalsForTeamFromMatch(
    { id: "m1", homeTeamId: "A", awayTeamId: "B", homeGoals: 2, awayGoals: 1 },
    "B",
  ),
  1,
);

// 10. yellow/red totals aggregate from team stats
const cardTotals = deriveTeamStatTotals({
  matches: [],
  teamStats: [
    {
      id: "s1",
      editionId,
      matchId: "m1",
      teamId: "A",
      yellowCards: 2,
      redCards: 1,
      source: "manual",
    },
    {
      id: "s2",
      editionId,
      matchId: "m2",
      teamId: "A",
      yellowCards: 1,
      redCards: null,
      source: "manual",
    },
    {
      id: "s3",
      editionId,
      matchId: "m1",
      teamId: "B",
      yellowCards: 0,
      redCards: 2,
      source: "manual",
    },
  ],
});
assert.equal(cardTotals.yellowCardsByTeamId.get("A"), 3);
assert.equal(cardTotals.redCardsByTeamId.get("A"), 1);
assert.equal(cardTotals.redCardsByTeamId.get("B"), 2);
const yellowLeaders = topTeamStatLeaders(cardTotals.yellowCardsByTeamId);
assert.equal(yellowLeaders[0]!.teamId, "A");

// 11. corrections overwrite previous totals idempotently (same upsert keys)
if (validCards.ok) {
  const first = buildTeamStatUpsertRows({
    editionId,
    matchId,
    homeTeamId,
    awayTeamId,
    stats: validCards.value,
  });
  const corrected = buildTeamStatUpsertRows({
    editionId,
    matchId,
    homeTeamId,
    awayTeamId,
    stats: {
      ...validCards.value,
      homeYellowCards: 5,
    },
  });
  assert.equal(first[0]!.match_id, corrected[0]!.match_id);
  assert.equal(first[0]!.team_id, corrected[0]!.team_id);
  assert.equal(corrected[0]!.yellow_cards, 5);
}

// 12. save action does not touch predictions or points ledger
const statKeys = [...MATCH_TEAM_STAT_ROW_KEYS] as string[];
assert.ok(!statKeys.includes("prediction_kind"));
assert.ok(!statKeys.includes("points_delta"));
assert.ok(!statKeys.includes("home_goals"));

console.log("matchTeamStats.selftest.ts: all assertions passed");
