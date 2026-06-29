/**
 * Apply-plan signature regression tests for Step A preview freshness.
 * Run: npx tsx lib/tournament/liveScores/applyPlanSignature.selftest.ts
 */
import assert from "node:assert/strict";
import {
  computeApplyPlanSignature,
  computeApplyPlanSignatureFromOperations,
  diffApplyPlanOperations,
  extractApplyPlanOperations,
  matchIntentsFromOperations,
} from "./applyPlanSignature";
import { buildScoreChangePreview } from "./matchMapping";
import { mockNormalizedEventsForFixture } from "./mockFixtureEvents";
import type { ProviderFixtureScore, TournamentMatchForLiveScores } from "./types";

function matchRow(
  overrides: Partial<TournamentMatchForLiveScores> & Pick<TournamentMatchForLiveScores, "id" | "matchCode">,
): TournamentMatchForLiveScores {
  return {
    kickoffAt: "2026-07-01T20:00:00.000Z",
    providerFixtureId: null,
    homeTeamId: "home-1",
    awayTeamId: "away-1",
    homeTeamName: "Germany",
    awayTeamName: "Paraguay",
    homeFifaCode: "GER",
    awayFifaCode: "PAR",
    homeGoals: null,
    awayGoals: null,
    homePenalties: null,
    awayPenalties: null,
    status: "scheduled",
    syncLocked: false,
    ...overrides,
  };
}

const m73 = matchRow({
  id: "m73",
  matchCode: "M73",
  providerFixtureId: "prov-m73",
  homeTeamName: "South Africa",
  awayTeamName: "Canada",
  homeFifaCode: "RSA",
  awayFifaCode: "CAN",
  homeGoals: 0,
  awayGoals: 1,
  status: "scheduled",
});

const m76 = matchRow({
  id: "m76",
  matchCode: "M76",
  providerFixtureId: "prov-m76",
  homeTeamName: "Brazil",
  awayTeamName: "Japan",
  homeFifaCode: "BRA",
  awayFifaCode: "JPN",
  kickoffAt: "2026-07-01T23:00:00.000Z",
});

const m74 = matchRow({
  id: "m74",
  matchCode: "M74",
  providerFixtureId: "prov-m74",
  kickoffAt: "2026-07-02T16:00:00.000Z",
});

const finishedM73: ProviderFixtureScore = {
  providerFixtureId: "prov-m73",
  kickoffAt: "2026-07-01T20:00:00.000Z",
  homeTeamName: "South Africa",
  awayTeamName: "Canada",
  homeFifaCode: "RSA",
  awayFifaCode: "CAN",
  homeGoals: 0,
  awayGoals: 1,
  homePenalties: null,
  awayPenalties: null,
  status: "finished",
};

const finishedM76: ProviderFixtureScore = {
  providerFixtureId: "prov-m76",
  kickoffAt: "2026-07-01T23:00:00.000Z",
  homeTeamName: "Brazil",
  awayTeamName: "Japan",
  homeFifaCode: "BRA",
  awayFifaCode: "JPN",
  homeGoals: 2,
  awayGoals: 1,
  homePenalties: null,
  awayPenalties: null,
  status: "finished",
};

function liveM74(homeGoals: number, awayGoals: number): ProviderFixtureScore {
  return {
    providerFixtureId: "prov-m74",
    kickoffAt: "2026-07-02T16:00:00.000Z",
    homeTeamName: "Germany",
    awayTeamName: "Paraguay",
    homeFifaCode: "GER",
    awayFifaCode: "PAR",
    homeGoals,
    awayGoals,
    homePenalties: null,
    awayPenalties: null,
    status: "live",
  };
}

function buildPreview(fixtures: ProviderFixtureScore[], fetchedAt: string) {
  return buildScoreChangePreview({
    provider: "mock",
    providerConfigured: true,
    configWarning: null,
    fetchedAt,
    matches: [m73, m76, m74],
    fixtures,
  });
}

