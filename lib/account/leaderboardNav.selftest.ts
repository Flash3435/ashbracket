import {
  buildPoolStandingsFromLedger,
  LEADERBOARD_AWARDED_POINTS_NOTE,
} from "../leaderboard/buildPoolStandingsFromLedger";
import {
  leaderboardHrefForParticipantPool,
  publicLeaderboardHrefForPool,
} from "../pool/publicLeaderboardHref";
import { loadSiteHeaderLeaderboardNav } from "./loadSiteHeaderLeaderboardNav";

let failed = 0;

function t(condition: boolean, message: string): void {
  if (!condition) {
    failed += 1;
    console.error("FAIL:", message);
  }
}

t(
  publicLeaderboardHrefForPool({ id: "pool-123", isPublic: true } as never) ===
    "/pool/pool-123" ||
    publicLeaderboardHrefForPool({ id: "pool-123", isPublic: true } as never) ===
      "/pool/pool-123",
  "public pools get /pool/{id}",
);

t(
  publicLeaderboardHrefForPool({ id: "pool-456", isPublic: false } as never) ===
    null ||
    publicLeaderboardHrefForPool({ id: "pool-456", isPublic: false } as never) ===
      null,
  "private pools do not get public href",
);

t(
  leaderboardHrefForParticipantPool({
    poolId: "pool-1",
    isPublic: true,
    participantId: "part-1",
  }).startsWith("/pool/pool-1"),
  "participant helper uses public route for public pools",
);

t(
  leaderboardHrefForParticipantPool({
    poolId: "pool-2",
    isPublic: false,
    participantId: "part-2",
  }).includes("/account/leaderboard?participant=part-2"),
  "private pools use account leaderboard route",
);

const rows = buildPoolStandingsFromLedger({
  poolId: "p1",
  poolName: "Test Pool",
  participants: [
    { id: "a", display_name: "Alice" },
    { id: "b", display_name: "Bob" },
  ],
  ledgerLines: [
    { participant_id: "a", points_delta: 10 },
    { participant_id: "b", points_delta: 5 },
  ],
});
t(rows[0]?.participantId === "a" && rows[0]?.totalPoints === 10, "ranks by ledger totals");
t(rows[0]?.rank === 1 && rows[1]?.rank === 2, "assigns ranks from awarded points");
t(LEADERBOARD_AWARDED_POINTS_NOTE.includes("points awarded"), "helper copy mentions awarded points");

t(typeof loadSiteHeaderLeaderboardNav === "function", "site header loader exported");

if (failed > 0) process.exit(1);
console.log("leaderboardNav.selftest: ok");
