#!/usr/bin/env tsx
/**
 * READ-ONLY audit: tied tournament bonus leaders and missing awards.
 * Does NOT write to the database.
 *
 * Usage:
 *   npx tsx scripts/audit-tied-bonus-leaders.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./loadEnvLocal";
import {
  deriveTeamStatTotals,
  firstPlaceTeamStatLeaders,
} from "../lib/tournament/matchTeamStats/deriveTeamStatTotals";
import type {
  MatchForTeamStatAggregation,
  MatchTeamStatRecord,
} from "../lib/tournament/matchTeamStats/types";

loadEnvLocal();

const FAMPOOL_ID = "35914476-e0e3-4df7-9389-b2bab8548ac4";
const BONUS_KEYS = [
  "most_goals",
  "most_yellow_cards",
  "most_red_cards",
] as const;

async function fetchAll(
  sb: SupabaseClient,
  table: string,
  select: string,
  filters: { column: string; value: string }[] = [],
  inFilters: { column: string; values: string[] }[] = [],
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = sb.from(table).select(select).order("id").range(from, from + page - 1);
    for (const f of filters) q = q.eq(f.column, f.value);
    for (const f of inFilters) q = q.in(f.column, f.values);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      const id = String(row.id ?? `${from}:${out.length}`);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(row);
    }
    if (!data || data.length < page) break;
  }
  return out;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: pool, error: poolErr } = await sb
    .from("pools")
    .select("id, name, tournament_edition_id")
    .eq("id", FAMPOOL_ID)
    .maybeSingle();
  if (poolErr) throw poolErr;
  if (!pool) throw new Error("Fampool not found");

  const editionId = pool.tournament_edition_id as string;
  console.log("=== Identity ===");
  console.log(`Pool: ${pool.name} (${pool.id})`);
  console.log(`Edition: ${editionId}`);

  const [matchesRaw, statsRaw, teamsRaw, rulesRaw, resultsRaw, poolsRaw] =
    await Promise.all([
      fetchAll(sb, "tournament_matches", "id, home_team_id, away_team_id, home_goals, away_goals", [
        { column: "edition_id", value: editionId },
      ]),
      fetchAll(
        sb,
        "tournament_match_team_stats",
        "id, edition_id, match_id, team_id, yellow_cards, red_cards, source",
        [{ column: "edition_id", value: editionId }],
      ),
      fetchAll(sb, "teams", "id, name, country_code"),
      fetchAll(sb, "scoring_rules", "pool_id, bonus_key, points", [
        { column: "prediction_kind", value: "bonus_pick" },
      ]),
      fetchAll(sb, "results", "id, slot_key, team_id, locked, source, resolved_at, edition_id", [
        { column: "edition_id", value: editionId },
        { column: "kind", value: "bonus_pick" },
      ]),
      fetchAll(sb, "pools", "id, name, tournament_edition_id", [
        { column: "tournament_edition_id", value: editionId },
      ]),
    ]);

  const nameById = new Map(
    teamsRaw.map((t) => [String(t.id), String(t.name ?? "").trim() || "Unknown"]),
  );

  const matches: MatchForTeamStatAggregation[] = matchesRaw.map((m) => ({
    id: String(m.id),
    homeTeamId: (m.home_team_id as string | null) ?? null,
    awayTeamId: (m.away_team_id as string | null) ?? null,
    homeGoals: (m.home_goals as number | null) ?? null,
    awayGoals: (m.away_goals as number | null) ?? null,
  }));

  const teamStats: MatchTeamStatRecord[] = statsRaw.map((s) => ({
    id: String(s.id),
    editionId: String(s.edition_id),
    matchId: String(s.match_id),
    teamId: String(s.team_id),
    yellowCards: (s.yellow_cards as number | null) ?? null,
    redCards: (s.red_cards as number | null) ?? null,
    source: s.source === "manual" ? "manual" : "provider",
  }));

  const totals = deriveTeamStatTotals({ matches, teamStats });
  const leaders = {
    most_goals: firstPlaceTeamStatLeaders(totals.goalsByTeamId),
    most_yellow_cards: firstPlaceTeamStatLeaders(totals.yellowCardsByTeamId),
    most_red_cards: firstPlaceTeamStatLeaders(totals.redCardsByTeamId),
  };

  console.log("\n=== Final team-stat leaders ===");
  for (const key of BONUS_KEYS) {
    const rows = leaders[key];
    const total = rows[0]?.total ?? null;
    const names = rows.map((r) => nameById.get(r.teamId) ?? r.teamId).join(", ");
    console.log(
      `${key}: total=${total} leaders=${rows.length} [${names}] ids=[${rows.map((r) => r.teamId).join(", ")}]`,
    );
  }

  const fampoolRules = new Map<string, number>();
  for (const r of rulesRaw) {
    if (r.pool_id !== FAMPOOL_ID) continue;
    if (r.bonus_key) fampoolRules.set(String(r.bonus_key), Number(r.points));
  }
  console.log("\n=== Fampool bonus values ===");
  for (const key of BONUS_KEYS) {
    console.log(`  ${key}: ${fampoolRules.get(key) ?? "MISSING"}`);
  }

  console.log("\n=== Published bonus results ===");
  if (resultsRaw.length === 0) console.log("  (none)");
  for (const r of resultsRaw) {
    console.log(
      `  ${r.slot_key}: ${nameById.get(String(r.team_id)) ?? r.team_id} (${r.team_id}) locked=${r.locked} source=${r.source}`,
    );
  }

  const poolIds = poolsRaw.map((p) => String(p.id));
  const preds = await fetchAll(
    sb,
    "predictions",
    "id, pool_id, participant_id, bonus_key, team_id",
    [],
    [
      { column: "pool_id", values: poolIds },
      { column: "prediction_kind", values: ["bonus_pick"] },
    ],
  );

  const parts = await fetchAll(
    sb,
    "participants",
    "id, pool_id, display_name",
    [],
    [{ column: "pool_id", values: poolIds }],
  );
  const partById = new Map(
    parts.map((p) => [
      String(p.id),
      {
        name: String(p.display_name ?? "").trim() || "Unknown",
        poolId: String(p.pool_id),
      },
    ]),
  );
  const poolNameById = new Map(
    poolsRaw.map((p) => [String(p.id), String(p.name ?? p.id)]),
  );

  const ledger = await fetchAll(
    sb,
    "points_ledger",
    "id, pool_id, participant_id, points_delta, prediction_id, result_id, note",
    [],
    [
      { column: "pool_id", values: poolIds },
      { column: "prediction_kind", values: ["bonus_pick"] },
    ],
  );

  // Map prediction_id -> bonus ledger rows
  const ledgerByPredId = new Map<string, typeof ledger>();
  for (const row of ledger) {
    const pid = row.prediction_id ? String(row.prediction_id) : "";
    if (!pid) continue;
    const list = ledgerByPredId.get(pid) ?? [];
    list.push(row);
    ledgerByPredId.set(pid, list);
  }

  console.log("\n=== Affected participants (tied-leader picks) ===");
  console.log(
    "| Participant | Pool | Category | Pick | Tied leaders | Points owed | Already awarded | Missing |",
  );
  console.log("|---|---|---|---|---|---:|---:|---:|");

  type Correction = {
    poolId: string;
    poolName: string;
    participantId: string;
    participantName: string;
    category: string;
    pick: string;
    pointsOwed: number;
    already: number;
    missing: number;
  };
  const corrections: Correction[] = [];

  for (const key of BONUS_KEYS) {
    const leaderIds = new Set(leaders[key].map((l) => l.teamId));
    if (leaderIds.size === 0) continue;
    const leaderNames = leaders[key]
      .map((l) => nameById.get(l.teamId) ?? l.teamId)
      .join(", ");

    for (const pred of preds) {
      if (String(pred.bonus_key) !== key) continue;
      const teamId = String(pred.team_id ?? "");
      if (!leaderIds.has(teamId)) continue;

      const part = partById.get(String(pred.participant_id));
      if (!part) continue;
      const pointsOwed =
        Number(
          rulesRaw.find(
            (r) =>
              String(r.pool_id) === part.poolId && String(r.bonus_key) === key,
          )?.points ?? 0,
        ) || 0;

      const rows = ledgerByPredId.get(String(pred.id)) ?? [];
      const already = rows.reduce((s, r) => s + Number(r.points_delta), 0);
      const missing = Math.max(0, pointsOwed - already);

      console.log(
        `| ${part.name} | ${poolNameById.get(part.poolId) ?? part.poolId} | ${key} | ${nameById.get(teamId) ?? teamId} | ${leaderNames} | ${pointsOwed} | ${already} | ${missing} |`,
      );

      if (missing > 0 || already > pointsOwed) {
        corrections.push({
          poolId: part.poolId,
          poolName: poolNameById.get(part.poolId) ?? part.poolId,
          participantId: String(pred.participant_id),
          participantName: part.name,
          category: key,
          pick: nameById.get(teamId) ?? teamId,
          pointsOwed,
          already,
          missing,
        });
      }
    }
  }

  // Duplicate ledger check
  console.log("\n=== Duplicate bonus ledger check (same prediction_id) ===");
  let dupCount = 0;
  for (const [predId, rows] of ledgerByPredId) {
    if (rows.length > 1) {
      dupCount += 1;
      console.log(`  prediction ${predId}: ${rows.length} rows`);
    }
  }
  if (dupCount === 0) console.log("  none");

  // Joel detail
  const joel = parts.find(
    (p) =>
      String(p.pool_id) === FAMPOOL_ID &&
      String(p.display_name ?? "").toLowerCase().includes("joel lopez"),
  );
  if (joel) {
    const allLedger = await fetchAll(sb, "points_ledger", "points_delta", [
      { column: "participant_id", value: String(joel.id) },
    ]);
    const total = allLedger.reduce((s, r) => s + Number(r.points_delta), 0);
    console.log("\n=== Joel verification ===");
    console.log(`  participant_id: ${joel.id}`);
    console.log(`  current total: ${total}`);
    const joelMissing = corrections
      .filter((c) => c.participantId === String(joel.id))
      .reduce((s, c) => s + c.missing, 0);
    console.log(`  missing bonus points: ${joelMissing}`);
    console.log(`  projected: ${total + joelMissing}`);
  }

  // Other pools summary
  console.log("\n=== Pools with missing awards ===");
  const byPool = new Map<string, Set<string>>();
  for (const c of corrections) {
    if (c.missing <= 0) continue;
    const set = byPool.get(c.poolId) ?? new Set();
    set.add(c.participantId);
    byPool.set(c.poolId, set);
  }
  for (const [poolId, set] of byPool) {
    console.log(
      `  ${poolNameById.get(poolId) ?? poolId}: ${set.size} participant(s)`,
    );
  }

  console.log("\nDone (read-only).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
