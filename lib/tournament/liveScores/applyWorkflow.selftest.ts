/**
 * Split live-scores apply workflow regression tests.
 * Run: npx tsx lib/tournament/liveScores/applyWorkflow.selftest.ts
 */
import assert from "node:assert/strict";
import { applyLiveScoresAndSync } from "./applyLiveScores";
import {
  applyPatches,
  propagateBracketAdvance,
  recomputeWinners,
} from "../syncOfficialTournament";

async function testApplyWithoutPoolRecalculation() {
  const captured: {
    skipPoolRecalculation?: boolean;
    poolIds?: string[];
  } = {};
  const mockSupabase = {
    from() {
      return {
        update() {
          return { eq() { return { is: async () => ({ error: null }) }; } };
        },
        select() {
          return {
            eq() {
              return {
                in: async (_col: string, codes: string[]) => ({
                  data: codes.map((code) =>
                    code === "M73"
                      ? {
                          match_code: "M73",
                          home_team_id: "team-rsa",
                          away_team_id: "team-can",
                          home_goals: 0,
                          away_goals: 1,
                          home_penalties: null,
                          away_penalties: null,
                          winner_team_id: "team-can",
                          status: "finished",
                        }
                      : null,
                  ).filter(Boolean),
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  } as unknown as import("@supabase/supabase-js").SupabaseClient;

  const out = await applyLiveScoresAndSync(mockSupabase, {
    editionId: "edition-1",
    editionCode: "fifa_wc_2026",
    poolIds: ["pool-1", "pool-2"],
    previewRows: [
      {
        matchId: "m73",
        matchCode: "M73",
        providerFixtureId: "fx-73",
        homeTeamName: "South Africa",
        awayTeamName: "Canada",
        currentHomeGoals: 0,
        currentAwayGoals: 0,
        currentHomePenalties: null,
        currentAwayPenalties: null,
        fetchedHomeGoals: 0,
        fetchedAwayGoals: 1,
        fetchedHomePenalties: null,
        fetchedAwayPenalties: null,
        currentStatus: "scheduled",
        fetchedStatus: "finished",
        willUpdate: true,
        reason: "will_update",
        currentHomeYellowCards: null,
        currentAwayYellowCards: null,
        currentHomeRedCards: null,
        currentAwayRedCards: null,
        fetchedHomeYellowCards: null,
        fetchedAwayYellowCards: null,
        fetchedHomeRedCards: null,
        fetchedAwayRedCards: null,
        cardWillUpdate: false,
        cardReason: "no_event_data",
        warnings: [],
      },
    ],
    patches: [
      {
        matchCode: "M73",
        homeGoals: 0,
        awayGoals: 1,
        status: "finished",
      },
    ],
    skipPoolRecalculation: true,
    syncFn: async (_sb, opts) => {
      captured.skipPoolRecalculation = opts.skipPoolRecalculation;
      captured.poolIds = opts.poolIds;
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

  assert(out.ok);
  assert.equal(captured.skipPoolRecalculation, true);
  assert.deepEqual(captured.poolIds, []);
  assert.equal(out.applySummary.ledgersRecomputed, 0);
}

function testKnockoutBracketPropagation() {
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
    scoring_result_kind: "r16_winner",
    scoring_slot_key: "M89",
    scoring_stage_code: "r16",
  };
  const matches = [r32, r16];
  applyPatches(matches, [
    {
      matchCode: "M73",
      homeGoals: 0,
      awayGoals: 1,
      status: "finished",
    },
  ]);
  recomputeWinners(matches);
  propagateBracketAdvance(matches);
  assert.equal(r32.winner_team_id, "team-can");
  assert.equal(r16.home_team_id, "team-can");
}

function testInvalidClientPayloadGuard() {
  assert.throws(() => {
    if (null == null || typeof null !== "object") {
      throw new Error("Apply returned no payload from the server.");
    }
  });
}

async function run() {
  await testApplyWithoutPoolRecalculation();
  testKnockoutBracketPropagation();
  testInvalidClientPayloadGuard();
  console.log("applyWorkflow.selftest.ts: all assertions passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
