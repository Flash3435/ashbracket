/**
 * Step A status persistence regression tests (knockout scores + finished status).
 * Run: npx tsx lib/tournament/liveScores/stepAStatusPersist.selftest.ts
 */
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyLiveScoresAndSync } from "./applyLiveScores";
import { buildScoreChangePreview, patchesFromPreviewRows } from "./matchMapping";
import {
  applyPatches,
  propagateBracketAdvance,
  recomputeWinners,
} from "../syncOfficialTournament";
import { seedOfficialWc2026KnockoutFixtures } from "../seedOfficialWc2026KnockoutFixtures";
import type { TournamentMatchForLiveScores } from "./types";

function koMatchRow(
  overrides: Partial<TournamentMatchForLiveScores> & Pick<TournamentMatchForLiveScores, "id" | "matchCode">,
): TournamentMatchForLiveScores {
  return {
    stageCode: "round_of_32",
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

function dbKoRow(input: {
  id: string;
  matchCode: string;
  homeGoals: number | null;
  awayGoals: number | null;
  status: string;
  homePenalties?: number | null;
  awayPenalties?: number | null;
}) {
  return {
    id: input.id,
    match_code: input.matchCode,
    stage_code: "round_of_32",
    group_code: null,
    home_team_id: "team-rsa",
    away_team_id: "team-can",
    home_goals: input.homeGoals,
    away_goals: input.awayGoals,
    home_penalties: input.homePenalties ?? null,
    away_penalties: input.awayPenalties ?? null,
    winner_team_id:
      input.homeGoals != null &&
      input.awayGoals != null &&
      input.homeGoals !== input.awayGoals
        ? input.homeGoals > input.awayGoals
          ? "team-rsa"
          : "team-can"
        : null,
    status: input.status,
    home_advance_from_match_id: null,
    away_advance_from_match_id: null,
    scoring_result_kind: "r32_winner",
    scoring_slot_key: input.matchCode,
    scoring_stage_code: "r32",
    sync_locked: false,
  };
}

// Status-only dirty tracking: scores already match, status still scheduled.
{
  const matches = [
    dbKoRow({
      id: "m73",
      matchCode: "M73",
      homeGoals: 2,
      awayGoals: 1,
      status: "scheduled",
    }),
  ];
  const before = matches[0]!.status;
  const patchOutcome = applyPatches(matches, [
    { matchCode: "M73", homeGoals: 2, awayGoals: 1, status: "finished" },
  ]);
  recomputeWinners(matches);
  propagateBracketAdvance(matches);
  assert.deepEqual(patchOutcome.applied, ["M73"]);
  assert.equal(before, "scheduled");
  assert.equal(matches[0]!.status, "finished");
  assert.equal(matches[0]!.home_goals, 2);
  assert.equal(matches[0]!.away_goals, 1);
}

// R32 seed must not reset finished knockout rows back to scheduled.
async function testSeedPreservesFinishedStatus() {
  const editionId = "edition-live";
  const store = new Map<string, Record<string, unknown>>([
    [
      "M73",
      {
        edition_id: editionId,
        match_code: "M73",
        kickoff_at: "2026-07-01T20:00:00.000Z",
        round_index: 0,
        stage_code: "round_of_32",
        home_team_id: "team-rsa",
        away_team_id: "team-can",
        home_goals: 0,
        away_goals: 1,
        status: "finished",
      },
    ],
  ]);

  const supabase = {
    from(table: string) {
      assert.equal(table, "tournament_matches");
      return {
        select() {
          return {
            eq(_col: string, value: string) {
              if (value === editionId) {
                return {
                  in: async (_c: string, codes: string[]) => ({
                    data: codes
                      .map((code) => store.get(code))
                      .filter(Boolean),
                    error: null,
                  }),
                };
              }
              return {
                maybeSingle: async () => ({ data: { id: editionId }, error: null }),
              };
            },
          };
        },
        insert(rows: Record<string, unknown>[]) {
          for (const row of rows) {
            store.set(row.match_code as string, { ...row });
          }
          return Promise.resolve({ error: null });
        },
        update(patch: Record<string, unknown>) {
          return {
            eq(_col: string, editionValue: string) {
              return {
                eq(_col2: string, matchCode: string) {
                  const existing = store.get(matchCode);
                  if (existing && editionValue === editionId) {
                    store.set(matchCode, { ...existing, ...patch });
                  }
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  const out = await seedOfficialWc2026KnockoutFixtures(supabase, { editionId });
  assert(out.ok, out.ok ? "" : out.error);
  assert.equal(store.get("M73")?.status, "finished", "seed must not clobber finished status");
  assert.equal(store.get("M73")?.home_goals, 0);
  assert.equal(store.get("M73")?.away_goals, 1);
  assert.equal(store.get("M73")?.home_team_id, "team-rsa");
}

// Regression 1: scheduled + no score → apply writes score + finished status.
async function testStepAWritesScoreAndStatus() {
  const dbRowsByCode: Record<string, Record<string, unknown>> = {
    M76: {
      id: "m76",
      match_code: "M76",
      home_team_id: "team-bra",
      away_team_id: "team-jpn",
      home_goals: 2,
      away_goals: 1,
      home_penalties: null,
      away_penalties: null,
      winner_team_id: "team-bra",
      status: "finished",
      provider_fixture_id: "provider-r32-2",
      sync_locked: false,
    },
  };

  const preview = buildScoreChangePreview({
    provider: "mock",
    providerConfigured: true,
    configWarning: null,
    fetchedAt: "2026-07-02T12:00:00.000Z",
    matches: [
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
        providerFixtureId: "provider-r32-2",
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
      },
    ],
  });

  const row = preview.rows[0]!;
  assert(row.willUpdate, "scheduled knockout with no score should plan update");
  const patches = patchesFromPreviewRows(preview.rows);
  assert.equal(patches[0]?.status, "finished");

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
  } as unknown as SupabaseClient;

  const out = await applyLiveScoresAndSync(mockSupabase, {
    editionId: "edition-live",
    editionCode: "fifa_wc_2026",
    poolIds: ["pool-1"],
    previewRows: preview.rows,
    patches,
    skipPoolRecalculation: true,
    syncFn: async (_sb, opts) => {
      const applied = (opts.patches ?? []).map((p) => p.matchCode);
      for (const patch of opts.patches ?? []) {
        const row = dbRowsByCode[patch.matchCode];
        if (!row) continue;
        row.home_goals = patch.homeGoals;
        row.away_goals = patch.awayGoals;
        row.status = patch.status ?? "finished";
        row.winner_team_id = "team-bra";
      }
      await seedOfficialWc2026KnockoutFixtures(
        {
          from() {
            return {
              select() {
                return {
                  eq() {
                    return {
                      in: async (_c: string, codes: string[]) => ({
                        data: codes
                          .map((code) => ({
                            match_code: code,
                            kickoff_at: "2026-07-01T23:00:00.000Z",
                            round_index: 3,
                            stage_code: "round_of_32",
                            ...dbRowsByCode[code],
                          }))
                          .filter((r) => r.match_code),
                        error: null,
                      }),
                    };
                  },
                };
              },
              insert: async () => ({ error: null }),
              update(patch: Record<string, unknown>) {
                return {
                  eq() {
                    return {
                      eq: (_c: string, code: string) => {
                        const existing = dbRowsByCode[code];
                        if (existing) Object.assign(existing, patch);
                        return Promise.resolve({ error: null });
                      },
                    };
                  },
                };
              },
            };
          },
        } as unknown as SupabaseClient,
        { editionId: "edition-live" },
      );
      return {
        ok: true,
        summary: {
          matchCount: 104,
          matchesWithScoresCount: 1,
          finishedMatchCount: 1,
          derivedResultsInserted: 1,
          poolsRecalculated: 0,
          syncLockedMatchCount: 0,
          patchesApplied: applied.length,
          patchesSkipped: 0,
          roundOf32Publish: null,
        },
        patchOutcome: { applied, skipped: [] },
      };
    },
  });

  assert(out.ok, out.ok ? "" : JSON.stringify(out));
  assert.equal(dbRowsByCode.M76?.status, "finished");
  assert.equal(dbRowsByCode.M76?.home_goals, 2);
  assert.equal(dbRowsByCode.M76?.away_goals, 1);
}

// Regression 2: correct score but scheduled → apply still writes finished status.
async function testStepAWritesStatusWhenScoreAlreadyCorrect() {
  const dbRowsByCode: Record<string, Record<string, unknown>> = {
    M73: {
      id: "m73",
      match_code: "M73",
      home_team_id: "team-rsa",
      away_team_id: "team-can",
      home_goals: 0,
      away_goals: 1,
      home_penalties: null,
      away_penalties: null,
      winner_team_id: "team-can",
      status: "scheduled",
      provider_fixture_id: "provider-r32-1",
      sync_locked: false,
    },
  };

  const preview = buildScoreChangePreview({
    provider: "mock",
    providerConfigured: true,
    configWarning: null,
    fetchedAt: "2026-07-02T12:00:00.000Z",
    matches: [
      koMatchRow({
        id: "m73",
        matchCode: "M73",
        homeGoals: 0,
        awayGoals: 1,
        status: "scheduled",
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
        homeGoals: 0,
        awayGoals: 1,
        homePenalties: null,
        awayPenalties: null,
        status: "finished",
      },
    ],
  });

  const row = preview.rows[0]!;
  assert(row.willUpdate, "status-only knockout mismatch should plan update");
  const patches = patchesFromPreviewRows(preview.rows);

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
  } as unknown as SupabaseClient;

  const out = await applyLiveScoresAndSync(mockSupabase, {
    editionId: "edition-live",
    editionCode: "fifa_wc_2026",
    poolIds: ["pool-1"],
    previewRows: preview.rows,
    patches,
    skipPoolRecalculation: true,
    syncFn: async (_sb, opts) => {
      for (const patch of opts.patches ?? []) {
        const target = dbRowsByCode[patch.matchCode];
        if (!target) continue;
        target.home_goals = patch.homeGoals;
        target.away_goals = patch.awayGoals;
        target.status = patch.status ?? "finished";
      }
      await seedOfficialWc2026KnockoutFixtures(
        {
          from() {
            return {
              select() {
                return {
                  eq() {
                    return {
                      in: async (_c: string, codes: string[]) => ({
                        data: codes.map((code) => ({
                          match_code: code,
                          kickoff_at: "2026-07-01T20:00:00.000Z",
                          round_index: 0,
                          stage_code: "round_of_32",
                        })),
                        error: null,
                      }),
                    };
                  },
                };
              },
              insert: async () => ({ error: null }),
              update(patch: Record<string, unknown>) {
                return {
                  eq() {
                    return {
                      eq: (_c: string, code: string) => {
                        const existing = dbRowsByCode[code];
                        if (existing) Object.assign(existing, patch);
                        return Promise.resolve({ error: null });
                      },
                    };
                  },
                };
              },
            };
          },
        } as unknown as SupabaseClient,
        { editionId: "edition-live" },
      );
      return {
        ok: true,
        summary: {
          matchCount: 104,
          matchesWithScoresCount: 1,
          finishedMatchCount: 1,
          derivedResultsInserted: 1,
          poolsRecalculated: 0,
          syncLockedMatchCount: 0,
          patchesApplied: 1,
          patchesSkipped: 0,
          roundOf32Publish: null,
        },
        patchOutcome: { applied: ["M73"], skipped: [] },
      };
    },
  });

  assert(out.ok, out.ok ? "" : JSON.stringify(out));
  assert.equal(dbRowsByCode.M73?.status, "finished");
  assert.equal(dbRowsByCode.M73?.home_goals, 0);
  assert.equal(dbRowsByCode.M73?.away_goals, 1);
}

async function run() {
  await testSeedPreservesFinishedStatus();
  await testStepAWritesScoreAndStatus();
  await testStepAWritesStatusWhenScoreAlreadyCorrect();
  console.log("stepAStatusPersist.selftest.ts: all assertions passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
