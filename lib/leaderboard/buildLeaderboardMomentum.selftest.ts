/**
 * Run: npx tsx lib/leaderboard/buildLeaderboardMomentum.selftest.ts
 */
import assert from "node:assert/strict";
import {
  assignCompetitionRanks,
  buildLeaderboardMomentum,
  mapLeaderboardMomentumByParticipantId,
  pickBiggestMovers,
} from "./buildLeaderboardMomentum";
import {
  formatExpandedMomentumContext,
  formatPointsWithRecentDelta,
  formatRankMovementIndicator,
  formatRecentPointsDelta,
} from "./leaderboardMomentumDisplay";

// RANK-style ties: 1, 1, 3
{
  const ranks = assignCompetitionRanks([
    { participantId: "a", totalPoints: 10 },
    { participantId: "b", totalPoints: 10 },
    { participantId: "c", totalPoints: 5 },
  ]);
  assert.deepEqual(
    [ranks.get("a"), ranks.get("b"), ranks.get("c")],
    [1, 1, 3],
  );
}

// moved up
{
  const momentum = buildLeaderboardMomentum({
    currentRows: [
      { participantId: "emil", totalPoints: 78, rank: 1 },
      { participantId: "fraser", totalPoints: 76, rank: 2 },
      { participantId: "joel", totalPoints: 70, rank: 3 },
    ],
    previousRows: [
      { participantId: "emil", totalPoints: 78 },
      { participantId: "fraser", totalPoints: 72 },
      { participantId: "joel", totalPoints: 70 },
    ],
  });
  assert.equal(momentum.hasPreviousSnapshot, true);
  const fraser = momentum.rows.find((row) => row.participantId === "fraser");
  assert.equal(fraser?.rankChange, 0);
  assert.equal(fraser?.recentPointsGained, 4);
  const joel = momentum.rows.find((row) => row.participantId === "joel");
  assert.equal(joel?.rankChange, 0);
  assert.equal(joel?.recentPointsGained, 0);
}

// rank jump when points overtake others
{
  const momentum = buildLeaderboardMomentum({
    currentRows: [
      { participantId: "joel", totalPoints: 82, rank: 1 },
      { participantId: "fraser", totalPoints: 80, rank: 2 },
      { participantId: "emil", totalPoints: 78, rank: 3 },
      { participantId: "vinay", totalPoints: 76, rank: 4 },
    ],
    previousRows: [
      { participantId: "fraser", totalPoints: 80 },
      { participantId: "emil", totalPoints: 78 },
      { participantId: "vinay", totalPoints: 76 },
      { participantId: "joel", totalPoints: 74 },
    ],
  });
  const joel = momentum.rows.find((row) => row.participantId === "joel");
  assert.equal(joel?.rankChange, 3);
  assert.equal(joel?.recentPointsGained, 8);
  assert.equal(formatRankMovementIndicator(joel), "↑3");
}

// moved down when others pass
{
  const momentum = buildLeaderboardMomentum({
    currentRows: [
      { participantId: "emil", totalPoints: 80, rank: 1 },
      { participantId: "fraser", totalPoints: 78, rank: 2 },
      { participantId: "vinay", totalPoints: 70, rank: 3 },
    ],
    previousRows: [
      { participantId: "vinay", totalPoints: 70 },
      { participantId: "fraser", totalPoints: 68 },
      { participantId: "emil", totalPoints: 65 },
    ],
  });
  const vinay = momentum.rows.find((row) => row.participantId === "vinay");
  assert.equal(vinay?.rankChange, -2);
  assert.equal(vinay?.recentPointsGained, 0);
  assert.equal(formatRankMovementIndicator(vinay), "↓2");
  const emil = momentum.rows.find((row) => row.participantId === "emil");
  assert.equal(emil?.rankChange, 2);
}

// unchanged rank and points
{
  const momentum = buildLeaderboardMomentum({
    currentRows: [{ participantId: "emil", totalPoints: 78, rank: 1 }],
    previousRows: [{ participantId: "emil", totalPoints: 78 }],
  });
  const emil = momentum.rows[0];
  assert.equal(emil?.rankChange, 0);
  assert.equal(emil?.recentPointsGained, 0);
  assert.equal(formatRankMovementIndicator(emil), "→");
  assert.equal(formatRecentPointsDelta(emil, { showZero: true }), "(+0)");
}

// tied rank movement
{
  const momentum = buildLeaderboardMomentum({
    currentRows: [
      { participantId: "a", totalPoints: 10, rank: 1 },
      { participantId: "b", totalPoints: 10, rank: 1 },
      { participantId: "c", totalPoints: 8, rank: 3 },
    ],
    previousRows: [
      { participantId: "a", totalPoints: 9 },
      { participantId: "b", totalPoints: 10 },
      { participantId: "c", totalPoints: 8 },
    ],
  });
  const a = momentum.rows.find((row) => row.participantId === "a");
  const b = momentum.rows.find((row) => row.participantId === "b");
  assert.equal(a?.rankChange, 1);
  assert.equal(b?.rankChange, 0);
}

