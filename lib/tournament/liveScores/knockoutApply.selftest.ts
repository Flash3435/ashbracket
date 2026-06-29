/**
 * Knockout live-scores apply regression tests.
 * Run: npx tsx lib/tournament/liveScores/knockoutApply.selftest.ts
 */
import assert from "node:assert/strict";
import { applyLiveScoresAndSync } from "./applyLiveScores";
import { fixtureIdsEligibleForEventFetch, fixtureIdsForApplyEventFetch } from "./fetchFixtureEventsForPreview";
import { buildScoreChangePreview, patchesFromPreviewRows } from "./matchMapping";
import {
  applyPatches,
  propagateBracketAdvance,
  recomputeWinners,
} from "../syncOfficialTournament";
import type { TournamentMatchForLiveScores } from "./types";

function koMatchRow(
  overrides: Partial<TournamentMatchForLiveScores> & Pick<TournamentMatchForLiveScores, "id" | "matchCode">,
): TournamentMatchForLiveScores {
  return {
    kickoffAt: "2026-07-01T20:00:00.000Z",
    providerFixtureId: "provider-r32-1",
    homeTeamId: "team-rsa",
    awayTeamId: "team-can",
    homeTeamName: "South Africa",
    awayTeamName: "Canada",
    homeFifaCode: "RSA",
    awayFifaCode: "CAN",
    homeGoals: null,
    awayGoals: null,
    homePenalties: null,
    awayPenalties: null,
    status: "scheduled",
    syncLocked: false,
    ...overrides,
  };
}

// Bracket propagation: R32 winner advances into R16 slot.
const r32 = {
  id: "m-r32",
  match_code: "M73",
  stage_code: "r32",
  group_code: null,
  home_team_id: "team-rsa",
  away_team_id: "team-can",
  home_goals: null as number | null,
  away_goals: null as number | null,
  home_penalties: null as number | null,
  away_penalties: null as number | null,
  winner_team_id: null as string | null,
  status: "scheduled",
  home_advance_from_match_id: null,
  away_advance_from_match_id: null,
  scoring_result_kind: "r32_winner",
  scoring_slot_key: "M73",
  scoring_stage_code: "r32",
  sync_locked: false,
};

const r16 = {
  ...r32,
  id: "m-r16",
  match_code: "M89",
  stage_code: "r16",
  home_team_id: null as string | null,
  away_team_id: "team-bra",
  home_advance_from_match_id: "m-r32",
  away_advance_from_match_id: null,
  scoring_result_kind: "r16_winner",
  scoring_slot_key: "M89",
  scoring_stage_code: "r16",
};

const matches = [r32, r16];
const patchOutcome = applyPatches(matches, [
  {
    matchCode: "M73",
    homeGoals: 1,
    awayGoals: 1,
    homePenalties: 4,
    awayPenalties: 5,
    status: "finished",
  },
]);
assert.deepEqual(patchOutcome.applied, ["M73"]);
recomputeWinners(matches);
propagateBracketAdvance(matches);

assert.equal(r32.winner_team_id, "team-can");
assert.equal(r32.status, "finished");
assert.equal(r16.home_team_id, "team-can");

// Apply preview should plan knockout score patch.
const knockoutPreview = buildScoreChangePreview({
  provider: "mock",
  providerConfigured: true,
  configWarning: null,
  fetchedAt: "2026-07-02T12:00:00.000Z",
  matches: [
    koMatchRow({
      id: "m73",
      matchCode: "M73",
      homeTeamName: "South Africa",
      awayTeamName: "Canada",
    }),
    koMatchRow({
      id: "m76",
      matchCode: "M76",
      providerFixtureId: "provider-r32-2",
      homeTeamName: "Brazil",
      awayTeamName: "Japan",
      homeTeamId: "team-bra",
      awayTeamId: "team-jpn",
      homeFifaCode: "BRA",
      awayFifaCode: "JPN",
    }),
  ],
  fixtures: [
    {
      providerFixtureId: "provider-r32-1",
      kickoffAt: "2026-07-01T20:00:00.000Z",
      homeTeamName: "South Africa",
      awayTeamName: "Canada",
      homeFifaCode: "RSA",
      awayFifaCode: "CAN",
      homeGoals: 1,
      awayGoals: 1,
      homePenalties: 4,
      awayPenalties: 5,
      status: "finished",
    },
    {
      providerFixtureId: "provider-r32-2",
      kickoffAt: "2026-07-01T23:00:00.000Z",
      homeTeamName: "Brazil",
      awayTeamName: "Japan",
      homeFifaCode: "BRA",
      awayFifaCode: "JPN",
      homeGoals: 2,
      awayGoals: 0,
      homePenalties: null,
      awayPenalties: null,
      status: "finished",
    },
  ],
});

