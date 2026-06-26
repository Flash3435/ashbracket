/**
 * Live score apply success message selftests.
 * Run: npx tsx lib/tournament/liveScores/buildLiveScoresApplyMessage.selftest.ts
 */
import assert from "node:assert/strict";
import {
  buildLiveScoresApplySuccessMessage,
  isCardOnlyLiveScoresApply,
} from "./buildLiveScoresApplyMessage";
import type { LiveScoresApplySummary } from "./types";
import type { SyncOfficialTournamentSummary } from "../syncOfficialTournament";

const emptySyncSummary: SyncOfficialTournamentSummary = {
  matchCount: 0,
  matchesWithScoresCount: 0,
  finishedMatchCount: 0,
  derivedResultsInserted: 0,
  poolsRecalculated: 0,
  syncLockedMatchCount: 0,
  patchesApplied: 0,
  patchesSkipped: 0,
  roundOf32Publish: null,
};

const fullSyncSummary: SyncOfficialTournamentSummary = {
  matchCount: 104,
  matchesWithScoresCount: 12,
  finishedMatchCount: 12,
  derivedResultsInserted: 8,
  poolsRecalculated: 3,
  syncLockedMatchCount: 0,
  patchesApplied: 1,
  patchesSkipped: 0,
  roundOf32Publish: null,
};

function applySummary(overrides: Partial<LiveScoresApplySummary> = {}): LiveScoresApplySummary {
  return {
    planned: 0,
    written: 0,
    skipped: 0,
    failedVerification: 0,
    providerFixtureIdsSaved: 0,
    ledgersRecomputed: 0,
    cardsPlanned: 1,
    cardsWritten: 1,
    cardsSkipped: 0,
    cardsManualConflict: 1,
    cardsFailedVerification: 0,
    revalidatedPaths: ["/tournament", "/account", "/account/reveal"],
    details: [],
    cardDetails: [],
    ...overrides,
  };
}

const cardOnlySummary = applySummary();
assert(isCardOnlyLiveScoresApply(cardOnlySummary));

const cardOnlyMessage = buildLiveScoresApplySuccessMessage({
  editionName: "FIFA World Cup 2026",
  editionCode: "fifa_wc_2026",
  lastUpdatedAt: "2026-06-12T18:00:00.000Z",
  matchesUpdated: 0,
  summary: emptySyncSummary,
  applySummary: cardOnlySummary,
  warnings: ["Skipped 1 match(es) with manual card totals that differ from provider."],
});

assert(cardOnlyMessage.includes("Provider card totals saved"));
assert(cardOnlyMessage.includes("Cards — planned: 1; written: 1"));
assert(cardOnlyMessage.includes("No score patches were applied"));
assert(cardOnlyMessage.includes("pool point ledgers were not recalculated"));
assert(cardOnlyMessage.includes("Bonus Watch and tournament stat leader pages were revalidated"));
assert(!cardOnlyMessage.includes("Checked 0 matches"));
assert(!cardOnlyMessage.includes("No matches are on file"));
assert(!cardOnlyMessage.includes("No live pools are bound"));

const scoreAndCardsMessage = buildLiveScoresApplySuccessMessage({
  editionName: "FIFA World Cup 2026",
  editionCode: "fifa_wc_2026",
  lastUpdatedAt: "2026-06-12T18:00:00.000Z",
  matchesUpdated: 1,
  summary: fullSyncSummary,
  applySummary: applySummary({
    planned: 1,
    written: 1,
    ledgersRecomputed: 3,
  }),
  warnings: [],
});

assert(scoreAndCardsMessage.includes("Applied 1 of 1 planned match score update"));
assert(scoreAndCardsMessage.includes("Checked 104 matches"));
assert(scoreAndCardsMessage.includes("3 live pools recalculated"));
assert(!scoreAndCardsMessage.includes("No matches are on file"));

console.log("buildLiveScoresApplyMessage.selftest.ts: all assertions passed");
