/**
 * Live daily update messaging and match-score derivation smoke tests.
 * Run: `npx tsx lib/tournament/liveDailyUpdate.selftest.ts`
 */
import assert from "node:assert/strict";
import { buildLiveDailyUpdateSuccessMessage } from "./liveDailyUpdateStatus";
import type { SyncOfficialTournamentSummary } from "./syncOfficialTournament";
import { winnerFromMatchScores } from "./matchOutcome";

function summary(
  overrides: Partial<SyncOfficialTournamentSummary> = {},
): SyncOfficialTournamentSummary {
  return {
    matchCount: 104,
    matchesWithScoresCount: 0,
    finishedMatchCount: 0,
    derivedResultsInserted: 0,
    poolsRecalculated: 3,
    syncLockedMatchCount: 0,
    ...overrides,
  };
}

const baseMessage = buildLiveDailyUpdateSuccessMessage({
  summary: summary(),
  editionName: "FIFA World Cup 2026",
  editionCode: "fifa_wc_2026",
  lastUpdatedAt: "2026-06-11T18:00:00.000Z",
});

assert(
  baseMessage.includes("Checked 104 matches"),
  "summary should report matches checked",
);
assert(
  baseMessage.includes("3 live pools recalculated"),
  "summary should report pools recalculated",
);
assert(
  baseMessage.includes("No match scores are recorded yet"),
  "zero scores should warn admin",
);

const finishedMessage = buildLiveDailyUpdateSuccessMessage({
  summary: summary({
    matchesWithScoresCount: 2,
    finishedMatchCount: 2,
    derivedResultsInserted: 4,
  }),
  editionName: "FIFA World Cup 2026",
  editionCode: "fifa_wc_2026",
  lastUpdatedAt: "2026-06-11T18:00:00.000Z",
});

assert(
  finishedMessage.includes("2 marked finished"),
  "finished count should appear in success message",
);
assert(
  finishedMessage.includes("4 derived results written"),
  "derived result count should appear",
);
assert(
  !finishedMessage.includes("No match scores are recorded yet"),
  "finished run should not show empty-scores warning",
);

const lockedMessage = buildLiveDailyUpdateSuccessMessage({
  summary: summary({ syncLockedMatchCount: 1 }),
  editionName: "FIFA World Cup 2026",
  editionCode: "fifa_wc_2026",
  lastUpdatedAt: "2026-06-11T18:00:00.000Z",
});

assert(
  lockedMessage.includes("1 match frozen for sync"),
  "sync-locked matches should be reported",
);

// Score → winner → finished path used by syncOfficialTournament.
const winner = winnerFromMatchScores({
  homeTeamId: "home-1",
  awayTeamId: "away-1",
  homeGoals: 2,
  awayGoals: 1,
  homePenalties: null,
  awayPenalties: null,
});
assert(winner === "home-1", "regulation winner should be home team");

const drawNoPen = winnerFromMatchScores({
  homeTeamId: "home-1",
  awayTeamId: "away-1",
  homeGoals: 1,
  awayGoals: 1,
  homePenalties: null,
  awayPenalties: null,
});
assert(drawNoPen === null, "draw without penalties should not pick a winner");

const penWinner = winnerFromMatchScores({
  homeTeamId: "home-1",
  awayTeamId: "away-1",
  homeGoals: 1,
  awayGoals: 1,
  homePenalties: 4,
  awayPenalties: 5,
});
assert(penWinner === "away-1", "penalty shootout winner should be away team");

console.log("liveDailyUpdate.selftest.ts: all assertions passed");