// Unrelated live match changes between preview and apply → same apply plan signature.
{
  const previewAtFetch = buildPreview([finishedM73, finishedM76, liveM74(1, 0)], "2026-06-29T12:00:00.000Z");
  const previewAtApply = buildPreview([finishedM73, finishedM76, liveM74(2, 1)], "2026-06-29T12:05:00.000Z");

  assert(previewAtFetch.rows.find((r) => r.matchCode === "M73")!.willUpdate);
  assert(previewAtFetch.rows.find((r) => r.matchCode === "M76")!.willUpdate);
  assert.equal(previewAtFetch.rows.find((r) => r.matchCode === "M74")!.reason, "in_progress");

  assert.equal(previewAtFetch.previewId, previewAtApply.previewId);
  assert.deepEqual(
    extractApplyPlanOperations(previewAtFetch.rows),
    extractApplyPlanOperations(previewAtApply.rows),
  );
}

// Completed planned match score changes → signature mismatch with useful diff.
{
  const submitted = buildPreview([finishedM73, finishedM76, liveM74(1, 0)], "2026-06-29T12:00:00.000Z");
  const rebuilt = buildPreview(
    [
      { ...finishedM73, homeGoals: 1, awayGoals: 1 },
      finishedM76,
      liveM74(1, 0),
    ],
    "2026-06-29T12:05:00.000Z",
  );

  assert.notEqual(submitted.previewId, rebuilt.previewId);
  const diff = diffApplyPlanOperations(
    extractApplyPlanOperations(submitted.rows),
    extractApplyPlanOperations(rebuilt.rows),
  );
  assert.deepEqual(diff.changedMatchCodes, ["M73"]);
  const submittedM73 = diff.submittedOperations.find(
    (op) => op.matchCode === "M73" && op.kind === "score",
  );
  const rebuiltM73 = diff.rebuiltOperations.find(
    (op) => op.matchCode === "M73" && op.kind === "score",
  );
  assert(submittedM73?.kind === "score");
  assert(rebuiltM73?.kind === "score");
  assert.equal(submittedM73.homeGoals, 0);
  assert.equal(rebuiltM73.homeGoals, 1);
}

// Completed planned match becomes not-finished → signature mismatch.
{
  const submitted = buildPreview([finishedM73, finishedM76, liveM74(1, 0)], "2026-06-29T12:00:00.000Z");
  const rebuilt = buildPreview(
    [{ ...finishedM73, status: "live" }, finishedM76, liveM74(1, 0)],
    "2026-06-29T12:05:00.000Z",
  );

  assert.notEqual(submitted.previewId, rebuilt.previewId);
  const diff = diffApplyPlanOperations(
    extractApplyPlanOperations(submitted.rows),
    extractApplyPlanOperations(rebuilt.rows),
  );
  assert.deepEqual(diff.changedMatchCodes, ["M73"]);
  assert.deepEqual(diff.removedMatchCodes, ["M73"]);
}

// Status-only planned update (scores already correct) is included and stable.
{
  const scheduledDb = matchRow({
    id: "m73",
    matchCode: "M73",
    providerFixtureId: "prov-m73",
    homeTeamName: "South Africa",
    awayTeamName: "Canada",
    homeFifaCode: "RSA",
    awayFifaCode: "CAN",
    homeGoals: 0,
    awayGoals: 1,
    status: "scheduled",
  });

  const previewA = buildScoreChangePreview({
    provider: "mock",
    providerConfigured: true,
    configWarning: null,
    fetchedAt: "2026-06-29T12:00:00.000Z",
    matches: [scheduledDb],
    fixtures: [finishedM73],
  });
  const previewB = buildScoreChangePreview({
    provider: "mock",
    providerConfigured: true,
    configWarning: null,
    fetchedAt: "2026-06-29T12:10:00.000Z",
    matches: [scheduledDb],
    fixtures: [finishedM73],
  });

  const row = previewA.rows[0]!;
  assert(row.willUpdate, "status-only mismatch should plan score/status update");
  const scoreOp = extractApplyPlanOperations(previewA.rows).find((op) => op.kind === "score");
  assert(scoreOp && scoreOp.kind === "score");
  assert.equal(scoreOp.status, "finished");
  assert.equal(previewA.previewId, previewB.previewId);
}

