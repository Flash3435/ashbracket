/**
 * Run: npx tsx lib/tournament/liveScores/liveScoresApplyPlanClient.selftest.ts
 */
import assert from "node:assert/strict";
import { buildLiveScoresApplyPlanSubmitPayload } from "./liveScoresApplyPlanClient";
import { buildScoreChangePreview } from "./matchMapping";
import type { ProviderFixtureScore, TournamentMatchForLiveScores } from "./types";

function matchRow(
  overrides: Partial<TournamentMatchForLiveScores> & Pick<TournamentMatchForLiveScores, "id" | "matchCode">,
): TournamentMatchForLiveScores {
  return {
    stageCode: "group",
    kickoffAt: "2026-07-01T20:00:00.000Z",
    providerFixtureId: "prov-1",
    homeTeamId: "home-1",
    awayTeamId: "away-1",
    homeTeamName: "A",
    awayTeamName: "B",
    homeFifaCode: "AAA",
    awayFifaCode: "BBB",
    homeGoals: null,
    awayGoals: null,
    homePenalties: null,
    awayPenalties: null,
    status: "scheduled",
    syncLocked: false,
    ...overrides,
  };
}

const fixture: ProviderFixtureScore = {
  providerFixtureId: "prov-1",
  kickoffAt: "2026-07-01T20:00:00.000Z",
  homeTeamName: "A",
  awayTeamName: "B",
  homeFifaCode: "AAA",
  awayFifaCode: "BBB",
  homeGoals: 2,
  awayGoals: 1,
  homePenalties: null,
  awayPenalties: null,
  status: "finished",
};

const preview = buildScoreChangePreview({
  provider: "mock",
  providerConfigured: true,
  configWarning: null,
  fetchedAt: "2026-06-29T12:00:00.000Z",
  matches: [matchRow({ id: "m1", matchCode: "M1" })],
  fixtures: [fixture],
});

const payload = buildLiveScoresApplyPlanSubmitPayload(preview);
assert.equal(payload.previewId, preview.previewId);
assert.equal(payload.applyPlanSnapshotCount, payload.applyPlanSnapshot.length);
assert.equal(payload.applyPlanSnapshotCount, 1);

assert.throws(
  () =>
    buildLiveScoresApplyPlanSubmitPayload({
      ...preview,
      previewId: "stale-signature",
    }),
  /fetch a fresh preview/,
);

console.log("liveScoresApplyPlanClient.selftest.ts: all assertions passed");
