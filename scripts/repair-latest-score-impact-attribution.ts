#!/usr/bin/env tsx
/**
 * Repair a stale ash_score_impact row that mislabeled a knockout progression
 * update as a third-place scoring correction (empty match_codes + false
 * scoring_corrections after a patch-less recompute).
 *
 * Does NOT touch points_ledger or standings.
 *
 * Preview:
 *   npx tsx scripts/repair-latest-score-impact-attribution.ts "Fampool 2026"
 *
 * Apply:
 *   npx tsx scripts/repair-latest-score-impact-attribution.ts "Fampool 2026" --apply
 *
 * Optional match code override:
 *   npx tsx scripts/repair-latest-score-impact-attribution.ts "Fampool 2026" --match M101 --apply
 */
import { createClient } from "@supabase/supabase-js";
import {
  buildScoreImpactMatchResultsFromMatchCodes,
  scoreImpactSignatureFromMatchResults,
} from "../lib/poolActivity/scoreImpact/buildScoreImpactMatchResults";
import { loadTeamNameMapForEdition } from "../lib/poolActivity/scoreImpact/loadScoreImpactContext";
import { parseMatchupFromScoreLabel } from "../lib/leaderboard/parseLatestScoreEventContext";
import { loadEnvLocal } from "./loadEnvLocal";

loadEnvLocal();