// no previous snapshot
{
  const momentum = buildLeaderboardMomentum({
    currentRows: [{ participantId: "emil", totalPoints: 10, rank: 1 }],
    previousRows: null,
  });
  assert.equal(momentum.hasPreviousSnapshot, false);
  assert.equal(momentum.rows.length, 0);
  assert.equal(
    mapLeaderboardMomentumByParticipantId(momentum).size,
    0,
  );
  assert.equal(
    formatPointsWithRecentDelta(10, null),
    "10 pts",
  );
}

// new entry
{
  const momentum = buildLeaderboardMomentum({
    currentRows: [{ participantId: "newbie", totalPoints: 4, rank: 4 }],
    previousRows: [{ participantId: "emil", totalPoints: 10 }],
  });
  const newbie = momentum.rows[0];
  assert.equal(newbie?.isNewEntry, true);
  assert.equal(formatRankMovementIndicator(newbie), "NEW");
}

// do not show negative points gained
{
  const momentum = buildLeaderboardMomentum({
    currentRows: [{ participantId: "emil", totalPoints: 70, rank: 2 }],
    previousRows: [{ participantId: "emil", totalPoints: 72 }],
  });
  assert.equal(momentum.rows[0]?.recentPointsGained, 0);
  assert.equal(formatRecentPointsDelta(momentum.rows[0]), null);
}

// biggest movers card picks largest absolute movement
{
  const momentum = buildLeaderboardMomentum({
    currentRows: [
      { participantId: "joel", totalPoints: 82, rank: 1 },
      { participantId: "fraser", totalPoints: 80, rank: 2 },
      { participantId: "emil", totalPoints: 78, rank: 3 },
      { participantId: "vinay", totalPoints: 76, rank: 4 },
    ],
    previousRows: [
      { participantId: "fraser", totalPoints: 80 },
      { participantId: "emil", totalPoints: 78 },
      { participantId: "vinay", totalPoints: 76 },
      { participantId: "joel", totalPoints: 74 },
    ],
  });
  const movers = pickBiggestMovers(momentum, 3);
  assert.equal(movers.length, 3);
  assert.equal(movers[0]?.participantId, "joel");
  assert.equal(movers[0]?.rankChange, 3);
  assert.equal(movers.some((row) => row.participantId === "fraser" && row.rankChange === -1), true);
}

// uniform +4 with ties: rank arrows stay neutral (ordinal position must not drive movement)
{
  const momentum = buildLeaderboardMomentum({
    currentRows: [
      { participantId: "neal", totalPoints: 123, rank: 5 },
      { participantId: "winner", totalPoints: 123, rank: 5 },
      { participantId: "joel", totalPoints: 122, rank: 7 },
      { participantId: "sanjay", totalPoints: 122, rank: 7 },
      { participantId: "yellow", totalPoints: 122, rank: 7 },
    ],
    previousRows: [
      { participantId: "neal", totalPoints: 119 },
      { participantId: "winner", totalPoints: 119 },
      { participantId: "joel", totalPoints: 118 },
      { participantId: "sanjay", totalPoints: 118 },
      { participantId: "yellow", totalPoints: 118 },
    ],
  });
  for (const row of momentum.rows) {
    assert.equal(row.recentPointsGained, 4, `${row.participantId} points delta`);
    assert.equal(row.rankChange, 0, `${row.participantId} rank change`);
    assert.equal(formatRankMovementIndicator(row), "→", `${row.participantId} arrow`);
  }
  assert.equal(pickBiggestMovers(momentum).length, 0);
}

// participant-specific deltas with mixed movement
{
  const momentum = buildLeaderboardMomentum({
    currentRows: [
      { participantId: "a", totalPoints: 81, rank: 1 },
      { participantId: "b", totalPoints: 80, rank: 2 },
      { participantId: "c", totalPoints: 75, rank: 3 },
    ],
    previousRows: [
      { participantId: "a", totalPoints: 77 },
      { participantId: "b", totalPoints: 80 },
      { participantId: "c", totalPoints: 73 },
    ],
  });
  const a = momentum.rows.find((row) => row.participantId === "a");
  const b = momentum.rows.find((row) => row.participantId === "b");
  const c = momentum.rows.find((row) => row.participantId === "c");
  assert.equal(a?.recentPointsGained, 4);
  assert.equal(b?.recentPointsGained, 0);
  assert.equal(c?.recentPointsGained, 2);
  assert.equal(a?.rankChange, 1);
  assert.equal(b?.rankChange, -1);
  assert.equal(c?.rankChange, 0);
}

// expanded movement copy
{
  assert.match(
    formatExpandedMomentumContext({
      participantId: "fraser",
      previousRank: 4,
      currentRank: 2,
      rankChange: 2,
      previousPoints: 72,
      currentPoints: 76,
      recentPointsGained: 4,
      isNewEntry: false,
    })!,
    /Moved up 2 places/,
  );
  assert.match(
    formatExpandedMomentumContext({
      participantId: "emil",
      previousRank: 1,
      currentRank: 1,
      rankChange: 0,
      previousPoints: 78,
      currentPoints: 78,
      recentPointsGained: 0,
      isNewEntry: false,
    })!,
    /No leaderboard movement/,
  );
}

console.log("buildLeaderboardMomentum.selftest.ts: ok");
