import { leaderboardHrefForParticipantPool, publicLeaderboardHrefForPool } from "./publicLeaderboardHref";

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
  } as never) === "/pool/pool-123" ||
    publicLeaderboardHrefForPool({
      id: "pool-123",
      isPublic: true,
    } as never) === "/pool/pool-123",
  "public pools should get a public leaderboard href",
);

t(
  publicLeaderboardHrefForPool({
    id: "pool-456",
    isPublic: false,
  } as never) === null,
  "private pools should not get a public leaderboard href",
);

t(
  leaderboardHrefForParticipantPool({
    poolId: "p",
    isPublic: false,
    participantId: "x",
  }).includes("/account/leaderboard"),
  "private participant href",
);

t(
  leaderboardHrefForParticipantPool({
    poolId: "pool-1",
    isPublic: true,
    participantId: "part-1",
  }).startsWith("/pool/pool-1"),
  "public participant href uses pool route",
);

if (failed > 0) {
  process.exit(1);
}

console.log("publicLeaderboardHref.selftest: ok");