// Event warnings / diagnostic text on preview rows do not affect the apply plan signature.
{
  const cardMatch = matchRow({
    id: "m73",
    matchCode: "M73",
    providerFixtureId: "prov-m73",
    homeTeamName: "South Africa",
    awayTeamName: "Canada",
    homeFifaCode: "RSA",
    awayFifaCode: "CAN",
    homeGoals: 0,
    awayGoals: 1,
    status: "scheduled",
  });
  const events = mockNormalizedEventsForFixture("prov-m73", {
    homeTeamName: "South Africa",
    awayTeamName: "Canada",
    homeFifaCode: "RSA",
    awayFifaCode: "CAN",
  })!;
  const previewWithWarnings = buildScoreChangePreview({
    provider: "mock",
    providerConfigured: true,
    configWarning: null,
    fetchedAt: "2026-06-29T12:00:00.000Z",
    matches: [cardMatch, m74],
    fixtures: [finishedM73, liveM74(1, 0)],
    cardStatsByMatchId: new Map(),
    eventsByFixtureId: new Map([["prov-m73", events]]),
    eventFetchFailures: new Set(["prov-m73"]),
  });
  const previewWithoutWarnings = buildScoreChangePreview({
    provider: "mock",
    providerConfigured: true,
    configWarning: null,
    fetchedAt: "2026-06-29T12:05:00.000Z",
    matches: [cardMatch, m74],
    fixtures: [finishedM73, liveM74(2, 1)],
    cardStatsByMatchId: new Map(),
    eventsByFixtureId: new Map([["prov-m73", events]]),
  });

  const warnedRow = previewWithWarnings.rows.find((r) => r.matchCode === "M73")!;
  assert(warnedRow.willUpdate);
  assert(warnedRow.warnings.length > 0 || warnedRow.cardReason === "no_event_data");

  assert.equal(previewWithWarnings.previewId, previewWithoutWarnings.previewId);
  assert.deepEqual(
    extractApplyPlanOperations(previewWithWarnings.rows),
    extractApplyPlanOperations(previewWithoutWarnings.rows),
  );
}

// Signature excludes unstable provider fetchedStatus on planned rows (uses finished patch status).
{
  const preview = buildPreview([finishedM73, finishedM76, liveM74(0, 0)], "2026-06-29T12:00:00.000Z");
  const ops = extractApplyPlanOperations(preview.rows);
  for (const op of ops) {
    if (op.kind === "score") {
      assert.equal(op.status, "finished");
    }
  }
  assert.equal(computeApplyPlanSignature(preview.rows), preview.previewId);
}

