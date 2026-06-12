/**
 * Live score fetch workflow selftests.
 * Run: npx tsx lib/tournament/liveScores/liveScoresWorkflow.selftest.ts
 */
import assert from "node:assert/strict";
import { mapApiFootballStatus } from "./apiFootballProvider";
import { readLiveScoresProviderConfig } from "./config";
import { applyLiveScoresAndSync, persistProviderFixtureIds } from "./applyLiveScores";
import {
  buildScoreChangePreview,
  computePreviewId,
  patchesFromPreviewRows,
} from "./matchMapping";
import { MOCK_PROVIDER_FIXTURES } from "./mockProvider";
import {
  canonicalTeamName,
  fifaCodeFromTeamName,
  normalizeTeamName,
  teamNamesMatch,
} from "./normalizeTeamName";
import { buildApplyVerificationDetails } from "./verifyAppliedPatches";
import type { TournamentMatchForLiveScores } from "./types";

function matchRow(
  overrides: Partial<TournamentMatchForLiveScores> & Pick<TournamentMatchForLiveScores, "id" | "matchCode">,
): TournamentMatchForLiveScores {
  return {
    kickoffAt: "2026-06-11T20:00:00.000Z",
    providerFixtureId: null,
    homeTeamId: "home-1",
    awayTeamId: "away-1",
    homeTeamName: "Mexico",
    awayTeamName: "South Africa",
    homeFifaCode: "MEX",
    awayFifaCode: "RSA",
    homeGoals: null,
    awayGoals: null,
    homePenalties: null,
    awayPenalties: null,
    status: "scheduled",
    syncLocked: false,
    ...overrides,
  };
}

const KOR_CZE_FIXTURE = {
  providerFixtureId: "1538999",
  kickoffAt: "2026-06-12T02:00:00.000Z",
  homeTeamName: "Korea Republic",
  awayTeamName: "Czechia",
  homeFifaCode: "KOR" as const,
  awayFifaCode: "CZE" as const,
  homeGoals: 2,
  awayGoals: 1,
  homePenalties: null,
  awayPenalties: null,
  status: "finished" as const,
};

// 1. Provider response normalization
assert.equal(mapApiFootballStatus("FT"), "finished");
assert.equal(mapApiFootballStatus("1H"), "live");
assert.equal(mapApiFootballStatus("NS"), "scheduled");
assert.equal(mapApiFootballStatus("PST"), "postponed");

// 2. Team-name normalization / match mapping
assert(normalizeTeamName("Côte d'Ivoire").includes("ivoire"));
assert.equal(fifaCodeFromTeamName("Ivory Coast"), fifaCodeFromTeamName("Côte d'Ivoire"));
assert.equal(fifaCodeFromTeamName("Korea Republic"), "KOR");
assert.equal(fifaCodeFromTeamName("South Korea"), "KOR");
assert(teamNamesMatch("United States", "USA"));
assert(teamNamesMatch("Mexico", "MEX"));

// 3–5. Preview plan
const previewMatches: TournamentMatchForLiveScores[] = [
  matchRow({
    id: "m1",
    matchCode: "WC2026-G-A-01",
    kickoffAt: "2026-06-11T20:00:00.000Z",
  }),
  matchRow({
    id: "m2",
    matchCode: "WC2026-G-A-02",
    kickoffAt: "2026-06-12T02:00:00.000Z",
    homeTeamName: "Korea Republic",
    awayTeamName: "Czechia",
    homeFifaCode: "KOR",
    awayFifaCode: "CZE",
    homeGoals: 1,
    awayGoals: 0,
    status: "finished",
  }),
  matchRow({
    id: "m3",
    matchCode: "WC2026-G-B-01",
    kickoffAt: "2026-06-12T20:00:00.000Z",
    homeTeamName: "Canada",
    awayTeamName: "Bosnia and Herzegovina",
    homeFifaCode: "CAN",
    awayFifaCode: "BIH",
    syncLocked: true,
  }),
  matchRow({
    id: "m4",
    matchCode: "WC2026-G-X-99",
    kickoffAt: "2099-01-01T12:00:00.000Z",
    homeTeamName: "Mars",
    awayTeamName: "Jupiter",
    homeFifaCode: null,
    awayFifaCode: null,
  }),
];

const preview = buildScoreChangePreview({
  provider: "mock",
  providerConfigured: true,
  configWarning: null,
  fetchedAt: "2026-06-12T12:00:00.000Z",
  matches: previewMatches,
  fixtures: MOCK_PROVIDER_FIXTURES,
});

const rowM1 = preview.rows.find((r) => r.matchCode === "WC2026-G-A-01")!;
assert(rowM1.willUpdate, "preview should detect changed scores for MEX-RSA");
assert.equal(rowM1.reason, "will_update");
assert.equal(rowM1.fetchedHomeGoals, 2);

