/**
 * Match goal entry + derivation selftests.
 * Run: npx tsx lib/tournament/matchGoals/matchGoals.selftest.ts
 */
import assert from "node:assert/strict";
import {
  buildMatchScoreUpdate,
  MATCH_GOAL_ROW_KEYS,
  MATCH_SCORE_UPDATE_KEYS,
} from "./buildMatchScoreUpdate";
import {
  derivePlayerGoalTotals,
  deriveTopScorerLeaderboard,
} from "./deriveGoalTotals";
import { normalizePlayerNameForGoals } from "./normalizePlayerName";
import type { MatchGoalRecord } from "./types";
import { validateMatchGoalPayload } from "./validateMatchGoalPayload";

function goal(partial: Partial<MatchGoalRecord> & Pick<MatchGoalRecord, "id" | "playerName">): MatchGoalRecord {
  return {
    editionId: "ed-1",
    matchId: "m-1",
    teamId: "t-1",
    minute: null,
    stoppageMinute: null,
    isOwnGoal: false,
    ...partial,
  };
}

// 1. valid goal payload
const valid = validateMatchGoalPayload({
  playerName: "  Lionel Messi ",
  teamId: "team-arg",
  minute: 45,
  stoppageMinute: 2,
  isOwnGoal: false,
});
assert.equal(valid.ok, true);
if (valid.ok) {
  assert.equal(valid.value.playerName, "Lionel Messi");
  assert.equal(valid.value.minute, 45);
  assert.equal(valid.value.stoppageMinute, 2);
}

// 2. blank player rejected
assert.equal(
  validateMatchGoalPayload({
    playerName: "   ",
    teamId: null,
    minute: null,
    stoppageMinute: null,
    isOwnGoal: false,
  }).ok,
  false,
);

// 3. invalid minute rejected
assert.equal(
  validateMatchGoalPayload({
    playerName: "Player",
    teamId: null,
    minute: 131,
    stoppageMinute: null,
    isOwnGoal: false,
  }).ok,
  false,
);
assert.equal(
  validateMatchGoalPayload({
    playerName: "Player",
    teamId: null,
    minute: -1,
    stoppageMinute: null,
    isOwnGoal: false,
  }).ok,
  false,
);

// 4. multiple goals by same player allowed
const dupGoals: MatchGoalRecord[] = [
  goal({ id: "g1", playerName: "Harry Kane", matchId: "m1" }),
  goal({ id: "g2", playerName: "Harry Kane", matchId: "m2" }),
  goal({ id: "g3", playerName: "Harry Kane", matchId: "m3" }),
];
const dupTotals = derivePlayerGoalTotals(dupGoals);
assert.equal(dupTotals.length, 1);
assert.equal(dupTotals[0]!.goals, 3);

// 5. own goal excluded from player scoring totals
const withOg: MatchGoalRecord[] = [
  goal({ id: "g1", playerName: "John Smith", isOwnGoal: false }),
  goal({ id: "g2", playerName: "John Smith", isOwnGoal: true }),
];
assert.equal(derivePlayerGoalTotals(withOg)[0]!.goals, 1);

// 6. top scorer totals derived correctly
const mixed: MatchGoalRecord[] = [
  goal({ id: "a1", playerName: "Mbappé", teamId: "fra" }),
  goal({ id: "a2", playerName: "Mbappe", teamId: "fra" }),
  goal({ id: "b1", playerName: "Kane", teamId: "eng" }),
  goal({ id: "c1", playerName: "Other", teamId: "usa", isOwnGoal: true }),
];
assert.equal(normalizePlayerNameForGoals("Mbappé"), normalizePlayerNameForGoals("Mbappe"));
const board = deriveTopScorerLeaderboard(mixed);
assert.equal(board[0]!.goals, 2);
assert.match(board[0]!.normalizedName, /mbapp/);
assert.equal(board[1]!.goals, 1);

// 7. score save updates only home/away goals (+ winner/status)
const scoreBuilt = buildMatchScoreUpdate({
  homeTeamId: "home",
  awayTeamId: "away",
  homeGoals: 2,
  awayGoals: 1,
  currentStatus: "scheduled",
});
assert.equal(scoreBuilt.ok, true);
if (scoreBuilt.ok) {
  assert.deepEqual(Object.keys(scoreBuilt.update).sort(), [...MATCH_SCORE_UPDATE_KEYS].sort());
  assert.equal(scoreBuilt.update.home_goals, 2);
  assert.equal(scoreBuilt.update.away_goals, 1);
  assert.equal(scoreBuilt.update.winner_team_id, "home");
  assert.equal(scoreBuilt.update.status, "finished");
}

const clearBuilt = buildMatchScoreUpdate({
  homeTeamId: "home",
  awayTeamId: "away",
  homeGoals: null,
  awayGoals: null,
  currentStatus: "finished",
});
assert.equal(clearBuilt.ok, true);
if (clearBuilt.ok) {
  assert.equal(clearBuilt.update.home_goals, null);
  assert.equal(clearBuilt.update.away_goals, null);
  assert.equal(clearBuilt.update.winner_team_id, null);
  assert.equal(clearBuilt.update.status, "scheduled");
}

// 8. goal save does not touch predictions or points ledger (payload isolation)
const goalPayloadKeys = [...MATCH_GOAL_ROW_KEYS] as string[];
assert.ok(!goalPayloadKeys.includes("home_goals"));
assert.ok(!goalPayloadKeys.includes("prediction_kind"));
assert.ok(!goalPayloadKeys.includes("points_delta"));

// 9. delete goal updates derived totals
const beforeDelete = derivePlayerGoalTotals([
  goal({ id: "x1", playerName: "Striker" }),
  goal({ id: "x2", playerName: "Striker" }),
]);
const afterDelete = derivePlayerGoalTotals([goal({ id: "x1", playerName: "Striker" })]);
assert.equal(beforeDelete[0]!.goals, 2);
assert.equal(afterDelete[0]!.goals, 1);

console.log("matchGoals.selftest.ts: all assertions passed");