const m73 = knockoutPreview.rows.find((r) => r.matchCode === "M73")!;
const m76 = knockoutPreview.rows.find((r) => r.matchCode === "M76")!;
assert(m73.willUpdate, "M73 knockout score should plan update");
assert(m76.willUpdate, "M76 knockout score should plan update");
assert.equal(m73.fetchedHomePenalties, 4);
assert.equal(m73.fetchedAwayPenalties, 5);

const patches = patchesFromPreviewRows(knockoutPreview.rows);
assert.equal(patches.length, 2);

// Apply path should not require card events for every finished group match.
const finishedHeavyPreview = buildScoreChangePreview({
  provider: "mock",
  providerConfigured: true,
  configWarning: null,
  fetchedAt: "2026-07-02T12:00:00.000Z",
  matches: [
    ...Array.from({ length: 40 }, (_, i) =>
      koMatchRow({
        id: `finished-${i}`,
        matchCode: `WC2026-G-A-${String(i + 1).padStart(2, "0")}`,
        providerFixtureId: `finished-fixture-${i}`,
        homeGoals: 1,
        awayGoals: 0,
        status: "finished",
      }),
    ),
    koMatchRow({ id: "m73", matchCode: "M73" }),
  ],
  fixtures: [
    ...Array.from({ length: 40 }, (_, i) => ({
      providerFixtureId: `finished-fixture-${i}`,
      kickoffAt: "2026-06-20T20:00:00.000Z",
      homeTeamName: "South Africa",
      awayTeamName: "Canada",
      homeFifaCode: "RSA" as const,
      awayFifaCode: "CAN" as const,
      homeGoals: 1,
      awayGoals: 0,
      homePenalties: null,
      awayPenalties: null,
      status: "finished" as const,
    })),
    {
      providerFixtureId: "provider-r32-1",
      kickoffAt: "2026-07-01T20:00:00.000Z",
      homeTeamName: "South Africa",
      awayTeamName: "Canada",
      homeFifaCode: "RSA",
      awayFifaCode: "CAN",
      homeGoals: 1,
      awayGoals: 1,
      homePenalties: 4,
      awayPenalties: 5,
      status: "finished",
    },
  ],
});

const allFinishedIds = fixtureIdsEligibleForEventFetch(finishedHeavyPreview.rows);
const applyScoreIds = fixtureIdsForApplyEventFetch(finishedHeavyPreview.rows);
assert.equal(allFinishedIds.length, 41);
assert.equal(applyScoreIds.length, 1, "score apply should only fetch events for planned score rows");
assert(applyScoreIds.includes("provider-r32-1"));
assert.equal(fixtureIdsForApplyEventFetch(knockoutPreview.rows).length, 2);

// Multi-pool apply delegates to sync with planned patches.
async function runKnockoutApplyIntegrationTest() {
  const dbRowsByCode: Record<string, Record<string, unknown>> = {
    M73: {
      match_code: "M73",
      home_team_id: "team-rsa",
      away_team_id: "team-can",
      home_goals: 1,
      away_goals: 1,
      home_penalties: 4,
      away_penalties: 5,
      winner_team_id: "team-can",
      status: "finished",
    },
    M76: {
      match_code: "M76",
      home_team_id: "team-bra",
      away_team_id: "team-jpn",
      home_goals: 2,
      away_goals: 0,
      home_penalties: null,
      away_penalties: null,
      winner_team_id: "team-bra",
      status: "finished",
    },
  };

  const mockSupabase = {
    from() {
      return {
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

  let syncPoolIds: string[] = [];
  const applyOut = await applyLiveScoresAndSync(mockSupabase, {
      editionId: "edition-live",
      editionCode: "fifa_wc_2026",
      poolIds: ["pool-1", "pool-2", "pool-3"],
      previewRows: knockoutPreview.rows,
      patches,
      syncFn: async (_sb, opts) => {
        syncPoolIds = opts.poolIds;
        return {
          ok: true,
          summary: {
            matchCount: 104,
            matchesWithScoresCount: 2,
            finishedMatchCount: 2,
            derivedResultsInserted: 2,
            poolsRecalculated: opts.poolIds.length,
            syncLockedMatchCount: 0,
            patchesApplied: opts.patches?.length ?? 0,
            patchesSkipped: 0,
            roundOf32Publish: null,
          },
          patchOutcome: {
            applied: (opts.patches ?? []).map((p) => p.matchCode),
            skipped: [],
          },
        };
    },
  });

  assert(applyOut.ok);
  assert.equal(syncPoolIds.length, 3);
  assert.equal(applyOut.applySummary.planned, 2);
  assert.equal(applyOut.applySummary.ledgersRecomputed, 3);
}

runKnockoutApplyIntegrationTest()
  .then(() => {
    console.log("knockoutApply.selftest.ts: all assertions passed");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
