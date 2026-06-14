import { leaderboardNavHrefForParticipantPool, resolveStandingsNav } from "./leaderboardNavHref";

let failed = 0;

function t(condition: boolean, message: string): void {
  if (!condition) {
    failed += 1;
    console.error("FAIL:", message);
  }
}

const base = {
  poolId: "pool-1",
  isPublic: true,
  participantId: "part-1",
};

t(
  resolveStandingsNav({
    ...base,
    picksLocked: true,
    hasAwardedPoints: false,
    outlookHasMeaningfulSeparation: false,
  }).href === null,
  "locked pool with clustered outlook hides nav href",
);

t(
  resolveStandingsNav({
    ...base,
    picksLocked: true,
    hasAwardedPoints: false,
    outlookHasMeaningfulSeparation: true,
  }).href?.startsWith("/pool/pool-1") === true,
  "locked pool with meaningful outlook shows nav href",
);

t(
  resolveStandingsNav({
    ...base,
    picksLocked: true,
    hasAwardedPoints: false,
    outlookHasMeaningfulSeparation: true,
  }).label === "Outlook",
  "locked pool with meaningful outlook uses Outlook label",
);

t(
  leaderboardNavHrefForParticipantPool({
    ...base,
    picksLocked: false,
    hasAwardedPoints: true,
  }) === null,
  "unlocked pool hides nav href even when points exist",
);

t(
  leaderboardNavHrefForParticipantPool({
    ...base,
    picksLocked: true,
    hasAwardedPoints: true,
  })?.startsWith("/pool/pool-1") === true,
  "locked pool with awarded points shows public nav href",
);

t(
  leaderboardNavHrefForParticipantPool({
    poolId: "pool-2",
    isPublic: false,
    participantId: "part-2",
    picksLocked: true,
    hasAwardedPoints: true,
  })?.includes("/account/leaderboard?participant=part-2") === true,
  "locked private pool with awarded points shows account nav href",
);

if (failed > 0) process.exit(1);
console.log("leaderboardNavHref.selftest: ok");
