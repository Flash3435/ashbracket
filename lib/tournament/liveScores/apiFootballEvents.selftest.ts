/**
 * API-Football fixture event normalization selftests.
 * Run: npx tsx lib/tournament/liveScores/apiFootballEvents.selftest.ts
 */
import assert from "node:assert/strict";
import { normalizeApiFootballFixtureEvents } from "./apiFootballEvents";

const teams = {
  homeTeamName: "Mexico",
  awayTeamName: "South Africa",
  homeFifaCode: "MEX" as const,
  awayFifaCode: "RSA" as const,
};

const normalized = normalizeApiFootballFixtureEvents(
  [
    { team: { name: "Mexico" }, type: "Card", detail: "Yellow Card" },
    { team: { name: "South Africa" }, type: "Card", detail: "Red Card" },
    { team: { name: "South Africa" }, type: "Card", detail: "Yellow Red Card" },
    { team: { name: "Mexico" }, type: "Goal", detail: "Normal Goal" },
    { team: { name: "Mexico" }, type: "Var", detail: "Goal cancelled" },
  ],
  teams,
);

assert.equal(normalized.homeYellowCards, 1);
assert.equal(normalized.awayYellowCards, 0);
assert.equal(normalized.awayRedCards, 2, "Red + Yellow-Red both count as red");
assert.equal(normalized.homeGoalEvents, 1);
assert.equal(normalized.awayGoalEvents, 0);

console.log("apiFootballEvents.selftest.ts: all assertions passed");