const rowM2 = preview.rows.find((r) => r.matchCode === "WC2026-G-A-02")!;
assert(!rowM2.willUpdate, "preview should skip unchanged finished match when provider not final");
assert.equal(rowM2.reason, "not_finished");

const rowM3 = preview.rows.find((r) => r.matchCode === "WC2026-G-B-01")!;
assert(!rowM3.willUpdate);
assert.equal(rowM3.reason, "sync_locked");

const rowM4 = preview.rows.find((r) => r.matchCode === "WC2026-G-X-99")!;
assert.equal(rowM4.reason, "unmapped");

const patches = patchesFromPreviewRows(preview.rows);
assert.equal(patches.length, 1);
assert.equal(patches[0]!.matchCode, "WC2026-G-A-01");

// previewId must be stable across fetch timestamps
const previewLater = buildScoreChangePreview({
  provider: "mock",
  providerConfigured: true,
  configWarning: null,
  fetchedAt: "2026-06-12T18:00:00.000Z",
  matches: previewMatches,
  fixtures: MOCK_PROVIDER_FIXTURES,
});
assert.equal(preview.previewId, previewLater.previewId, "previewId should not depend on fetchedAt");

// Fallback-mapped finished Korea vs Czechia
const fallbackMatches: TournamentMatchForLiveScores[] = [
  matchRow({
    id: "kor-cze",
    matchCode: "WC2026-G-A-02",
    kickoffAt: "2026-06-12T02:00:00.000Z",
    homeTeamId: "team-kor",
    awayTeamId: "team-cze",
    homeTeamName: "Korea Republic",
    awayTeamName: "Czechia",
    homeFifaCode: "KOR",
    awayFifaCode: "CZE",
    homeGoals: null,
    awayGoals: null,
    status: "scheduled",
  }),
];

const fallbackPreview = buildScoreChangePreview({
  provider: "api-football",
  providerConfigured: true,
  configWarning: null,
  fetchedAt: "2026-06-12T12:00:00.000Z",
  matches: fallbackMatches,
  fixtures: [KOR_CZE_FIXTURE],
});

const fallbackRow = fallbackPreview.rows.find((r) => r.matchCode === "WC2026-G-A-02")!;
assert(fallbackRow.willUpdate, "fallback-mapped finished score should plan will_update");
assert.equal(fallbackRow.providerFixtureId, "1538999");
assert.equal(fallbackRow.fetchedHomeGoals, 2);
assert.equal(fallbackRow.fetchedAwayGoals, 1);
assert(
  fallbackRow.warnings.some((w) => w.includes("provider_fixture_id")),
  "fallback match should warn about storing provider_fixture_id",
);

const fallbackPatches = patchesFromPreviewRows(fallbackPreview.rows);
assert.equal(fallbackPatches.length, 1);
assert.equal(fallbackPatches[0]!.matchCode, "WC2026-G-A-02");
assert.equal(fallbackPatches[0]!.providerFixtureId, "1538999");

// After apply, preview should show unchanged
const afterApplyMatches: TournamentMatchForLiveScores[] = [
  matchRow({
    id: "kor-cze",
    matchCode: "WC2026-G-A-02",
    kickoffAt: "2026-06-12T02:00:00.000Z",
    homeTeamId: "team-kor",
    awayTeamId: "team-cze",
    homeTeamName: "Korea Republic",
    awayTeamName: "Czechia",
    homeFifaCode: "KOR",
    awayFifaCode: "CZE",
    providerFixtureId: "1538999",
    homeGoals: 2,
    awayGoals: 1,
    status: "finished",
  }),
];

const afterApplyPreview = buildScoreChangePreview({
  provider: "api-football",
  providerConfigured: true,
  configWarning: null,
  fetchedAt: "2026-06-12T13:00:00.000Z",
  matches: afterApplyMatches,
  fixtures: [KOR_CZE_FIXTURE],
});
const afterRow = afterApplyPreview.rows.find((r) => r.matchCode === "WC2026-G-A-02")!;
assert.equal(afterRow.reason, "unchanged", "rerunning preview after apply should be unchanged");
assert(!afterRow.willUpdate);

// Tournament grouping: finished status moves match out of upcoming bucket
const upcoming = afterApplyMatches.filter((m) => m.status === "scheduled" || m.status === "postponed");
const completed = afterApplyMatches.filter((m) => m.status === "finished");
assert.equal(upcoming.length, 0);
assert.equal(completed.length, 1);

