#!/usr/bin/env tsx
/**
 * Diagnose leaderboard points delta vs rank movement for a pool.
 *
 *   npx tsx scripts/audit-leaderboard-momentum.ts "FAMPOOL 2026"
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { capturePoolStandingsState } from "../lib/admin/pilotStandingsSnapshot";
import {
  assignCompetitionRanks,
  buildLeaderboardMomentum,
} from "../lib/leaderboard/buildLeaderboardMomentum";
import { buildPoolStandingsFromLedger } from "../lib/leaderboard/buildPoolStandingsFromLedger";
import { fetchPoolLedgerLinesForStandings } from "../lib/leaderboard/fetchPoolLedgerLinesForStandings";
import {
  parsePreviousStandingsFromMetadata,
  STANDINGS_CAPTURE_VERSION_KEY,
} from "../lib/leaderboard/validateLeaderboardMomentumSnapshot";
import { loadEnvLocal } from "./loadEnvLocal";

type PoolLookupRow = { id: string; name: string | null };

async function resolvePoolId(
  supabase: SupabaseClient,
  identifier: string,
): Promise<{ poolId: string; poolName: string }> {
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (uuidRe.test(identifier)) {
    const { data, error } = await supabase
      .from("pools")
      .select("id, name")
      .eq("id", identifier)
      .maybeSingle();
    const row = data as PoolLookupRow | null;
    if (error || !row?.id) throw new Error(error?.message ?? "Pool not found");
    return { poolId: row.id, poolName: String(row.name ?? identifier) };
  }

  const { data, error } = await supabase
    .from("pools")
    .select("id, name")
    .ilike("name", `%${identifier}%`);
  if (error) throw new Error(error.message);
  const matches = (data ?? []) as PoolLookupRow[];
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `No pool matching "${identifier}"`
        : `Ambiguous pool name "${identifier}" (${matches.length} matches)`,
    );
  }
  const match = matches[0]!;
  return { poolId: match.id, poolName: String(match.name ?? identifier) };
}

function readNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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

  const { poolId, poolName } = await resolvePoolId(supabase, identifier);
  console.log(`\n=== Leaderboard momentum audit: ${poolName} (${poolId}) ===\n`);

  const { data: activity, error: actErr } = await supabase
    .from("pool_activity")
    .select("id, created_at, updated_at, metadata_json")
    .eq("pool_id", poolId)
    .eq("type", "ash_score_impact")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (actErr) throw new Error(actErr.message);
  if (!activity?.metadata_json || typeof activity.metadata_json !== "object") {
    console.log("No ash_score_impact activity found.");
    return;
  }

  const metadata = activity.metadata_json as Record<string, unknown>;
  console.log("Latest score-impact activity:");
  console.log(`  id:         ${activity.id}`);
  console.log(`  created_at: ${activity.created_at}`);
  console.log(`  updated_at: ${activity.updated_at}`);
  console.log(`  match_id:   ${metadata.match_id ?? "—"}`);
  console.log(`  match_label:${metadata.match_label ?? "—"}`);
  console.log(`  capture_version: ${metadata[STANDINGS_CAPTURE_VERSION_KEY] ?? "—"}`);
  console.log(`  has_previous_snapshot: ${metadata.has_previous_snapshot}`);
  console.log(`  affected_count: ${metadata.affected_count ?? "—"}`);

  const { data: participants, error: pErr } = await supabase
    .from("participants")
    .select("id, display_name")
    .eq("pool_id", poolId);
  if (pErr) throw new Error(pErr.message);

  const ledgerRes = await fetchPoolLedgerLinesForStandings(supabase, poolId);
  if (!ledgerRes.ok) throw new Error(ledgerRes.error);

  const ledgerRows = buildPoolStandingsFromLedger({
    poolId,
    poolName,
    participants: (participants ?? []).map((p) => ({
      id: p.id as string,
      display_name: p.display_name as string | null,
    })),
    ledgerLines: ledgerRes.ledgerLines,
  });

  const { data: viewRows, error: viewErr } = await supabase
    .from("leaderboard_public")
    .select("participant_id, display_name, total_points, rank")
    .eq("pool_id", poolId)
    .order("rank", { ascending: true });
  if (viewErr) throw new Error(viewErr.message);

  const capture = await capturePoolStandingsState(supabase, poolId);

  const previousRows = parsePreviousStandingsFromMetadata(metadata);
  const storedMomentum = Array.isArray(metadata.leaderboard_momentum)
    ? (metadata.leaderboard_momentum as Record<string, unknown>[])
    : [];

  const recomputed = buildLeaderboardMomentum({
    currentRows: ledgerRows.map((r) => ({
      participantId: r.participantId,
      totalPoints: r.totalPoints,
      rank: r.rank,
    })),
    previousRows,
  });

  const recomputedWithOrdinalCurrent = buildLeaderboardMomentum({
    currentRows: capture.rows.map((r) => ({
      participantId: r.participantId,
      totalPoints: r.totalPoints,
      rank: r.rank,
    })),
    previousRows,
  });

  const previousRanksCompetition = previousRows
    ? assignCompetitionRanks(previousRows)
    : new Map<string, number>();

  const tieGroups = new Map<number, number>();
  for (const row of ledgerRows) {
    tieGroups.set(row.totalPoints, (tieGroups.get(row.totalPoints) ?? 0) + 1);
  }
  const tiedPointValues = [...tieGroups.entries()]
    .filter(([, count]) => count > 1)
    .map(([pts, count]) => `${pts}pts×${count}`)
    .join(", ");

  console.log(`\nParticipant count: ${ledgerRows.length}`);
  console.log(`Ledger lines: ${ledgerRes.ledgerLines.length} (${ledgerRes.pageCount} pages)`);
  console.log(`Tied totals: ${tiedPointValues || "none"}`);

  type AuditRow = {
    participant_id: string;
    display_name: string;
    previous_total: number | null;
    current_total: number;
    computed_delta: number | null;
    displayed_delta: number | null;
    previous_rank_stored: number | null;
    previous_rank_recomputed: number | null;
    current_rank_view: number;
    current_rank_ledger: number;
    current_rank_ordinal: number;
    computed_rank_delta: number | null;
    displayed_rank_delta: number | null;
    rank_delta_ordinal_bug: number | null;
    has_latest_event_ledger: string;
    latest_event_points: number | null;
  };

  const matchId = typeof metadata.match_id === "string" ? metadata.match_id : null;
  let latestResultId: string | null = null;
  if (matchId) {
    const { data: resultRow } = await supabase
      .from("results")
      .select("id")
      .eq("value_text", matchId)
      .maybeSingle();
    latestResultId = (resultRow?.id as string | undefined) ?? null;
  }

  const auditRows: AuditRow[] = [];

  for (const row of ledgerRows) {
    const view = (viewRows ?? []).find(
      (v) => (v.participant_id as string) === row.participantId,
    );
    const ordinal = capture.rows.find((r) => r.participantId === row.participantId);
    const stored = storedMomentum.find(
      (m) => m.participant_id === row.participantId,
    );
    const prevTotal = previousRows?.find(
      (p) => p.participantId === row.participantId,
    )?.totalPoints ?? null;

    const recomputedRow = recomputed.rows.find(
      (r) => r.participantId === row.participantId,
    );
    const ordinalBugRow = recomputedWithOrdinalCurrent.rows.find(
      (r) => r.participantId === row.participantId,
    );

    let latestEventPoints: number | null = null;
    let hasLatestLedger = "—";
    if (latestResultId) {
      const lines = ledgerRes.ledgerLines.filter(
        (l) =>
          l.participant_id === row.participantId &&
          (l as { result_id?: string }).result_id === latestResultId,
      );
      if (lines.length > 0) {
        latestEventPoints = lines.reduce(
          (s, l) => s + Number(l.points_delta ?? 0),
          0,
        );
        hasLatestLedger = `yes (${lines.length})`;
      } else {
        hasLatestLedger = "no";
      }
    }

    auditRows.push({
      participant_id: row.participantId,
      display_name: row.displayName,
      previous_total: prevTotal,
      current_total: row.totalPoints,
      computed_delta:
        prevTotal != null ? row.totalPoints - prevTotal : null,
      displayed_delta: readNumber(stored?.points_gained),
      previous_rank_stored: readNumber(stored?.previous_rank),
      previous_rank_recomputed: previousRanksCompetition.get(row.participantId) ?? null,
      current_rank_view: Number(view?.rank ?? row.rank),
      current_rank_ledger: row.rank,
      current_rank_ordinal: ordinal?.rank ?? row.rank,
      computed_rank_delta: recomputedRow?.rankChange ?? null,
      displayed_rank_delta: readNumber(stored?.rank_change),
      rank_delta_ordinal_bug: ordinalBugRow?.rankChange ?? null,
      has_latest_event_ledger: hasLatestLedger,
      latest_event_points: latestEventPoints,
    });
  }

  const deltaValues = new Set(
    auditRows.map((r) => r.computed_delta).filter((d) => d != null),
  );
  const displayedDeltaValues = new Set(
    auditRows.map((r) => r.displayed_delta).filter((d) => d != null),
  );
  const rankMovementCount = auditRows.filter(
    (r) => (r.displayed_rank_delta ?? 0) !== 0,
  ).length;
  const ordinalBugMovementCount = auditRows.filter(
    (r) => (r.rank_delta_ordinal_bug ?? 0) !== 0,
  ).length;
  const correctMovementCount = auditRows.filter(
    (r) => (r.computed_rank_delta ?? 0) !== 0,
  ).length;

  console.log("\n--- Summary ---");
  console.log(`Unique computed_delta values: ${[...deltaValues].join(", ")}`);
  console.log(`Unique displayed_delta values: ${[...displayedDeltaValues].join(", ")}`);
  console.log(`Participants with displayed rank movement: ${rankMovementCount}`);
  console.log(`Participants with correct rank movement (competition ranks): ${correctMovementCount}`);
  console.log(`Participants with ordinal-current rank bug movement: ${ordinalBugMovementCount}`);

  const deltaMismatch = auditRows.filter(
    (r) =>
      r.computed_delta != null &&
      r.displayed_delta != null &&
      r.computed_delta !== r.displayed_delta,
  );
  const rankMismatch = auditRows.filter(
    (r) =>
      r.computed_rank_delta != null &&
      r.displayed_rank_delta != null &&
      r.computed_rank_delta !== r.displayed_rank_delta,
  );

  console.log(`Points delta mismatches (computed vs displayed): ${deltaMismatch.length}`);
  console.log(`Rank delta mismatches (recomputed vs displayed): ${rankMismatch.length}`);

  console.log("\n--- Full table (TSV) ---");
  const headers = [
    "display_name",
    "previous_total",
    "current_total",
    "computed_delta",
    "displayed_delta",
    "previous_rank",
    "current_rank_view",
    "current_rank_ordinal",
    "computed_rank_delta",
    "displayed_rank_delta",
    "ordinal_bug_rank_delta",
    "latest_event_pts",
    "has_latest_ledger",
  ];
  console.log(headers.join("\t"));
  for (const r of auditRows.sort((a, b) => a.current_rank_view - b.current_rank_view)) {
    console.log(
      [
        r.display_name,
        r.previous_total,
        r.current_total,
        r.computed_delta,
        r.displayed_delta,
        r.previous_rank_recomputed,
        r.current_rank_view,
        r.current_rank_ordinal,
        r.computed_rank_delta,
        r.displayed_rank_delta,
        r.rank_delta_ordinal_bug,
        r.latest_event_points,
        r.has_latest_event_ledger,
      ].join("\t"),
    );
  }

  const moversDown = auditRows.filter((r) => (r.displayed_rank_delta ?? 0) < 0);
  if (moversDown.length > 0) {
    console.log("\n--- Sample participants with ↓ movement ---");
    for (const r of moversDown.slice(0, 5)) {
      console.log(
        `  ${r.display_name}: pts ${r.previous_total}→${r.current_total} (Δ${r.computed_delta}, displayed +${r.displayed_delta}); rank ${r.previous_rank_recomputed}→${r.current_rank_view} (view) / ${r.current_rank_ordinal} (ordinal); displayed Δrank=${r.displayed_rank_delta}, correct Δrank=${r.computed_rank_delta}, ordinal-bug Δrank=${r.rank_delta_ordinal_bug}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
