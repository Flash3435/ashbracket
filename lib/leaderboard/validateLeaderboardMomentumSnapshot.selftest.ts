/**
 * Run: npx tsx lib/leaderboard/validateLeaderboardMomentumSnapshot.selftest.ts
 */
import assert from "node:assert/strict";
import { buildLeaderboardMomentum, pickBiggestMovers } from "./buildLeaderboardMomentum";
import {
  parsePreviousStandingsFromMetadata,
  STANDINGS_CAPTURE_VERSION,
  STANDINGS_CAPTURE_VERSION_KEY,
  validateLeaderboardMomentumSnapshot,
} from "./validateLeaderboardMomentumSnapshot";

const vinayId = "f943e7b4-e753-432c-ab4c-19490f0d05a3";

const currentRows = Array.from({ length: 42 }, (_, index) => {
  const rank = index + 1;
  if (rank === 19) {
    return { participantId: vinayId, displayName: "Vinay Menon", totalPoints: 75, rank: 19 };
  }
  return {
    participantId: `p-${rank}`,
    displayName: `Player ${rank}`,
    totalPoints: Math.max(0, 90 - rank),
    rank,
  };
});

const truncatedPrevious = currentRows.map((row) => ({
  participant_id: row.participantId,
  total_points: row.participantId === vinayId ? 0 : row.totalPoints,
}));

const badMetadata = {
  has_previous_snapshot: true,
  previous_standings: truncatedPrevious,
};

const invalid = validateLeaderboardMomentumSnapshot({
  metadata: badMetadata,
  currentRows,
});
assert.equal(invalid.valid, false);
assert.equal(invalid.reason, "truncated_or_invalid_baseline");

const momentumFromBad = buildLeaderboardMomentum({
  currentRows,
  previousRows: parsePreviousStandingsFromMetadata(badMetadata),
});
const vinayMomentum = momentumFromBad.rows.find(
  (row) => row.participantId === vinayId,
);
assert.ok((vinayMomentum?.rankChange ?? 0) >= 10, "bad snapshot shows large upward movement");
assert.equal(
  pickBiggestMovers(momentumFromBad)[0]?.participantId,
  vinayId,
  "bad snapshot would make Vinay biggest mover",
);

const validMetadata = {
  ...badMetadata,
  [STANDINGS_CAPTURE_VERSION_KEY]: STANDINGS_CAPTURE_VERSION,
};
assert.equal(
  validateLeaderboardMomentumSnapshot({
    metadata: validMetadata,
    currentRows,
  }).valid,
  true,
  "versioned snapshots are trusted",
);

const neutral = buildLeaderboardMomentum({
  currentRows,
  previousRows: null,
});
assert.equal(neutral.hasPreviousSnapshot, false);
assert.equal(pickBiggestMovers(neutral).length, 0);

console.log("validateLeaderboardMomentumSnapshot selftest: ok");
