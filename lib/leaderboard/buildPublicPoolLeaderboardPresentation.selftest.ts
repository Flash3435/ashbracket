/**
 * Run: npx tsx lib/leaderboard/buildPublicPoolLeaderboardPresentation.selftest.ts
 */
import assert from "node:assert/strict";
import {
  buildPublicPoolLeaderboardPresentation,
  formatPointsGap,
  poolLeaderboardSummaryCards,
} from "./buildPublicPoolLeaderboardPresentation";
import type { LeaderboardPublicRow } from "../../types/leaderboard";

const rows: LeaderboardPublicRow[] = [
  {
    poolId: "p1",
    poolName: "Pool",
    participantId: "a",
    displayName: "Alice",
    totalPoints: 10,
    rank: 1,
  },
  {
    poolId: "p1",
    poolName: "Pool",
    participantId: "b",
    displayName: "Bob",
    totalPoints: 7,
    rank: 2,
  },
  {
    poolId: "p1",
    poolName: "Pool",
    participantId: "c",
    displayName: "Cara",
    totalPoints: 0,
    rank: 3,
  },
];

const pres = buildPublicPoolLeaderboardPresentation(rows);
assert.equal(pres.leader?.displayName, "Alice");
assert.equal(pres.pointsGapToSecond, 3);
assert.equal(pres.participantsWithPointsCount, 2);
assert.equal(formatPointsGap(3), "3 ahead of 2nd");

const tied: LeaderboardPublicRow[] = [
  { ...rows[0]!, rank: 1, totalPoints: 5, participantId: "x", displayName: "X" },
  { ...rows[0]!, rank: 1, totalPoints: 5, participantId: "y", displayName: "Y" },
];
const tiedPres = buildPublicPoolLeaderboardPresentation(tied);
assert.equal(tiedPres.leaderTiedCount, 2);
assert.equal(tiedPres.pointsGapToSecond, null);

const cards = poolLeaderboardSummaryCards(pres, {
  registeredCount: 3,
  paidCount: 2,
  entryFeeCents: 2500,
  prizePoolCents: 5000,
});
assert.match(cards.leaderLine, /Alice/);

console.log("buildPublicPoolLeaderboardPresentation selftest: ok");