// Provider id mapping
const idPreview = buildScoreChangePreview({
  provider: "mock",
  providerConfigured: true,
  configWarning: null,
  fetchedAt: "2026-06-12T12:00:00.000Z",
  matches: [
    matchRow({
      id: "m-id",
      matchCode: "WC2026-G-A-01",
      providerFixtureId: "mock-wc2026-g-a-01",
      homeGoals: 2,
      awayGoals: 1,
      status: "finished",
    }),
  ],
  fixtures: MOCK_PROVIDER_FIXTURES,
});
assert.equal(idPreview.rows[0]!.reason, "unchanged");

// Ambiguous: two matches same date/teams
const ambiguousPreview = buildScoreChangePreview({
  provider: "mock",
  providerConfigured: true,
  configWarning: null,
  fetchedAt: "2026-06-12T12:00:00.000Z",
  matches: [
    matchRow({ id: "a1", matchCode: "WC2026-G-A-01A", kickoffAt: "2026-06-11T20:00:00.000Z" }),
    matchRow({ id: "a2", matchCode: "WC2026-G-A-01B", kickoffAt: "2026-06-11T20:00:00.000Z" }),
  ],
  fixtures: MOCK_PROVIDER_FIXTURES,
});
assert(
  ambiguousPreview.rows.some((r) => r.reason === "ambiguous"),
  "preview should flag ambiguous matches",
);

// 10. No final matches
const noFinalPreview = buildScoreChangePreview({
  provider: "mock",
  providerConfigured: true,
  configWarning: null,
  fetchedAt: "2026-06-12T12:00:00.000Z",
  matches: [],
  fixtures: [
    {
      ...MOCK_PROVIDER_FIXTURES[1]!,
      status: "scheduled",
      homeGoals: null,
      awayGoals: null,
    },
  ],
});
assert(
  noFinalPreview.message?.includes("No final matches found"),
  "no scores today should return clean state",
);

// 9. Missing env vars
const savedProvider = process.env.LIVE_SCORES_PROVIDER;
const savedKey = process.env.API_FOOTBALL_KEY;
const savedLeague = process.env.API_FOOTBALL_LEAGUE_ID;
process.env.LIVE_SCORES_PROVIDER = "api-football";
delete process.env.API_FOOTBALL_KEY;
delete process.env.API_FOOTBALL_LEAGUE_ID;
const missingKeyConfig = readLiveScoresProviderConfig();
assert(!missingKeyConfig.configured);
assert(missingKeyConfig.configWarning?.includes("API_FOOTBALL_KEY"));
process.env.API_FOOTBALL_KEY = "test-key";
const missingLeagueConfig = readLiveScoresProviderConfig();
assert(!missingLeagueConfig.configured);
assert(missingLeagueConfig.configWarning?.includes("API_FOOTBALL_LEAGUE_ID"));
if (savedProvider !== undefined) process.env.LIVE_SCORES_PROVIDER = savedProvider;
else delete process.env.LIVE_SCORES_PROVIDER;
if (savedKey !== undefined) process.env.API_FOOTBALL_KEY = savedKey;
else delete process.env.API_FOOTBALL_KEY;
if (savedLeague !== undefined) process.env.API_FOOTBALL_LEAGUE_ID = savedLeague;
else delete process.env.API_FOOTBALL_LEAGUE_ID;

// Apply summary verification details
const verificationDetails = buildApplyVerificationDetails({
  previewRows: fallbackPreview.rows,
  patches: fallbackPatches,
  dbRows: [
    {
      id: "kor-cze",
      match_code: "WC2026-G-A-02",
      home_team_id: "team-kor",
      away_team_id: "team-cze",
      home_goals: 2,
      away_goals: 1,
      home_penalties: null,
      away_penalties: null,
      winner_team_id: "team-kor",
      status: "finished",
      provider_fixture_id: "1538999",
      sync_locked: false,
    },
  ],
  writtenMatchCodes: ["WC2026-G-A-02"],
  skipped: [],
});
assert.equal(verificationDetails.length, 1);
assert(verificationDetails[0]!.verified, "verification should pass for persisted fallback match");
assert.equal(verificationDetails[0]!.actualWinnerTeamId, "team-kor");

assert.equal(
  computePreviewId(fallbackPreview.rows),
  computePreviewId(
    buildScoreChangePreview({
      provider: "api-football",
      providerConfigured: true,
      configWarning: null,
      fetchedAt: "2099-01-01T00:00:00.000Z",
      matches: fallbackMatches,
      fixtures: [KOR_CZE_FIXTURE],
    }).rows,
  ),
);

