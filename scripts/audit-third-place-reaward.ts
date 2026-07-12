#!/usr/bin/env tsx
/**
 * Prove whether third-place qualifier points are being re-awarded on later syncs,
 * or whether the leaderboard is comparing against a stale pre-correction baseline.
 *
 * Read-only — does not mutate production data.
 *
 *   npx tsx scripts/audit-third-place-reaward.ts "FAMPOOL 2026"
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildLatestPointsBreakdownByParticipantId } from "../lib/leaderboard/computeLatestMatchPointsBreakdown";
import { buildLeaderboardMomentum } from "../lib/leaderboard/buildLeaderboardMomentum";
import { buildPoolStandingsFromLedger } from "../lib/leaderboard/buildPoolStandingsFromLedger";
import { enrichScoreImpactEventMetadata } from "../lib/leaderboard/enrichScoreImpactEventMetadata";
import { fetchPoolLedgerLinesForStandings } from "../lib/leaderboard/fetchPoolLedgerLinesForStandings";
import {
  formatLeaderboardLatestImpactSummary,
} from "../lib/leaderboard/leaderboardBracketImpactDisplay";
import { parseLatestScoreEventContext } from "../lib/leaderboard/parseLatestScoreEventContext";
import {
  parsePreviousStandingsFromMetadata,
} from "../lib/leaderboard/validateLeaderboardMomentumSnapshot";
import { THIRD_PLACE_SCORING_BACKFILL_2026_SOURCE_KEY } from "../lib/poolActivity/thirdPlaceScoringBackfillAnnouncement";
import { loadEnvLocal } from "./loadEnvLocal";

const FOCUS_NAMES = [
  "Emil",
  "Adarsh",
  "Fraser",
  "Joel",
  "WinnerWinnerChickenDinner",
];

type LedgerRow = {
  id: string;
  participant_id: string;
  points_delta: number | string | null;
  prediction_kind: string | null;
  prediction_id: string | null;
  result_id: string | null;
  note: string | null;
  created_at: string;
};

type ResultRow = {
  id: string;
  kind: string;
  team_id: string | null;
  group_code: string | null;
  slot_key: string | null;
  created_at: string;
  resolved_at: string | null;
};

async function resolvePool(
  supabase: SupabaseClient,
  identifier: string,
): Promise<{ poolId: string; poolName: string; editionId: string }> {
  const { data, error } = await supabase
    .from("pools")
    .select("id, name, tournament_edition_id")
    .ilike("name", `%${identifier}%`);
  if (error) throw new Error(error.message);
  const pools = data ?? [];
  if (pools.length !== 1) {
    throw new Error(
      pools.length === 0
        ? `No pool matching "${identifier}"`
        : `Ambiguous pool: ${pools.map((p) => p.name).join(", ")}`,
    );
  }
  const pool = pools[0]!;
  if (!pool.tournament_edition_id) throw new Error("Pool has no tournament_edition_id");
  return {
    poolId: pool.id as string,
    poolName: String(pool.name),
    editionId: pool.tournament_edition_id as string,
  };
}

async function fetchAllLedger(
  supabase: SupabaseClient,
  poolId: string,
): Promise<LedgerRow[]> {
  const pageSize = 1000;
  const rows: LedgerRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("points_ledger")
      .select(
        "id, participant_id, points_delta, prediction_kind, prediction_id, result_id, note, created_at",
      )
      .eq("pool_id", poolId)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as LedgerRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

function pts(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function nameMatchesFocus(displayName: string): boolean {
  const lower = displayName.toLowerCase();
  return FOCUS_NAMES.some((focus) => lower.includes(focus.toLowerCase()));
}

async function main() {
  const identifier = process.argv[2]?.trim() ?? "FAMPOOL 2026";
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

  const { poolId, poolName, editionId } = await resolvePool(supabase, identifier);
  console.log(`\n=== Third-place re-award / stale-baseline audit ===`);
  console.log(`Pool: ${poolName} (${poolId})`);
  console.log(`Edition: ${editionId}\n`);

  // --- Official third-place results ---
  const { data: tpResults, error: tpResErr } = await supabase
    .from("results")
    .select("id, kind, team_id, group_code, slot_key, created_at, resolved_at")
    .eq("edition_id", editionId)
    .eq("kind", "third_place_qualifier")
    .order("slot_key", { ascending: true });
  if (tpResErr) throw new Error(tpResErr.message);
  const thirdPlaceResults = (tpResults ?? []) as ResultRow[];

  const { data: teamsRaw } = await supabase.from("teams").select("id, name");
  const teamName = new Map(
    (teamsRaw ?? []).map((t) => [t.id as string, (t.name as string) ?? t.id]),
  );

  console.log("--- 1. Official third-place qualifier results ---");
  console.log(`Count: ${thirdPlaceResults.length} (expected 8)`);
  for (const r of thirdPlaceResults) {
    console.log(
      `  slot=${r.slot_key ?? "?"} team=${teamName.get(r.team_id ?? "") ?? r.team_id} result_id=${r.id.slice(0, 8)}… created=${r.created_at} resolved=${r.resolved_at ?? "—"}`,
    );
  }
  const resultCreatedMin = thirdPlaceResults
    .map((r) => r.created_at)
    .sort()[0];
  const resultCreatedMax = thirdPlaceResults
    .map((r) => r.created_at)
    .sort()
    .at(-1);

  // --- Participants ---
  const { data: participants, error: pErr } = await supabase
    .from("participants")
    .select("id, display_name")
    .eq("pool_id", poolId);
  if (pErr) throw new Error(pErr.message);
  const nameById = new Map(
    (participants ?? []).map((p) => [
      p.id as string,
      (p.display_name as string | null) ?? "Participant",
    ]),
  );

  // --- Ledger third-place rows ---
  const fullLedger = await fetchAllLedger(supabase, poolId);
  const tpLedger = fullLedger.filter(
    (r) => r.prediction_kind === "third_place_qualifier",
  );

  console.log("\n--- 2. Third-place points_ledger rows ---");
  console.log(`Logical third-place ledger row count: ${tpLedger.length}`);
  const ledgerCreatedSet = new Set(tpLedger.map((r) => r.created_at));
  console.log(
    `Distinct created_at timestamps: ${ledgerCreatedSet.size} (${[...ledgerCreatedSet].sort().join(", ") || "none"})`,
  );
  console.log(
    `NOTE: replace_points_ledger_for_pool deletes+reinserts all rows on every recompute, so created_at reflects the latest recompute, not the original award time.`,
  );

  // Duplicate detection: same participant + result_id + prediction_kind
  const dupKeyCounts = new Map<string, LedgerRow[]>();
  for (const row of tpLedger) {
    const key = `${row.participant_id}|${row.result_id ?? "null"}|${row.prediction_kind}`;
    const list = dupKeyCounts.get(key) ?? [];
    list.push(row);
    dupKeyCounts.set(key, list);
  }
  const duplicates = [...dupKeyCounts.entries()].filter(([, rows]) => rows.length > 1);
  console.log(`Duplicate logical keys (participant+result+kind): ${duplicates.length}`);
  if (duplicates.length > 0) {
    console.log("  *** REPEATED-AWARD WARNING: duplicate ledger rows found ***");
    for (const [key, rows] of duplicates.slice(0, 20)) {
      console.log(
        `  ${nameById.get(rows[0]!.participant_id) ?? key}: ${rows.length} rows, points=${rows.map((r) => pts(r.points_delta)).join("+")}, ids=${rows.map((r) => r.id.slice(0, 8)).join(",")}`,
      );
    }
  }

  // Also check participant+prediction_id duplicates
  const predDupCounts = new Map<string, number>();
  for (const row of tpLedger) {
    const key = `${row.participant_id}|${row.prediction_id ?? "null"}`;
    predDupCounts.set(key, (predDupCounts.get(key) ?? 0) + 1);
  }
  const predDups = [...predDupCounts.entries()].filter(([, n]) => n > 1);
  console.log(`Duplicate participant+prediction_id keys: ${predDups.length}`);

  // Per-participant third-place totals
  const tpPointsByParticipant = new Map<string, number>();
  const tpRowCountByParticipant = new Map<string, number>();
  for (const row of tpLedger) {
    tpPointsByParticipant.set(
      row.participant_id,
      (tpPointsByParticipant.get(row.participant_id) ?? 0) + pts(row.points_delta),
    );
    tpRowCountByParticipant.set(
      row.participant_id,
      (tpRowCountByParticipant.get(row.participant_id) ?? 0) + 1,
    );
  }

  const { data: rulesRaw } = await supabase
    .from("scoring_rules")
    .select("prediction_kind, points")
    .eq("pool_id", poolId);
  const rulesByKind = new Map(
    (rulesRaw ?? []).map((r) => [r.prediction_kind as string, Number(r.points)]),
  );
  const tpPointsPerPick = rulesByKind.get("third_place_qualifier") ?? 0;
  console.log(`third_place_qualifier points per pick: ${tpPointsPerPick}`);

  // Expected from predictions
  const officialTeamIds = new Set(
    thirdPlaceResults.map((r) => r.team_id).filter((id): id is string => Boolean(id)),
  );
  const { data: preds } = await supabase
    .from("predictions")
    .select("participant_id, prediction_kind, team_id, slot_key, id")
    .eq("pool_id", poolId)
    .eq("prediction_kind", "third_place_qualifier");

  const expectedByParticipant = new Map<string, number>();
  for (const pred of preds ?? []) {
    const teamId = pred.team_id as string | null;
    if (!teamId || !officialTeamIds.has(teamId)) continue;
    const pid = pred.participant_id as string;
    expectedByParticipant.set(
      pid,
      (expectedByParticipant.get(pid) ?? 0) + tpPointsPerPick,
    );
  }

  let expectedMismatch = 0;
  for (const [pid, expected] of expectedByParticipant) {
    const actual = tpPointsByParticipant.get(pid) ?? 0;
    if (actual !== expected) {
      expectedMismatch += 1;
      console.log(
        `  MISMATCH ${nameById.get(pid)}: expected=${expected} ledger=${actual} rows=${tpRowCountByParticipant.get(pid) ?? 0}`,
      );
    }
  }
  for (const [pid, actual] of tpPointsByParticipant) {
    if (!expectedByParticipant.has(pid) && actual !== 0) {
      expectedMismatch += 1;
      console.log(
        `  UNEXPECTED ${nameById.get(pid)}: ledger=${actual} but no matching picks`,
      );
    }
  }
  console.log(
    expectedMismatch === 0
      ? "Ledger third-place totals match expected picks (once each). IDEMPOTENT."
      : `*** ${expectedMismatch} participants have third-place ledger totals ≠ expected ***`,
  );

  // Print all third-place ledger rows (compact)
  console.log("\n--- Third-place ledger detail ---");
  console.log(
    "participant\tresult_id\tslot/note\tpoints\tcreated_at\tprediction_id",
  );
  for (const row of [...tpLedger].sort((a, b) => {
    const na = nameById.get(a.participant_id) ?? "";
    const nb = nameById.get(b.participant_id) ?? "";
    return na.localeCompare(nb) || a.created_at.localeCompare(b.created_at);
  })) {
    const result = thirdPlaceResults.find((r) => r.id === row.result_id);
    console.log(
      [
        nameById.get(row.participant_id) ?? row.participant_id.slice(0, 8),
        row.result_id?.slice(0, 8) ?? "—",
        result
          ? `slot=${result.slot_key} ${teamName.get(result.team_id ?? "") ?? "?"}`
          : (row.note ?? "—").slice(0, 40),
        pts(row.points_delta),
        row.created_at,
        row.prediction_id?.slice(0, 8) ?? "—",
      ].join("\t"),
    );
  }

  // --- Timeline: backfill notice + score impacts ---
  console.log("\n--- 3. Timeline (activity + results) ---");

  const { data: backfillNotice } = await supabase
    .from("pool_activity")
    .select("id, created_at, updated_at, body_text, metadata_json")
    .eq("pool_id", poolId)
    .eq("type", "pool_milestone")
    .eq("metadata_json->>source_key", THIRD_PLACE_SCORING_BACKFILL_2026_SOURCE_KEY)
    .maybeSingle();

  const { data: scoreImpacts, error: siErr } = await supabase
    .from("pool_activity")
    .select("id, created_at, updated_at, body_text, metadata_json")
    .eq("pool_id", poolId)
    .eq("type", "ash_score_impact")
    .order("created_at", { ascending: true });
  if (siErr) throw new Error(siErr.message);

  console.log(
    `1. Original third-place result upsert window: ${resultCreatedMin ?? "—"} → ${resultCreatedMax ?? "—"}`,
  );
  console.log(
    `2. Third-place backfill milestone notice: ${backfillNotice?.created_at ?? "NOT FOUND"} (id=${backfillNotice?.id ?? "—"})`,
  );
  if (backfillNotice?.body_text) {
    console.log(`   body: ${String(backfillNotice.body_text).slice(0, 100)}`);
  }

  console.log(`3. ash_score_impact events (${scoreImpacts?.length ?? 0}):`);
  for (const ev of scoreImpacts ?? []) {
    const meta =
      ev.metadata_json && typeof ev.metadata_json === "object"
        ? (ev.metadata_json as Record<string, unknown>)
        : {};
    const matchCodes = Array.isArray(meta.match_codes) ? meta.match_codes : [];
    const corrections = Array.isArray(meta.scoring_corrections)
      ? meta.scoring_corrections
      : [];
    const prevCount = Array.isArray(meta.previous_standings)
      ? meta.previous_standings.length
      : 0;
    console.log(
      `   ${ev.created_at} updated=${ev.updated_at ?? "—"} id=${String(ev.id).slice(0, 8)}… trigger=${meta.trigger ?? "—"} matches=${JSON.stringify(matchCodes)} label=${meta.match_label ?? "—"} corrections=${JSON.stringify(corrections)} prev_standings=${prevCount}`,
    );
  }

  const latestImpact = (scoreImpacts ?? []).at(-1) ?? null;
  if (!latestImpact) {
    console.log("\nNo score-impact events — cannot continue baseline analysis.");
    return;
  }

  const rawMeta =
    latestImpact.metadata_json && typeof latestImpact.metadata_json === "object"
      ? (latestImpact.metadata_json as Record<string, unknown>)
      : {};

  const enrichedMeta = await enrichScoreImpactEventMetadata(
    supabase,
    poolId,
    rawMeta,
    { eventCreatedAt: latestImpact.created_at as string },
  );
  const meta = enrichedMeta ?? rawMeta;

  console.log("\n--- 4. Latest score-impact event detail ---");
  console.log(`activity id:     ${latestImpact.id}`);
  console.log(`created_at:      ${latestImpact.created_at}`);
  console.log(`updated_at:      ${latestImpact.updated_at ?? "—"}`);
  console.log(`trigger:         ${meta.trigger ?? "—"}`);
  console.log(`match_codes:     ${JSON.stringify(meta.match_codes ?? [])}`);
  console.log(`match_label:     ${meta.match_label ?? "—"}`);
  console.log(`scoreline:       ${meta.scoreline ?? "—"}`);
  console.log(
    `scoring_corrections: ${JSON.stringify(meta.scoring_corrections ?? null)}`,
  );
  console.log(
    `standings_capture_version: ${meta.standings_capture_version ?? "—"}`,
  );
  console.log(`source_key:      ${meta.source_key ?? "—"}`);
  console.log(`score_signature: ${meta.score_signature ?? "—"}`);

  const previousRows = parsePreviousStandingsFromMetadata(meta);
  console.log(`previous_standings rows: ${previousRows?.length ?? 0}`);

  const bracketImpact =
    meta.bracket_impact != null && typeof meta.bracket_impact === "object"
      ? (meta.bracket_impact as Record<string, unknown>)
      : null;
  if (bracketImpact) {
    console.log(
      `bracket_impact: uniform_points_delta=${bracketImpact.uniform_points_delta ?? "—"} winner=${bracketImpact.winner_team_name ?? "—"} loser=${bracketImpact.loser_team_name ?? "—"} participant_rows=${Array.isArray(bracketImpact.participant_rows) ? bracketImpact.participant_rows.length : 0}`,
    );
  }

  // Current standings
  const ledgerRes = await fetchPoolLedgerLinesForStandings(supabase, poolId);
  if (!ledgerRes.ok) throw new Error(ledgerRes.error);
  const standings = buildPoolStandingsFromLedger({
    poolId,
    poolName,
    participants: (participants ?? []).map((p) => ({
      id: p.id as string,
      display_name: p.display_name as string | null,
    })),
    ledgerLines: ledgerRes.ledgerLines,
  });

  const momentum = buildLeaderboardMomentum({
    currentRows: standings.map((r) => ({
      participantId: r.participantId,
      totalPoints: r.totalPoints,
      rank: r.rank,
    })),
    previousRows,
  });

  const event = parseLatestScoreEventContext(meta, {
    hasValidSnapshot: previousRows != null && previousRows.length > 0,
  });

  const eventMatchCodes = event?.matchCodes ?? [];
  const { data: eventMatchesRaw } =
    eventMatchCodes.length > 0
      ? await supabase
          .from("tournament_matches")
          .select(
            "match_code, stage_code, group_code, home_team_id, away_team_id, winner_team_id, scoring_result_kind, scoring_slot_key",
          )
          .eq("edition_id", editionId)
          .in("match_code", eventMatchCodes)
      : { data: [] };

  const allPreds = await supabase
    .from("predictions")
    .select("participant_id, prediction_kind, team_id, slot_key")
    .eq("pool_id", poolId);

  const momentumByParticipantId = new Map(
    momentum.rows.map((row) => [row.participantId, row]),
  );
  const breakdowns = event
    ? buildLatestPointsBreakdownByParticipantId({
        participantIds: standings.map((r) => r.participantId),
        momentumByParticipantId,
        event,
        predictions: (allPreds.data ?? []).map((p) => ({
          participantId: p.participant_id as string,
          predictionKind: p.prediction_kind as string,
          teamId: (p.team_id as string | null) ?? null,
          slotKey: (p.slot_key as string | null) ?? null,
        })),
        matches: (eventMatchesRaw ?? []).map((row) => ({
          matchCode: row.match_code as string,
          stageCode: (row.stage_code as string | null) ?? null,
          groupCode: (row.group_code as string | null) ?? null,
          homeTeamId: (row.home_team_id as string | null) ?? null,
          awayTeamId: (row.away_team_id as string | null) ?? null,
          winnerTeamId: (row.winner_team_id as string | null) ?? null,
          scoringResultKind: (row.scoring_result_kind as string | null) ?? null,
          scoringSlotKey: (row.scoring_slot_key as string | null) ?? null,
        })),
        rulesByKind,
        officialThirdPlaceAdvancerTeamIds: officialTeamIds,
        thirdPlaceQualifiersSettled: thirdPlaceResults.length >= 8,
      })
    : new Map();

  // --- Stale baseline detection ---
  console.log("\n--- 5. Stale-baseline vs re-award diagnosis ---");

  const backfillAt = backfillNotice?.created_at
    ? Date.parse(backfillNotice.created_at as string)
    : null;
  const latestAt = Date.parse(latestImpact.created_at as string);
  const newestTpLedgerAt = tpLedger
    .map((r) => r.created_at)
    .sort()
    .at(-1);
  const newestTpLedgerMs = newestTpLedgerAt ? Date.parse(newestTpLedgerAt) : null;

  console.log(`Backfill notice timestamp:     ${backfillNotice?.created_at ?? "—"}`);
  console.log(`Latest score-impact timestamp: ${latestImpact.created_at}`);
  console.log(`Newest third-place ledger created_at: ${newestTpLedgerAt ?? "—"}`);
  console.log(
    `Third-place ledger created after backfill notice: ${
      backfillAt != null && newestTpLedgerMs != null && newestTpLedgerMs > backfillAt + 60_000
        ? "YES (expected if later recomputes replaced the ledger)"
        : "NO / unknown"
    }`,
  );

  // Compare previous snapshot totals to: current - match_pts, and current - match_pts - third_place_ledger
  let staleBaselineCount = 0;
  let healthyBaselineCount = 0;
  let unexplainedCount = 0;

  type FocusRow = {
    name: string;
    current: number;
    previous: number | null;
    totalDelta: number | null;
    matchPts: number | null;
    displayThirdPlace: number | null;
    otherDelta: number | null;
    ledgerThirdPlace: number;
    expectedThirdPlace: number;
    previousImpliesPreCorrection: boolean;
    previousImpliesPostCorrection: boolean;
    latestLine: string | null;
    correctionLine: string | null;
  };
  const focusRows: FocusRow[] = [];

  console.log(
    "\nname\tcurrent\tprevious\tdelta\tmatch_pts\tdisplay_3rd\tledger_3rd\texpected_3rd\tbaseline_verdict\tlatest_line\tcorrection_line",
  );

  for (const row of [...standings].sort((a, b) => a.rank - b.rank)) {
    const mom = momentumByParticipantId.get(row.participantId);
    const breakdown = breakdowns.get(row.participantId);
    const ledgerTp = tpPointsByParticipant.get(row.participantId) ?? 0;
    const expectedTp = expectedByParticipant.get(row.participantId) ?? 0;
    const previous = mom?.previousPoints ?? null;
    const totalDelta = mom?.recentPointsGained ?? null;
    const matchPts = breakdown?.latestMatchPointsDelta ?? null;
    const displayTp = breakdown?.thirdPlaceQualifierDelta ?? null;
    const other = breakdown?.otherScoringDelta ?? null;

    // If previous + matchPts ≈ current, baseline is healthy (includes third-place already)
    // If previous + matchPts + ledgerTp ≈ current, baseline is stale (excludes third-place)
    let verdict = "—";
    if (previous != null && matchPts != null) {
      const healthyTarget = previous + matchPts;
      const staleTarget = previous + matchPts + ledgerTp;
      const eps = 0.01;
      if (Math.abs(healthyTarget - row.totalPoints) < eps) {
        verdict = "HEALTHY_BASELINE";
        healthyBaselineCount += 1;
      } else if (
        ledgerTp > 0 &&
        Math.abs(staleTarget - row.totalPoints) < eps
      ) {
        verdict = "STALE_BASELINE_EXCLUDES_3RD";
        staleBaselineCount += 1;
      } else if (
        displayTp != null &&
        displayTp > 0 &&
        Math.abs((previous + matchPts + displayTp) - row.totalPoints) < eps
      ) {
        verdict = "STALE_BASELINE_DISPLAY_3RD";
        staleBaselineCount += 1;
      } else {
        verdict = `UNEXPLAINED(prev+match=${healthyTarget}, curr=${row.totalPoints})`;
        unexplainedCount += 1;
      }
    }

    const summary = formatLeaderboardLatestImpactSummary({
      totalPoints: row.totalPoints,
      momentum: mom,
      event,
      pointsBreakdown: breakdown,
      participantId: row.participantId,
      displayName: row.displayName,
    });

    const line = [
      row.displayName,
      row.totalPoints,
      previous ?? "—",
      totalDelta ?? "—",
      matchPts ?? "—",
      displayTp ?? "—",
      ledgerTp,
      expectedTp,
      verdict,
      summary.latestLine ?? "—",
      summary.correctionLine ?? "—",
    ].join("\t");

    if (nameMatchesFocus(row.displayName) || verdict.startsWith("STALE") || verdict.startsWith("UNEXPLAINED")) {
      console.log(line);
    }

    if (nameMatchesFocus(row.displayName)) {
      focusRows.push({
        name: row.displayName,
        current: row.totalPoints,
        previous,
        totalDelta,
        matchPts,
        displayThirdPlace: displayTp,
        otherDelta: other,
        ledgerThirdPlace: ledgerTp,
        expectedThirdPlace: expectedTp,
        previousImpliesPreCorrection:
          previous != null &&
          ledgerTp > 0 &&
          Math.abs((previous + (matchPts ?? 0) + ledgerTp) - row.totalPoints) < 0.01,
        previousImpliesPostCorrection:
          previous != null &&
          Math.abs((previous + (matchPts ?? 0)) - row.totalPoints) < 0.01,
        latestLine: summary.latestLine,
        correctionLine: summary.correctionLine,
      });
    }
  }

  console.log(
    `\nBaseline summary: healthy=${healthyBaselineCount} stale=${staleBaselineCount} unexplained=${unexplainedCount}`,
  );
  if (staleBaselineCount > 0) {
    console.log(
      "*** STALE-BASELINE WARNING: previous_standings appear to exclude already-awarded third-place points ***",
    );
  }
  if (duplicates.length > 0) {
    console.log(
      "*** REPEATED-AWARD WARNING: duplicate third-place ledger rows exist ***",
    );
  } else {
    console.log(
      "No duplicate third-place ledger keys — points were not awarded twice in the ledger.",
    );
  }

  // Was previous snapshot captured before backfill?
  if (previousRows && previousRows.length > 0 && backfillAt != null) {
    // Infer: if many participants' previous = current - match - thirdPlace, snapshot is pre-correction
    console.log(
      `\nInference: latest previous_standings ${
        staleBaselineCount > healthyBaselineCount
          ? "LIKELY CAPTURED BEFORE (or never advanced past) the third-place correction"
          : "LIKELY INCLUDES the third-place correction"
      }.`,
    );
    console.log(
      `Backfill notice was at ${backfillNotice?.created_at}; latest impact at ${latestImpact.created_at}.`,
    );
    if (latestAt > backfillAt && staleBaselineCount > 0) {
      console.log(
        "Latest impact is AFTER the backfill notice, yet previous_standings still look pre-correction.",
      );
      console.log(
        "Likely cause: previous_standings was captured from live ledger state that still lacked third-place points,",
      );
      console.log(
        "OR an older score-impact row was updated in place while reusing/carrying a stale snapshot,",
      );
      console.log(
        "OR the movement baseline was never reset after the one-time correction.",
      );
    }
  }

  // Check historical score-impact for one that had scoring_corrections
  const correctionEvents = (scoreImpacts ?? []).filter((ev) => {
    const m =
      ev.metadata_json && typeof ev.metadata_json === "object"
        ? (ev.metadata_json as Record<string, unknown>)
        : {};
    return Array.isArray(m.scoring_corrections) && m.scoring_corrections.length > 0;
  });
  console.log(
    `\nScore-impact events with scoring_corrections metadata: ${correctionEvents.length}`,
  );
  for (const ev of correctionEvents) {
    const m = ev.metadata_json as Record<string, unknown>;
    console.log(
      `  ${ev.created_at} matches=${JSON.stringify(m.match_codes)} corrections=${JSON.stringify(m.scoring_corrections)}`,
    );
  }

  // Focus breakdown
  console.log("\n--- 6. Focus participants ---");
  for (const f of focusRows) {
    console.log(`\n${f.name}:`);
    console.log(`  current_total:              ${f.current}`);
    console.log(`  previous_snapshot_total:    ${f.previous ?? "—"}`);
    console.log(`  total_delta:                ${f.totalDelta ?? "—"}`);
    console.log(`  latest_match_points:        ${f.matchPts ?? "—"}`);
    console.log(`  display thirdPlace delta:   ${f.displayThirdPlace ?? "—"}`);
    console.log(`  other_delta:                ${f.otherDelta ?? "—"}`);
    console.log(`  ledger third-place points:  ${f.ledgerThirdPlace}`);
    console.log(`  expected third-place once:  ${f.expectedThirdPlace}`);
    console.log(
      `  previous includes 3rd pts:   ${f.previousImpliesPostCorrection ? "YES" : f.previousImpliesPreCorrection ? "NO (stale)" : "unclear"}`,
    );
    console.log(`  latest_line:                ${f.latestLine ?? "—"}`);
    console.log(`  correction_line:            ${f.correctionLine ?? "—"}`);
    if (
      f.displayThirdPlace != null &&
      f.displayThirdPlace > 0 &&
      f.ledgerThirdPlace === f.expectedThirdPlace &&
      f.previousImpliesPreCorrection
    ) {
      console.log(
        `  → Emil-style illusion: +${f.displayThirdPlace} is residual from stale baseline, NOT a new ledger award.`,
      );
    }
  }

  // Verdict
  console.log("\n========== VERDICT ==========");
  const awardedTwice = duplicates.length > 0 || expectedMismatch > 0;
  const staleBaseline = staleBaselineCount > 0;
  console.log(
    `Were third-place points awarded more than once in the ledger? ${awardedTwice ? "YES / MISMATCH" : "NO"}`,
  );
  console.log(
    `Were NEW logical third-place awards created during latest sync? ${
      awardedTwice
        ? "POSSIBLY (see duplicates/mismatches)"
        : "NO — ledger totals match one award each (rows may have been replaced by recompute)"
    }`,
  );
  console.log(
    `Is leaderboard comparing against a stale baseline? ${staleBaseline ? "YES (or residual misattributed)" : "NO"}`,
  );
  console.log(
    `Note: a uniform +N across nearly all participants often means once-per-team knockout progression`,
  );
  console.log(
    `(e.g. England QF→SF = +8), not third-place. Display must not relabel that residual as a third-place correction.`,
  );
  if (staleBaseline && !awardedTwice) {
    console.log(
      `Failure mode: B-style display — points not double-awarded; previous/residual attribution is misleading.`,
    );
    console.log(
      `Fix: attribute match points via once-per-team progression; thirdPlaceQualifierDelta only when scoring_corrections says so.`,
    );
  } else if (awardedTwice && !staleBaseline) {
    console.log(`Failure mode: A — duplicate/repeated third-place awards.`);
  } else if (awardedTwice && staleBaseline) {
    console.log(`Failure mode: BOTH A and B.`);
  } else {
    console.log(`No ledger failure detected by this audit.`);
  }
  console.log("=============================\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
