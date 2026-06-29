/**
 * Run: npx tsx lib/tournament/liveScores/liveScoresStepAUi.selftest.ts
 */
import assert from "node:assert/strict";
import { interpretStepAResponse } from "./liveScoresStepAUi";

const debug = {
  url: "/api/admin/live-scores/apply",
  httpStatus: 500,
  contentType: "application/json",
  elapsedMs: 120,
  bodySnippet: '{"ok":false,"error":"boom"}',
  parseError: null,
};

const err = interpretStepAResponse({
  clientOk: false,
  clientError: "boom",
  debug,
  payload: { ok: false, build: "split-apply-v3", error: "boom" },
});
assert.equal(err.kind, "error");
if (err.kind === "error") assert.match(err.message, /boom/);

const htmlErr = interpretStepAResponse({
  clientOk: false,
  clientError: "HTML instead of JSON",
  debug: {
    ...debug,
    httpStatus: 200,
    contentType: "text/html",
    bodySnippet: "<html>login</html>",
  },
});
assert.equal(htmlErr.kind, "error");

const emptyErr = interpretStepAResponse({
  clientOk: false,
  clientError: "Empty body",
  debug: { ...debug, httpStatus: 504, bodySnippet: "" },
});
assert.equal(emptyErr.kind, "error");

const success = interpretStepAResponse({
  clientOk: true,
  debug: { ...debug, httpStatus: 200 },
  payload: {
    ok: true,
    build: "split-apply-v3",
    previewId: "abc",
    editionId: "ed-1",
    editionCode: "fifa_wc_2026",
    editionName: "FIFA World Cup 2026",
    matchesUpdated: 2,
    summary: {
      matchCount: 104,
      matchesWithScoresCount: 2,
      finishedMatchCount: 2,
      derivedResultsInserted: 2,
      poolsRecalculated: 0,
      syncLockedMatchCount: 0,
      patchesApplied: 2,
      patchesSkipped: 0,
      roundOf32Publish: null,
    },
    applySummary: {
      planned: 2,
      written: 2,
      skipped: 0,
      failedVerification: 0,
      providerFixtureIdsSaved: 0,
      ledgersRecomputed: 0,
      cardsPlanned: 0,
      cardsWritten: 0,
      cardsSkipped: 0,
      cardsManualConflict: 0,
      cardsFailedVerification: 0,
      revalidatedPaths: [],
      details: [],
      cardDetails: [],
    },
    lastUpdatedAt: "2026-01-01T00:00:00.000Z",
    message: "Saved",
    warnings: [],
    technicalDetails: { runId: "r1", totalDurationMs: 1, phases: [] },
    standingsRecalculationPending: true,
    pendingPoolIds: ["p1", "p2"],
    pendingPoolCount: 2,
  },
});
assert.equal(success.kind, "success");
if (success.kind === "success") {
  assert.equal(success.showStepB, true);
  assert.equal(success.pendingPoolIds.length, 2);
}

console.log("liveScoresStepAUi.selftest.ts: all assertions passed");