async function runApplyTests(): Promise<void> {
  let syncCalled = false;
  let syncPatches: unknown[] = [];
  const dbRowsByCode: Record<string, Record<string, unknown>> = {
    "WC2026-G-A-01": {
      id: "m1",
      match_code: "WC2026-G-A-01",
      home_team_id: "home-1",
      away_team_id: "away-1",
      home_goals: 2,
      away_goals: 1,
      home_penalties: null,
      away_penalties: null,
      winner_team_id: "home-1",
      status: "finished",
      provider_fixture_id: "mock-wc2026-g-a-01",
      sync_locked: false,
    },
    "WC2026-G-A-02": {
      id: "kor-cze",
      match_code: "WC2026-G-A-02",
      home_team_id: "team-kor",
      away_team_id: "team-cze",
      home_goals: 2,
      away_goals: 1,
      home_penalties: null,
      away_penalties: null,
      winner_team_id: "team-kor",
      status: "finished",
      provider_fixture_id: "1538999",
      sync_locked: false,
    },
  };

  const mockSupabase = {
    from() {
      return {
        update() {
          return {
            eq() {
              return { is: async () => ({ error: null }) };
            },
          };
        },
        select() {
          return {
            eq() {
              return {
                in: async (_col: string, codes: string[]) => ({
                  data: codes.map((code) => dbRowsByCode[code]).filter(Boolean),
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  } as unknown as import("@supabase/supabase-js").SupabaseClient;

  const applyOut = await applyLiveScoresAndSync(mockSupabase, {
    editionId: "edition-1",
    editionCode: "fifa_wc_2026",
    poolIds: ["pool-1"],
    previewRows: preview.rows,
    patches: patchesFromPreviewRows(preview.rows),
    providerFixtureIdUpdates: [{ matchId: "m1", providerFixtureId: "mock-wc2026-g-a-01" }],
    syncFn: async (_sb, opts) => {
      syncCalled = true;
      syncPatches = opts.patches ?? [];
      return {
        ok: true,
        summary: {
          matchCount: 104,
          matchesWithScoresCount: 1,
          finishedMatchCount: 1,
          derivedResultsInserted: 0,
          poolsRecalculated: 1,
          syncLockedMatchCount: 1,
          patchesApplied: 1,
          patchesSkipped: 0,
        },
        patchOutcome: { applied: ["WC2026-G-A-01"], skipped: [] },
      };
    },
  });

  assert(applyOut.ok);
  assert(syncCalled, "apply should run existing recompute path");
  assert.equal(syncPatches.length, 1);
  assert.equal((syncPatches[0] as { matchCode: string }).matchCode, "WC2026-G-A-01");
  assert.equal(applyOut.applySummary.planned, 1);
  assert.equal(applyOut.applySummary.written, 1);
  assert.equal(applyOut.applySummary.failedVerification, 0);

  const fallbackApply = await applyLiveScoresAndSync(mockSupabase, {
    editionId: "edition-1",
    editionCode: "fifa_wc_2026",
    poolIds: ["pool-1"],
    previewRows: fallbackPreview.rows,
    patches: fallbackPatches,
    providerFixtureIdUpdates: [{ matchId: "kor-cze", providerFixtureId: "1538999" }],
    syncFn: async () => ({
      ok: true,
      summary: {
        matchCount: 104,
        matchesWithScoresCount: 1,
        finishedMatchCount: 1,
        derivedResultsInserted: 0,
        poolsRecalculated: 1,
        syncLockedMatchCount: 0,
        patchesApplied: 1,
        patchesSkipped: 0,
      },
      patchOutcome: { applied: ["WC2026-G-A-02"], skipped: [] },
    }),
  });
  assert(fallbackApply.ok);
  assert.equal(fallbackApply.applySummary.written, 1);
  assert.equal(fallbackApply.applySummary.providerFixtureIdsSaved, 1);

  const savedIds = await persistProviderFixtureIds(mockSupabase, [
    { matchId: "kor-cze", providerFixtureId: "1538999" },
  ]);
  assert.equal(savedIds.saved, 1);

  const lockedRow = preview.rows.find((r) => r.matchCode === "WC2026-G-B-01")!;
  assert.equal(lockedRow.reason, "sync_locked");

  const emptyApply = await applyLiveScoresAndSync(mockSupabase, {
    editionId: "edition-1",
    editionCode: "fifa_wc_2026",
    poolIds: [],
    previewRows: preview.rows,
    patches: [],
    syncFn: async () => ({
      ok: true,
      summary: {
        matchCount: 0,
        matchesWithScoresCount: 0,
        finishedMatchCount: 0,
        derivedResultsInserted: 0,
        poolsRecalculated: 0,
        syncLockedMatchCount: 0,
        patchesApplied: 0,
        patchesSkipped: 0,
      },
      patchOutcome: { applied: [], skipped: [] },
    }),
  });
  assert(!emptyApply.ok);
}

runApplyTests()
  .then(() => {
    console.log("liveScoresWorkflow.selftest.ts: all assertions passed");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
