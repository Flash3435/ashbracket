#!/usr/bin/env tsx
/**
 * Dry-run / apply repair for tied tournament bonus leaders.
 *
 * Default is READ-ONLY dry-run. Pass --apply to mutate (requires explicit flag).
 *
 * Usage:
 *   npx tsx scripts/repair-tied-bonus-leaders.ts
 *   npx tsx scripts/repair-tied-bonus-leaders.ts --apply
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./loadEnvLocal";
import {
  deriveTeamStatTotals,
  firstPlaceTeamStatLeaders,
} from "../lib/tournament/matchTeamStats/deriveTeamStatTotals";
import {
  buildBonusResultsFromTeamStatsPreview,
  existingBonusResultsMap,
  STAT_DERIVED_BONUS_KEYS,
  upsertRowsFromBonusPreview,
} from "../lib/tournament/matchTeamStats/bonusResultsFromTeamStats";
import { buildTournamentStatLeadersView } from "../lib/tournament/matchTeamStats/buildTournamentStatLeadersView";
import type {
  MatchForTeamStatAggregation,
  MatchTeamStatRecord,
} from "../lib/tournament/matchTeamStats/types";
import { computePoolScores } from "../src/lib/scoring/computePoolScores";
import {
  mapPredictionRow,
  mapResultRow,
  mapScoringRuleRow,
} from "../src/lib/scoring/mapSupabaseRows";

loadEnvLocal();

const APPLY = process.argv.includes("--apply");
const FAMPOOL_ID = "35914476-e0e3-4df7-9389-b2bab8548ac4";
const JOEL_ID = "ce8feec8-b3f9-4c48-b31d-ecc113f32f32";

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

  console.log(APPLY ? "=== APPLY MODE ===" : "=== DRY-RUN (read-only) ===");

  const { data: edition, error: edErr } = await sb
    .from("tournament_editions")
    .select("id, code, name")
    .eq("code", "fifa_wc_2026")
    .maybeSingle();
  if (edErr) throw edErr;
  if (!edition) throw new Error("Edition not found");
  const editionId = edition.id as string;

  const { data: groupStage, error: gsErr } = await sb
    .from("tournament_stages")
    .select("id")
    .eq("code", "group")
    .maybeSingle();
  if (gsErr) throw gsErr;
  const groupStageId = groupStage?.id as string;
  if (!groupStageId) throw new Error("Missing group stage");

  const [matchesRaw, statsRaw, teamsRaw, resultsRaw, poolsRaw] =
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
      fetchAll(
        sb,
        "results",
        "id, tournament_stage_id, kind, team_id, group_code, slot_key, value_text, resolved_at, created_at, edition_id, source, locked",
        [{ column: "edition_id", value: editionId }],
      ),
      fetchAll(sb, "pools", "id, name, tournament_edition_id", [
        { column: "tournament_edition_id", value: editionId },
      ]),
    ]);

  const teamInfoById = new Map(
    teamsRaw.map((t) => [
      String(t.id),
      {
        name: String(t.name ?? "").trim() || "Unknown",
        countryCode: String(t.country_code ?? ""),
      },
    ]),
  );
  const nameById = new Map(
    [...teamInfoById.entries()].map(([id, info]) => [id, info.name]),
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
  console.log("\n=== Leaders ===");
  for (const key of STAT_DERIVED_BONUS_KEYS) {
    const map =
      key === "most_goals"
        ? totals.goalsByTeamId
        : key === "most_yellow_cards"
          ? totals.yellowCardsByTeamId
          : totals.redCardsByTeamId;
    const leaders = firstPlaceTeamStatLeaders(map);
    console.log(
      `  ${key}: ${leaders[0]?.total ?? "—"} — ${leaders.map((l) => nameById.get(l.teamId)).join(", ") || "(none)"}`,
    );
  }

  const leadersView = buildTournamentStatLeadersView({
    matches,
    teamStats,
    teamInfoById,
  });
  const existingByBonusKey = existingBonusResultsMap(
    resultsRaw
      .filter((r) => r.kind === "bonus_pick")
      .map((r) => ({
        team_id: String(r.team_id ?? ""),
        slot_key: (r.slot_key as string | null) ?? null,
        source: (r.source as string | null) ?? null,
        locked: (r.locked as boolean | null) ?? null,
      })),
    teamInfoById,
  );

  const poolIds = poolsRaw.map((p) => String(p.id));
  const rulesRaw = await fetchAll(
    sb,
    "scoring_rules",
    "id, pool_id, prediction_kind, bonus_key, points, created_at, updated_at",
    [],
    [{ column: "pool_id", values: poolIds }],
  );
  const enabledBonusKeys = new Set(
    rulesRaw
      .filter((r) => r.prediction_kind === "bonus_pick" && r.bonus_key)
      .map((r) => String(r.bonus_key)),
  );

  const preview = buildBonusResultsFromTeamStatsPreview({
    leadersView,
    existingByBonusKey,
    enabledBonusKeys,
    teamInfoById,
  });

  console.log("\n=== Preview (what publish would do) ===");
  for (const row of preview.rows) {
    console.log(
      `  ${row.bonusKey}: status=${row.status} proposed=[${row.proposedTeams.map((t) => t.teamName).join(", ")}] existing=[${row.existingResultTeams.map((t) => t.teamName).join(", ")}]`,
    );
    if (row.warning) console.log(`    warning: ${row.warning}`);
  }

  const upserts = upsertRowsFromBonusPreview(
    preview,
    editionId,
    groupStageId,
    new Date().toISOString(),
  );
  console.log(`\nUpsert rows: ${upserts.length}`);
  for (const u of upserts) {
    console.log(`  ${u.bonusKey} → ${nameById.get(u.teamId) ?? u.teamId}`);
  }

  // Simulate post-publish results for scoring delta
  const currentResults = resultsRaw.map((row) =>
    mapResultRow(row as Parameters<typeof mapResultRow>[0]),
  );
  const simulatedResults = currentResults.filter((r) => {
    if (r.kind !== "bonus_pick") return true;
    const key = (r.slotKey ?? "").trim();
    return !preview.rows.some(
      (row) => row.status === "ready" && row.bonusKey === key,
    );
  });
  const resolvedAt = new Date().toISOString();
  for (const u of upserts) {
    simulatedResults.push({
      id: `sim-${u.bonusKey}-${u.teamId}`,
      tournamentStageId: u.tournamentStageId,
      kind: "bonus_pick",
      teamId: u.teamId,
      groupCode: null,
      slotKey: u.bonusKey,
      valueText: null,
      resolvedAt,
      createdAt: resolvedAt,
      source: "manual",
      locked: true,
    });
  }

  const predsRaw = await fetchAll(
    sb,
    "predictions",
    "id, pool_id, participant_id, prediction_kind, team_id, tournament_stage_id, group_code, slot_key, bonus_key, value_text, created_at, updated_at",
    [],
    [{ column: "pool_id", values: poolIds }],
  );
  const partsRaw = await fetchAll(
    sb,
    "participants",
    "id, pool_id, display_name",
    [],
    [{ column: "pool_id", values: poolIds }],
  );
  const ledgerRaw = await fetchAll(
    sb,
    "points_ledger",
    "id, pool_id, participant_id, points_delta, prediction_kind, prediction_id, result_id, note",
    [],
    [{ column: "pool_id", values: poolIds }],
  );

  const currentTotalByPart = new Map<string, number>();
  for (const row of ledgerRaw) {
    const pid = String(row.participant_id);
    currentTotalByPart.set(
      pid,
      (currentTotalByPart.get(pid) ?? 0) + Number(row.points_delta),
    );
  }

  const partName = new Map(
    partsRaw.map((p) => [
      String(p.id),
      String(p.display_name ?? "").trim() || "Unknown",
    ]),
  );
  const poolName = new Map(
    poolsRaw.map((p) => [String(p.id), String(p.name ?? p.id)]),
  );

  type DeltaRow = {
    poolId: string;
    participantId: string;
    name: string;
    before: number;
    after: number;
    delta: number;
    goals: number;
    yellow: number;
    red: number;
  };
  const deltas: DeltaRow[] = [];

  for (const pool of poolsRaw) {
    const poolId = String(pool.id);
    const predictions = predsRaw
      .filter((p) => String(p.pool_id) === poolId)
      .map((row) => mapPredictionRow(row as Parameters<typeof mapPredictionRow>[0]));
    const scoringRules = rulesRaw
      .filter((r) => String(r.pool_id) === poolId)
      .map((row) => mapScoringRuleRow(row as Parameters<typeof mapScoringRuleRow>[0]));

    const before = computePoolScores({
      poolId,
      predictions,
      results: currentResults,
      scoringRules,
    });
    const after = computePoolScores({
      poolId,
      predictions,
      results: simulatedResults,
      scoringRules,
    });

    const participantIds = new Set([
      ...Object.keys(before.totalsByParticipantId),
      ...Object.keys(after.totalsByParticipantId),
      ...partsRaw.filter((p) => String(p.pool_id) === poolId).map((p) => String(p.id)),
    ]);

    for (const pid of participantIds) {
      const b = before.totalsByParticipantId[pid] ?? 0;
      const a = after.totalsByParticipantId[pid] ?? 0;
      if (b === a) continue;

      const bonusLines = after.ledgerLines.filter(
        (l) =>
          l.participantId === pid &&
          l.predictionKind === "bonus_pick",
      );
      const beforeBonus = before.ledgerLines.filter(
        (l) =>
          l.participantId === pid &&
          l.predictionKind === "bonus_pick",
      );
      function catDelta(key: string): number {
        const afterPts = bonusLines
          .filter((l) => l.note?.includes(`(${key})`))
          .reduce((s, l) => s + l.pointsDelta, 0);
        const beforePts = beforeBonus
          .filter((l) => l.note?.includes(`(${key})`))
          .reduce((s, l) => s + l.pointsDelta, 0);
        return afterPts - beforePts;
      }

      // Prefer live ledger total for "before" when available (matches UI)
      const liveBefore = currentTotalByPart.get(pid) ?? b;
      const liveAfter = liveBefore + (a - b);

      deltas.push({
        poolId,
        participantId: pid,
        name: partName.get(pid) ?? pid,
        before: liveBefore,
        after: liveAfter,
        delta: liveAfter - liveBefore,
        goals: catDelta("most_goals"),
        yellow: catDelta("most_yellow_cards"),
        red: catDelta("most_red_cards"),
      });
    }
  }

  deltas.sort(
    (a, b) =>
      a.poolId.localeCompare(b.poolId) ||
      b.delta - a.delta ||
      a.name.localeCompare(b.name),
  );

  console.log("\n=== Participant point deltas ===");
  console.log("| Participant | Pool | Before | Goals | Yellow | Red | After | Δ |");
  console.log("|---|---|---:|---:|---:|---:|---:|---:|");
  for (const d of deltas) {
    console.log(
      `| ${d.name} | ${poolName.get(d.poolId)} | ${d.before} | ${d.goals} | ${d.yellow} | ${d.red} | ${d.after} | ${d.delta} |`,
    );
  }

  const joel = deltas.find((d) => d.participantId === JOEL_ID);
  console.log("\n=== Joel verification ===");
  if (!joel) {
    console.log("  Joel not in delta set (unexpected if bonuses missing)");
  } else {
    console.log(
      `  ${joel.before} → ${joel.after} (goals ${joel.goals}, yellow ${joel.yellow}, red ${joel.red}, Δ ${joel.delta})`,
    );
    console.log(
      `  Expected: 226 → 261 (goals +25, red +10, total +35): ${
        joel.before === 226 &&
        joel.after === 261 &&
        joel.goals === 25 &&
        joel.red === 10 &&
        joel.delta === 35
          ? "MATCH"
          : "CHECK"
      }`,
    );
  }

  // First place impact for Fampool
  const fampoolParts = partsRaw.filter((p) => String(p.pool_id) === FAMPOOL_ID);
  const fampoolBefore = fampoolParts
    .map((p) => ({
      id: String(p.id),
      name: partName.get(String(p.id)) ?? "",
      pts: currentTotalByPart.get(String(p.id)) ?? 0,
    }))
    .sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));
  const fampoolAfterMap = new Map(
    fampoolBefore.map((r) => {
      const d = deltas.find((x) => x.participantId === r.id);
      return [r.id, d ? d.after : r.pts] as const;
    }),
  );
  const fampoolAfter = fampoolBefore
    .map((r) => ({ ...r, pts: fampoolAfterMap.get(r.id) ?? r.pts }))
    .sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));

  console.log("\n=== Fampool first place ===");
  console.log(
    `  Before: ${fampoolBefore[0]?.name} (${fampoolBefore[0]?.pts})` +
      (fampoolBefore[1] && fampoolBefore[1].pts === fampoolBefore[0]?.pts
        ? ` tied with ${fampoolBefore.filter((r) => r.pts === fampoolBefore[0]?.pts).map((r) => r.name).join(", ")}`
        : ""),
  );
  const topAfter = fampoolAfter[0]?.pts;
  const tiedAfter = fampoolAfter.filter((r) => r.pts === topAfter);
  console.log(
    `  After: ${tiedAfter.map((r) => `${r.name} (${r.pts})`).join(" / ")}` +
      (tiedAfter.length > 1 ? " — TIE for first" : ""),
  );

  console.log("\n=== Other pools affected ===");
  const byPool = new Map<string, number>();
  for (const d of deltas) {
    byPool.set(d.poolId, (byPool.get(d.poolId) ?? 0) + 1);
  }
  for (const [pid, n] of byPool) {
    console.log(`  ${poolName.get(pid)}: ${n} participant(s)`);
  }

  if (!APPLY) {
    console.log(
      "\nDry-run complete. No production mutation. Re-run with --apply after deploying the code+migration fix.",
    );
    return;
  }

  console.log("\n=== Applying repair ===");
  const readyKeys = preview.rows
    .filter((r) => r.status === "ready")
    .map((r) => r.bonusKey);
  if (readyKeys.length === 0) {
    console.log("Nothing ready to publish.");
    return;
  }

  for (const bonusKey of readyKeys) {
    const { error: delErr } = await sb
      .from("results")
      .delete()
      .eq("edition_id", editionId)
      .eq("tournament_stage_id", groupStageId)
      .eq("kind", "bonus_pick")
      .eq("slot_key", bonusKey);
    if (delErr) throw delErr;
  }

  const inserts = upserts.map((row) => ({
    edition_id: row.editionId,
    tournament_stage_id: row.tournamentStageId,
    kind: "bonus_pick" as const,
    team_id: row.teamId,
    group_code: null,
    slot_key: row.bonusKey,
    resolved_at: row.resolvedAt,
    source: "manual" as const,
    locked: true,
  }));
  const { error: insErr } = await sb.from("results").insert(inserts);
  if (insErr) throw insErr;
  console.log(`Inserted ${inserts.length} bonus result row(s).`);

  // Recompute each pool via replace_points_ledger — use app helper if available
  const { recomputePoolsForEdition } = await import(
    "../lib/tournament/recomputePoolsForEdition"
  );
  const recompute = await recomputePoolsForEdition(
    sb,
    editionId,
    "admin_result_edit",
    { editionIsSimulation: false },
  );
  if (!recompute.ok) {
    throw new Error(`Recompute failed: ${recompute.error}`);
  }
  console.log("Recompute complete.");

  // Post-check Joel
  const joelLedger = await fetchAll(sb, "points_ledger", "points_delta", [
    { column: "participant_id", value: JOEL_ID },
  ]);
  const joelTotal = joelLedger.reduce((s, r) => s + Number(r.points_delta), 0);
  console.log(`Joel post-recompute total: ${joelTotal}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
