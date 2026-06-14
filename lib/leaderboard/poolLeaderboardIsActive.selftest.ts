import {
  poolLeaderboardIsActiveFromLedgerLines,
  poolLeaderboardIsActiveFromRows,
} from "./poolLeaderboardIsActive";
import type { LeaderboardPublicRow } from "../../types/leaderboard";

let failed = 0;

function t(condition: boolean, message: string): void {
  if (!condition) {
    failed += 1;
    console.error("FAIL:", message);
  }
}

const zeroRows: LeaderboardPublicRow[] = [
  {
    poolId: "p1",
    poolName: "Pool",
    participantId: "a",
    displayName: "Alice",
    totalPoints: 0,
    rank: 1,
  },
  {
    poolId: "p1",
    poolName: "Pool",
    participantId: "b",
    displayName: "Bob",
    totalPoints: 0,
    rank: 1,
  },
];

t(!poolLeaderboardIsActiveFromRows(zeroRows), "all-zero rows are inactive");
t(
  poolLeaderboardIsActiveFromRows([
    ...zeroRows,
    { ...zeroRows[0]!, participantId: "c", displayName: "Cara", totalPoints: 3, rank: 1 },
  ]),
  "one participant with points makes leaderboard active",
);

t(!poolLeaderboardIsActiveFromLedgerLines([]), "empty ledger is inactive");
t(
  !poolLeaderboardIsActiveFromLedgerLines([{ participant_id: "a", points_delta: 0 }]),
  "zero deltas are inactive",
);
t(
  poolLeaderboardIsActiveFromLedgerLines([{ participant_id: "a", points_delta: 5 }]),
  "non-zero ledger delta is active",
);

if (failed > 0) process.exit(1);
console.log("poolLeaderboardIsActive.selftest: ok");
