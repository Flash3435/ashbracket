/**
 * Run: npx tsx lib/leaderboard/resolveLeaderboardStandingsSubtitle.selftest.ts
 */
import assert from "node:assert/strict";
import {
  LEADERBOARD_STANDINGS_SUBTITLE_WITH_MOMENTUM,
  LEADERBOARD_STANDINGS_SUBTITLE_WITH_RACE_OUTLOOK,
  resolveLeaderboardStandingsSubtitle,
} from "./leaderboardPageCopy";

assert.equal(
  resolveLeaderboardStandingsSubtitle({
    hasMomentum: true,
    hasRaceOutlook: true,
    participantCount: 12,
  }),
  LEADERBOARD_STANDINGS_SUBTITLE_WITH_MOMENTUM,
  "momentum copy wins when both momentum and race outlook exist",
);

assert.equal(
  resolveLeaderboardStandingsSubtitle({
    hasMomentum: false,
    hasRaceOutlook: true,
    participantCount: 12,
  }),
  LEADERBOARD_STANDINGS_SUBTITLE_WITH_RACE_OUTLOOK,
  "race outlook copy when momentum is unavailable",
);

assert.match(
  resolveLeaderboardStandingsSubtitle({
    hasMomentum: false,
    hasRaceOutlook: false,
    participantCount: 3,
  }),
  /3 entries ranked by awarded points/,
  "default standings copy without momentum or race outlook",
);

assert.doesNotMatch(
  resolveLeaderboardStandingsSubtitle({
    hasMomentum: false,
    hasRaceOutlook: true,
    participantCount: 12,
  }),
  /Arrows show/,
  "no arrow promise when momentum is missing",
);

console.log("resolveLeaderboardStandingsSubtitle.selftest.ts: ok");