function usage(): never {
  console.error(
    'Usage: npx tsx scripts/repair-latest-score-impact-attribution.ts "<pool name>" [--match M101] [--apply]',
  );
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const matchFlagIdx = args.indexOf("--match");
  const matchOverride =
    matchFlagIdx >= 0 ? args[matchFlagIdx + 1]?.trim() : undefined;
  const poolIdentifier = args.find((a) => !a.startsWith("--") && a !== matchOverride);
  if (!poolIdentifier) usage();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: pools, error: poolErr } = await supabase
    .from("pools")
    .select("id, name, tournament_edition_id")
    .ilike("name", `%${poolIdentifier}%`);
  if (poolErr || !pools?.length) {
    console.error(poolErr?.message ?? `No pool matching ${poolIdentifier}`);
    process.exit(1);
  }
  if (pools.length > 1) {
    console.error(`Ambiguous pool: ${pools.map((p) => p.name).join(", ")}`);
    process.exit(1);
  }
  const pool = pools[0]!;
  const poolId = pool.id as string;
  const editionId = pool.tournament_edition_id as string;
  console.log(`Pool: ${pool.name} (${poolId})`);

  const { data: impact, error: impactErr } = await supabase
    .from("pool_activity")
    .select("id, created_at, updated_at, body_text, metadata_json")
    .eq("pool_id", poolId)
    .eq("type", "ash_score_impact")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (impactErr) throw new Error(impactErr.message);
  if (!impact) {
    console.error("No ash_score_impact row found.");
    process.exit(1);
  }

  const meta = {
    ...((impact.metadata_json ?? {}) as Record<string, unknown>),
  };
  const existingCodes = Array.isArray(meta.match_codes)
    ? meta.match_codes.filter((c): c is string => typeof c === "string")
    : [];
  const corrections = Array.isArray(meta.scoring_corrections)
    ? meta.scoring_corrections
    : [];
  const hasFalseThirdPlace =
    corrections.some(
      (entry) =>
        entry != null &&
        typeof entry === "object" &&
        (entry as { kind?: unknown }).kind === "third_place_qualifier",
    ) && existingCodes.length === 0;

  console.log("Latest impact:", {
    id: impact.id,
    created_at: impact.created_at,
    match_codes: existingCodes,
    score_signature: meta.score_signature,
    scoring_corrections: corrections,
    hasFalseThirdPlacePattern: hasFalseThirdPlace,
  });

  if (!hasFalseThirdPlace && !matchOverride) {
    console.log(
      "Row does not match the known malformed pattern (empty match_codes + third_place correction). Pass --match to force attribution repair.",
    );
    process.exit(0);
  }

  let matchCode = matchOverride ?? "";
  if (!matchCode) {
    // Prefer a finished KO match whose scoring_result_kind is finalist and
    // whose winner is a finalist in results — typically the sync that caused +8.
    const { data: finalists } = await supabase
      .from("results")
      .select("team_id, kind")
      .eq("edition_id", editionId)
      .eq("kind", "finalist");
    const finalistTeamIds = new Set(
      (finalists ?? []).map((r) => r.team_id as string).filter(Boolean),
    );
    const { data: candidates } = await supabase
      .from("tournament_matches")
      .select(
        "match_code, home_team_id, away_team_id, home_goals, away_goals, winner_team_id, scoring_result_kind, stage_code, group_code, updated_at",
      )
      .eq("edition_id", editionId)
      .eq("status", "finished")
      .eq("scoring_result_kind", "finalist")
      .order("updated_at", { ascending: false });
    const grounded = (candidates ?? []).find(
      (m) =>
        m.winner_team_id &&
        finalistTeamIds.has(m.winner_team_id as string) &&
        m.home_goals != null &&
        m.away_goals != null,
    );
    matchCode = (grounded?.match_code as string | undefined) ?? "";
  }

  if (!matchCode) {
    console.error("Could not infer a match code. Pass --match M101.");
    process.exit(1);
  }

  const { data: matchRow, error: matchErr } = await supabase
    .from("tournament_matches")
    .select(
      "match_code, group_code, stage_code, home_team_id, away_team_id, home_goals, away_goals, winner_team_id",
    )
    .eq("edition_id", editionId)
    .eq("match_code", matchCode)
    .maybeSingle();
  if (matchErr || !matchRow) {
    console.error(matchErr?.message ?? `Match ${matchCode} not found`);
    process.exit(1);
  }

  const teamNameById = await loadTeamNameMapForEdition(supabase, editionId);
  const matchResults = buildScoreImpactMatchResultsFromMatchCodes({
    matches: [matchRow],
    matchCodes: [matchCode],
    teamNameById,
  });
  if (matchResults.length === 0) {
    console.error("Failed to build match results for", matchCode);
    process.exit(1);
  }

  const primary = matchResults[0]!;
  const parsed = parseMatchupFromScoreLabel(primary.label);
  const scoreSignature = scoreImpactSignatureFromMatchResults(matchResults);

  const nextMeta: Record<string, unknown> = {
    ...meta,
    match_codes: [matchCode],
    match_id: matchCode,
    match_label: primary.label,
    scoreline: primary.label,
    score_signature: scoreSignature,
    scoring_corrections: [],
    reason: "knockout_result",
  };
  delete nextMeta.match_attribution_inferred;

  if (parsed.winnerTeamName && parsed.loserTeamName) {
    const priorBracket =
      meta.bracket_impact != null && typeof meta.bracket_impact === "object"
        ? (meta.bracket_impact as Record<string, unknown>)
        : {};
    nextMeta.bracket_impact = {
      ...priorBracket,
      winner_team_name: parsed.winnerTeamName,
      loser_team_name: parsed.loserTeamName,
    };
  }

  const winnerName = parsed.winnerTeamName;
  const loserName = parsed.loserTeamName;
  const nextBody =
    winnerName && loserName
      ? `${primary.label} is final.\nAll participants who had ${winnerName} in their knockout path gained points from ${winnerName} def. ${loserName}.`
      : `${primary.label} is final.`;

  console.log("\nPlanned metadata repair:");
  console.log({
    match_codes: nextMeta.match_codes,
    match_label: nextMeta.match_label,
    score_signature: nextMeta.score_signature,
    scoring_corrections: nextMeta.scoring_corrections,
    bracket_winner: parsed.winnerTeamName,
    bracket_loser: parsed.loserTeamName,
    body_preview: nextBody.slice(0, 180),
  });
  console.log(
    "\nStandings snapshot (previous_standings / standings_hash) left unchanged. Ledger untouched.",
  );

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to write.");
    return;
  }

  const { error: updateErr } = await supabase
    .from("pool_activity")
    .update({
      metadata_json: nextMeta,
      body_text: nextBody,
      updated_at: new Date().toISOString(),
    })
    .eq("id", impact.id);
  if (updateErr) throw new Error(updateErr.message);

  console.log(`\nUpdated ash_score_impact ${impact.id} for ${pool.name}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