// Score + card updates on the same finished match stay stable when apply validation fetches card events.
{
  const mexRsaMatch = matchRow({
    id: "m1",
    matchCode: "WC2026-G-A-01",
    providerFixtureId: "mock-wc2026-g-a-01",
    homeTeamName: "Mexico",
    awayTeamName: "South Africa",
    homeFifaCode: "MEX",
    awayFifaCode: "RSA",
    kickoffAt: "2026-06-11T20:00:00.000Z",
  });
  const mexRsaFixture: ProviderFixtureScore = {
    providerFixtureId: "mock-wc2026-g-a-01",
    kickoffAt: "2026-06-11T20:00:00.000Z",
    homeTeamName: "Mexico",
    awayTeamName: "South Africa",
    homeFifaCode: "MEX",
    awayFifaCode: "RSA",
    homeGoals: 2,
    awayGoals: 1,
    homePenalties: null,
    awayPenalties: null,
    status: "finished",
  };
  const events = mockNormalizedEventsForFixture("mock-wc2026-g-a-01", {
    homeTeamName: "Mexico",
    awayTeamName: "South Africa",
    homeFifaCode: "MEX",
    awayFifaCode: "RSA",
  })!;
  const withAllEvents = buildScoreChangePreview({
    provider: "mock",
    providerConfigured: true,
    configWarning: null,
    fetchedAt: "2026-06-29T12:00:00.000Z",
    matches: [mexRsaMatch],
    fixtures: [mexRsaFixture],
    cardStatsByMatchId: new Map(),
    eventsByFixtureId: new Map([["mock-wc2026-g-a-01", events]]),
  });
  const scoreOnly = buildScoreChangePreview({
    provider: "mock",
    providerConfigured: true,
    configWarning: null,
    fetchedAt: "2026-06-29T12:05:00.000Z",
    matches: [mexRsaMatch],
    fixtures: [mexRsaFixture],
    cardStatsByMatchId: new Map(),
  });
  const withApplyValidationEvents = buildScoreChangePreview({
    provider: "mock",
    providerConfigured: true,
    configWarning: null,
    fetchedAt: "2026-06-29T12:05:00.000Z",
    matches: [mexRsaMatch],
    fixtures: [mexRsaFixture],
    cardStatsByMatchId: new Map(),
    eventsByFixtureId: new Map([["mock-wc2026-g-a-01", events]]),
  });

  assert(withAllEvents.rows[0]!.willUpdate);
  assert(withAllEvents.rows[0]!.cardWillUpdate);
  assert.notEqual(
    scoreOnly.previewId,
    withAllEvents.previewId,
    "score-only rebuild without card events must not be compared to UI preview when cards are planned",
  );
  assert.equal(
    withAllEvents.previewId,
    withApplyValidationEvents.previewId,
    "apply validation must fetch card events for score-update rows too",
  );
}

// M76: score+status at preview vs status-only after partial write — same material intent.
{
  const blankDb = matchRow({
    id: "m76",
    matchCode: "M76",
    providerFixtureId: "prov-m76",
    homeTeamName: "Brazil",
    awayTeamName: "Japan",
    homeFifaCode: "BRA",
    awayFifaCode: "JPN",
    kickoffAt: "2026-07-01T23:00:00.000Z",
  });
  const scheduledWithScore = matchRow({
    id: "m76",
    matchCode: "M76",
    providerFixtureId: "prov-m76",
    homeTeamName: "Brazil",
    awayTeamName: "Japan",
    homeFifaCode: "BRA",
    awayFifaCode: "JPN",
    homeGoals: 2,
    awayGoals: 1,
    status: "scheduled",
    kickoffAt: "2026-07-01T23:00:00.000Z",
  });

  const submittedPreview = buildScoreChangePreview({
    provider: "mock",
    providerConfigured: true,
    configWarning: null,
    fetchedAt: "2026-06-29T12:00:00.000Z",
    matches: [blankDb],
    fixtures: [finishedM76],
  });
  const rebuiltPreview = buildScoreChangePreview({
    provider: "mock",
    providerConfigured: true,
    configWarning: null,
    fetchedAt: "2026-06-29T12:05:00.000Z",
    matches: [scheduledWithScore],
    fixtures: [finishedM76],
  });

  const submittedOps = extractApplyPlanOperations(submittedPreview.rows);
  const rebuiltOps = extractApplyPlanOperations(rebuiltPreview.rows);
  assert.equal(submittedOps.length, 1);
  assert.equal(rebuiltOps.length, 1);
  assert.equal(submittedPreview.previewId, rebuiltPreview.previewId);

  const diff = diffApplyPlanOperations(submittedOps, rebuiltOps);
  assert.deepEqual(diff.changedMatchCodes, []);
  assert.deepEqual(
    matchIntentsFromOperations(submittedOps),
    matchIntentsFromOperations(rebuiltOps),
  );
}

