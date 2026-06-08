import { publicLeaderboardHrefForPool } from "./publicLeaderboardHref";

let failed = 0;

function t(condition: boolean, message: string): void {
  if (!condition) {
    failed += 1;
    console.error("FAIL:", message);
  }
}

t(
  publicLeaderboardHrefForPool({
    id: "pool-123",
    isPublic: true,
  }) === "/pool/pool-123",
  "public pools should get a public leaderboard href",
);

t(
  publicLeaderboardHrefForPool({
    id: "pool-456",
    isPublic: false,
  }) === null,
  "private pools should not get a public leaderboard href",
);

if (failed > 0) {
  process.exit(1);
}

console.log("publicLeaderboardHref.selftest: ok");
