#!/usr/bin/env tsx
/**
 * Audit best third-place advancer picks vs official results and ledger rows.
 *
 *   npx tsx scripts/audit-third-place-picks.ts "FAMPOOL"
 */
import { createClient } from "@supabase/supabase-js";
import { computePoolScores } from "../src/lib/scoring/computePoolScores";
import { mapResultRow, mapScoringRuleRow } from "../src/lib/scoring/mapSupabaseRows";
import { ensureThirdPlaceQualifierResults } from "../lib/scoring/ensureThirdPlaceQualifierResults";
import {
  areThirdPlaceQualifiersSettled,
  resolveOfficialThirdPlaceAdvancers,
  r32FixturesFromTournamentMatches,
} from "../lib/scoring/resolveOfficialThirdPlaceAdvancers";
import { fetchPoolPredictions } from "../lib/predictions/fetchPoolPredictions";
import { loadEnvLocal } from "./loadEnvLocal";

async function main() {
  const identifier = process.argv[2]?.trim() ?? "FAMPOOL";
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: pools, error: poolErr } = await supabase
    .from("pools")
    .select("id, name, tournament_edition_id, group_advance_exact_points, group_advance_wrong_slot_points")
    .ilike("name", `%${identifier}%`);
  if (poolErr || !pools?.length) {
    console.error(poolErr?.message ?? `No pool matching ${identifier}`);
    process.exit(1);
  }
  if (pools.length > 1) {
    console.error(
      `Ambiguous pool name. Matches:\n${pools.map((p) => `  - ${p.name} (${p.id})`).join("\n")}`,
    );
    process.exit(1);
  }

  const pool = pools[0]!;
  const poolId = pool.id as string;
  const editionId = pool.tournament_edition_id as string;
  console.log(`\n=== Third-place audit: ${pool.name} (${poolId}) ===\n`);

  const ensure = await ensureThirdPlaceQualifierResults(supabase, editionId);
  if (ensure.upsertedCount > 0) {
    console.log(
      `Upserted ${ensure.upsertedCount} derived third_place_qualifier result rows (source: ${ensure.resolution.source}).\n`,
    );
  }

  const [{ data: stages }, { data: resultsRaw }, { data: matches }, { data: teams }] =
    await Promise.all([
      supabase.from("tournament_stages").select("id, code"),
      supabase
        .from("results")
        .select(
          "id, tournament_stage_id, kind, team_id, group_code, slot_key, value_text, resolved_at, created_at, edition_id",
        )
        .eq("edition_id", editionId),
      supabase
        .from("tournament_matches")
        .select("match_code, home_team_id, away_team_id, stage_code")
        .eq("edition_id", editionId)
        .eq("stage_code", "round_of_32"),
      supabase.from("teams").select("id, name, country_code"),
    ]);

  const r32StageId = stages?.find((s) => s.code === "round_of_32")?.id as string;
  const results = (resultsRaw ?? []).map(mapResultRow);
  const teamById = new Map((teams ?? []).map((t) => [t.id as string, t]));

  const resolution = resolveOfficialThirdPlaceAdvancers({
    results,
    roundOf32StageId: r32StageId,
    r32Fixtures: r32FixturesFromTournamentMatches(matches ?? []),
  });

  console.log("Official third-place advancers:");
  console.log(
    `  settled=${resolution.settled} source=${resolution.source} count=${resolution.advancers.length}`,
  );
  for (const adv of resolution.advancers) {
    const team = teamById.get(adv.teamId);
    console.log(
      `  slot ${adv.slotKey}: ${team?.name ?? adv.teamId} (${team?.country_code ?? "?"})`,
    );
  }

  const { data: rulesRaw } = await supabase
    .from("scoring_rules")
    .select("id, pool_id, prediction_kind, bonus_key, points, created_at, updated_at")
    .eq("pool_id", poolId)
    .eq("prediction_kind", "third_place_qualifier");
  const thirdRule = (rulesRaw ?? []).map(mapScoringRuleRow)[0];
  const pointsPerCorrect = thirdRule?.points ?? 0;
  console.log(`\nScoring rule: third_place_qualifier = ${pointsPerCorrect} pts`);

  const poolPredictions = await fetchPoolPredictions(supabase, { poolId });
  if (poolPredictions.error) {
    console.error(poolPredictions.error);
    process.exit(1);
  }

  const thirdPreds = poolPredictions.predictions.filter(
    (p) => p.predictionKind === "third_place_qualifier" && p.teamId,
  );
  const officialIds = new Set(resolution.advancers.map((a) => a.teamId));

  const { data: participants } = await supabase
    .from("participants")
    .select("id, display_name")
    .eq("pool_id", poolId);

  const { data: ledgerRows } = await supabase
    .from("points_ledger")
    .select("participant_id, prediction_id, points_delta, prediction_kind")
    .eq("pool_id", poolId)
    .eq("prediction_kind", "third_place_qualifier");

  const ledgerByParticipant = new Map<string, number>();
  for (const row of ledgerRows ?? []) {
    const pid = row.participant_id as string;
    ledgerByParticipant.set(pid, (ledgerByParticipant.get(pid) ?? 0) + 1);
  }

  console.log("\nParticipants:");
  for (const participant of participants ?? []) {
    const pid = participant.id as string;
    const picks = thirdPreds.filter((p) => p.participantId === pid);
    const correct = picks.filter((p) => officialIds.has(p.teamId!)).length;
    const expectedPoints = correct * pointsPerCorrect;
    const ledgerCount = ledgerByParticipant.get(pid) ?? 0;
    const missing = areThirdPlaceQualifiersSettled(resolution) && ledgerCount < correct;

    console.log(`\n  ${participant.display_name} (${pid})`);
    console.log(`    third-place picks: ${picks.length}`);
    console.log(`    correct: ${correct}`);
    console.log(`    expected points: ${expectedPoints}`);
    console.log(`    ledger rows: ${ledgerCount}`);
    if (missing) console.log("    *** MISSING LEDGER ROWS ***");

    for (const pick of picks) {
      const team = teamById.get(pick.teamId!);
      const hit = officialIds.has(pick.teamId!);
      console.log(
        `      Group ${pick.groupCode ?? "?"}: ${team?.name ?? pick.teamId} → ${hit ? "CORRECT" : "miss"}`,
      );
    }
  }

  const expectedOutcome = computePoolScores({
    poolId,
    predictions: poolPredictions.predictions,
    results,
    scoringRules: (rulesRaw ?? []).map(mapScoringRuleRow),
  });
  const expectedThirdLedger = expectedOutcome.ledgerLines.filter(
    (l) => l.predictionKind === "third_place_qualifier",
  );
  console.log(`\nExpected third-place ledger lines after recompute: ${expectedThirdLedger.length}`);
  console.log(`Actual third-place ledger lines in DB: ${ledgerRows?.length ?? 0}`);

  if (
    areThirdPlaceQualifiersSettled(resolution) &&
    (ledgerRows?.length ?? 0) < expectedThirdLedger.length
  ) {
    console.log("\nRun: npx tsx scripts/recompute-pool-by-name.ts \"" + pool.name + "\"");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