// True score change 2–1 → 3–1 → stale-plan rejection.
{
  const submitted = buildPreview([finishedM73, finishedM76, liveM74(1, 0)], "2026-06-29T12:00:00.000Z");
  const rebuilt = buildPreview(
    [finishedM73, { ...finishedM76, homeGoals: 3, awayGoals: 1 }, liveM74(1, 0)],
    "2026-06-29T12:05:00.000Z",
  );

  const diff = diffApplyPlanOperations(
    extractApplyPlanOperations(submitted.rows),
    extractApplyPlanOperations(rebuilt.rows),
  );
  assert.deepEqual(diff.changedMatchCodes, ["M76"]);
  assert.notEqual(submitted.previewId, rebuilt.previewId);
}

// True status change finished → live → stale-plan rejection.
{
  const submitted = buildPreview([finishedM73, finishedM76, liveM74(1, 0)], "2026-06-29T12:00:00.000Z");
  const rebuilt = buildPreview(
    [finishedM73, { ...finishedM76, status: "live" }, liveM74(1, 0)],
    "2026-06-29T12:05:00.000Z",
  );

  const diff = diffApplyPlanOperations(
    extractApplyPlanOperations(submitted.rows),
    extractApplyPlanOperations(rebuilt.rows),
  );
  assert.deepEqual(diff.changedMatchCodes, ["M76"]);
  assert.deepEqual(diff.removedMatchCodes, ["M76"]);
}

// Signature ignores matchId / providerFixtureId — material state only.
{
  const opsA = extractApplyPlanOperations(
    buildPreview([finishedM73, finishedM76, liveM74(1, 0)], "2026-06-29T12:00:00.000Z").rows,
  );
  const opsB = opsA.map((op) => ({
    ...op,
    matchId: op.matchId + "-copy",
    providerFixtureId: op.providerFixtureId ? `${op.providerFixtureId}-copy` : null,
  }));
  assert.equal(
    computeApplyPlanSignatureFromOperations(opsA),
    computeApplyPlanSignatureFromOperations(opsB),
  );
}

// M73/M76 status-only (scores already correct) stay stable across refetch.
{
  const scheduledM73 = matchRow({
    id: "m73",
    matchCode: "M73",
    providerFixtureId: "prov-m73",
    homeTeamName: "South Africa",
    awayTeamName: "Canada",
    homeFifaCode: "RSA",
    awayFifaCode: "CAN",
    homeGoals: 0,
    awayGoals: 1,
    status: "scheduled",
  });
  const scheduledM76 = matchRow({
    id: "m76",
    matchCode: "M76",
    providerFixtureId: "prov-m76",
    homeTeamName: "Brazil",
    awayTeamName: "Japan",
    homeFifaCode: "BRA",
    awayFifaCode: "JPN",
    homeGoals: 2,
    awayGoals: 1,
    status: "scheduled",
    kickoffAt: "2026-07-01T23:00:00.000Z",
  });

  const previewA = buildScoreChangePreview({
    provider: "mock",
    providerConfigured: true,
    configWarning: null,
    fetchedAt: "2026-06-29T12:00:00.000Z",
    matches: [scheduledM73, scheduledM76, m74],
    fixtures: [finishedM73, finishedM76, liveM74(1, 0)],
  });
  const previewB = buildScoreChangePreview({
    provider: "mock",
    providerConfigured: true,
    configWarning: null,
    fetchedAt: "2026-06-29T12:10:00.000Z",
    matches: [scheduledM73, scheduledM76, m74],
    fixtures: [finishedM73, finishedM76, liveM74(2, 1)],
  });

  assert.equal(previewA.previewId, previewB.previewId);
  const diff = diffApplyPlanOperations(
    extractApplyPlanOperations(previewA.rows),
    extractApplyPlanOperations(previewB.rows),
  );
  assert.deepEqual(diff.changedMatchCodes, []);
}

console.log("applyPlanSignature.selftest.ts: all assertions passed");
