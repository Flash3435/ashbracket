/**
 * Run: npx tsx lib/leaderboard/buildViewerLeaderComparison.selftest.ts
 */
import assert from "node:assert/strict";
import { buildViewerLeaderComparison } from "./buildViewerLeaderComparison";
import type { LeaderboardPublicRow } from "../../types/leaderboard";

function row(
  overrides: Partial<LeaderboardPublicRow> & Pick<LeaderboardPublicRow, "participantId" | "displayName" | "totalPoints" | "rank">,
): LeaderboardPublicRow {
  return {
    poolId: "p1",
    poolName: "Pool",
    ...overrides,
  };
}

const trailing = buildViewerLeaderComparison(
  [
    row({ participantId: "a", displayName: "Alice", totalPoints: 20, rank: 1 }),
    row({ participantId: "b", displayName: "Bob", totalPoints: 12, rank: 2 }),
    row({ participantId: "c", displayName: "Cara", totalPoints: 8, rank: 3 }),
  ],
  "c",
);
assert.ok(trailing);
assert.equal(trailing!.status, "trailing");
assert.equal(trailing!.gapToFirst, 12);
assert.match(trailing!.headline, /12 pts behind 1st/);

const soleLeader = buildViewerLeaderComparison(
  [
    row({ participantId: "a", displayName: "Alice", totalPoints: 5, rank: 1 }),
    row({ participantId: "b", displayName: "Bob", totalPoints: 2, rank: 2 }),
  ],
  "a",
);
assert.ok(soleLeader);
assert.equal(soleLeader!.status, "sole_leader");
assert.equal(soleLeader!.headline, "You're leading this pool");

const tiedFirst = buildViewerLeaderComparison(
  [
    row({ participantId: "a", displayName: "Alice", totalPoints: 5, rank: 1 }),
    row({ participantId: "b", displayName: "Bob", totalPoints: 5, rank: 1 }),
    row({ participantId: "c", displayName: "Cara", totalPoints: 1, rank: 3 }),
  ],
  "b",
);
assert.ok(tiedFirst);
assert.equal(tiedFirst!.status, "tied_for_first");
assert.equal(tiedFirst!.headline, "You're tied for 1st");

const allZeroTied = buildViewerLeaderComparison(
  [
    row({ participantId: "a", displayName: "Alice", totalPoints: 0, rank: 1 }),
    row({ participantId: "b", displayName: "Bob", totalPoints: 0, rank: 1 }),
  ],
  "a",
);
assert.ok(allZeroTied);
assert.equal(allZeroTied!.status, "tied_for_first");
assert.match(allZeroTied!.detail, /everyone is still at zero/);

const soloEntry = buildViewerLeaderComparison(
  [row({ participantId: "a", displayName: "Alice", totalPoints: 0, rank: 1 })],
  "a",
);
assert.ok(soloEntry);
assert.equal(soloEntry!.status, "sole_leader");
assert.match(soloEntry!.detail, /only entry in this pool/);

const tiedNonLead = buildViewerLeaderComparison(
  [
    row({ participantId: "a", displayName: "Alice", totalPoints: 10, rank: 1 }),
    row({ participantId: "b", displayName: "Bob", totalPoints: 6, rank: 2 }),
    row({ participantId: "c", displayName: "Cara", totalPoints: 6, rank: 2 }),
  ],
  "c",
);
assert.ok(tiedNonLead);
assert.equal(tiedNonLead!.status, "trailing");
assert.match(tiedNonLead!.detail, /#2 \(tied\)/);

assert.equal(buildViewerLeaderComparison([], "a"), null);
assert.equal(buildViewerLeaderComparison([], null), null);
assert.equal(
  buildViewerLeaderComparison(
    [row({ participantId: "a", displayName: "Alice", totalPoints: 1, rank: 1 })],
    "missing",
  ),
  null,
);

console.log("buildViewerLeaderComparison selftest: ok");
