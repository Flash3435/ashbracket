import assert from "node:assert";
import { buildLeaderboardNameContext, buildParticipantNamePreview } from "./buildNamePreview";

const leaderboardRows = [
  {
    poolId: "pool-1",
    poolName: "Pool",
    participantId: "p1",
    displayName: "Emil",
    totalPoints: 62,
    rank: 1,
  },
  {
    poolId: "pool-1",
    poolName: "Pool",
    participantId: "p2",
    displayName: "Fraser",
    totalPoints: 60,
    rank: 2,
  },
  {
    poolId: "pool-1",
    poolName: "Pool",
    participantId: "p3",
    displayName: "Vinay",
    totalPoints: 59,
    rank: 3,
  },
];

const { leaderboardVisibleParticipantIds, displayNameByParticipantId } =
  buildLeaderboardNameContext(leaderboardRows);

// Names align with leaderboard-visible participant names
{
  const preview = buildParticipantNamePreview({
    participantIds: ["p2", "p1"],
    leaderboardVisibleParticipantIds,
    displayNameByParticipantId,
    limit: 5,
  });
  assert.deepStrictEqual(preview.names, ["Emil", "Fraser"]);
  assert.strictEqual(preview.additionalCount, 0);
}

// Hidden participants omitted
{
  const preview = buildParticipantNamePreview({
    participantIds: ["p2", "hidden", "p3"],
    leaderboardVisibleParticipantIds,
    displayNameByParticipantId,
    limit: 5,
  });
  assert.deepStrictEqual(preview.names, ["Fraser", "Vinay"]);
}

// Additional count works
{
  const preview = buildParticipantNamePreview({
    participantIds: ["p1", "p2", "p3", "p4", "p5", "p6", "p7"],
    leaderboardVisibleParticipantIds: new Set([
      "p1",
      "p2",
      "p3",
      "p4",
      "p5",
      "p6",
      "p7",
    ]),
    displayNameByParticipantId: new Map([
      ["p1", "Emil"],
      ["p2", "Fraser"],
      ["p3", "Vinay"],
      ["p4", "Neal"],
      ["p5", "Dipa"],
      ["p6", "Joel"],
      ["p7", "Alex"],
    ]),
    limit: 3,
  });
  assert.deepStrictEqual(preview.names, ["Alex", "Dipa", "Emil"]);
  assert.strictEqual(preview.additionalCount, 4);
}

console.log("buildNamePreview.selftest.ts: all passed");
