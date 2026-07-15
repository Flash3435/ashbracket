#!/usr/bin/env tsx
/**
 * Repair duplicate knockout ledger rows caused by sync delete+null result_id
 * + grandfather merge double-append (M102 incident).
 *
 * Defaults to **dry-run**. Does NOT apply the abandoned full-history −4,872 correction.
 *
 *   npx tsx scripts/repair-duplicate-knockout-ledger.ts
 *   npx tsx scripts/repair-duplicate-knockout-ledger.ts --report-dir /tmp/ko-dup-repair
 *
 * Apply (after deploy of merge fix + freeze sync):
 *
 *   ASHBRACKET_ALLOW_KO_DUP_LEDGER_REPAIR_WRITE=1 \
 *   npx tsx scripts/repair-duplicate-knockout-ledger.ts --apply \
 *     --confirm APPLY_DUPLICATE_KNOCKOUT_LEDGER_REPAIR \
 *     --repair-activity
 *
 * Live, non-archived, non-simulation pools only.
 * Does not mutate predictions, match scores, or tournament results.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvLocal } from "./loadEnvLocal";
import {
  capturePoolStandingsState,
  hashPilotStandingsRows,
  type PilotStandingsRow,
} from "../lib/admin/pilotStandingsSnapshot";
import { postScoreImpactForPools } from "../lib/poolActivity/scoreImpact/postScoreImpactActivity";
import type { ScoreImpactMatchResult } from "../lib/poolActivity/scoreImpact/types";
import { buildPoolLedgerPayloadWithClient } from "../src/lib/scoring/buildPoolLedgerPayload";
import { recomputePoolLedgerWithClient } from "../src/lib/scoring/recomputePoolLedger";
import { participantMaximumPredictedDepthForTeam } from "../src/lib/scoring/knockoutOncePerTeamDepth";
import { mapPredictionRow } from "../src/lib/scoring/mapSupabaseRows";
import type { Prediction } from "../src/types/domain";

loadEnvLocal();

export const KO_DUP_REPAIR_CONFIRM = "APPLY_DUPLICATE_KNOCKOUT_LEDGER_REPAIR";
const M102 = "M102";
const CLEAN_SCORE_SIGNATURE = "m102_duplicate_ko_ledger_repair:argentina_def_england";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const repairActivity = args.includes("--repair-activity");
const confirmIdx = args.indexOf("--confirm");
const confirm = confirmIdx >= 0 ? args[confirmIdx + 1]?.trim() : "";
const reportDirIdx = args.indexOf("--report-dir");
const reportDir =
  reportDirIdx >= 0
    ? args[reportDirIdx + 1]!.trim()
    : `/tmp/ko-dup-ledger-repair-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const poolFilterIdx = args.indexOf("--pool");
const poolFilter = poolFilterIdx >= 0 ? args[poolFilterIdx + 1]?.trim() : "";

async function fetchAll(
  sb: SupabaseClient,
  table: string,
  select: string,
  filters: { column: string; value: string }[],
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = sb.from(table).select(select).order("id").range(from, from + page - 1);
    for (const f of filters) q = q.eq(f.column, f.value);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < page) break;
  }
  return out;
}

function ranksFromTotals(
  rows: { participantId: string; displayName: string; totalPoints: number }[],
): PilotStandingsRow[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.totalPoints - a.totalPoints ||
      a.displayName.localeCompare(b.displayName),
  );
  const out: PilotStandingsRow[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i]!;
    const rank =
      i === 0 || r.totalPoints !== sorted[i - 1]!.totalPoints
        ? i + 1
        : out[i - 1]!.rank;
    out.push({ ...r, rank });
  }
  return out;
}

function countTies(rows: PilotStandingsRow[]): number {
  const byPts = new Map<number, number>();
  for (const r of rows) byPts.set(r.totalPoints, (byPts.get(r.totalPoints) ?? 0) + 1);
  return [...byPts.values()].filter((n) => n > 1).reduce((s, n) => s + n, 0);
}

function predictedDepthAtLeast(
  predictions: Prediction[],
  participantId: string,
  teamId: string,
  minKind: string,
): boolean {
  const mine = predictions.filter((p) => p.participantId === participantId);
  const max = participantMaximumPredictedDepthForTeam(mine, teamId);
  if (!max) return false;
  const order = [
    "round_of_32",
    "round_of_16",
    "quarterfinalist",
    "semifinalist",
    "finalist",
    "champion",
  ];
  return order.indexOf(max) >= order.indexOf(minKind);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  mkdirSync(reportDir, { recursive: true });

  console.log(
    apply
      ? `Mode: APPLY (confirm=${confirm === KO_DUP_REPAIR_CONFIRM})`
      : "Mode: DRY-RUN (default)",
  );
  console.log(
    "Repair uses fixed merge + transitional scorer. Does NOT apply full-history depth-cap correction.\n",
  );

  // Resolve Argentina + Spain team ids from edition teams via country / name.
  const { data: argentinaRows } = await sb
    .from("teams")
    .select("id, name, country_code")
    .or("name.eq.Argentina,country_code.eq.ARG")
    .limit(5);
  const argentinaId =
    (argentinaRows ?? []).find((t) => t.name === "Argentina")?.id ??
    (argentinaRows ?? [])[0]?.id;
  const { data: spainRows } = await sb
    .from("teams")
    .select("id, name")
    .eq("name", "Spain")
    .limit(1);
  const spainId = spainRows?.[0]?.id as string | undefined;
  if (!argentinaId) {
    console.error("Could not resolve Argentina team id");
    process.exit(1);
  }

  let poolsQuery = sb
    .from("pools")
    .select("id, name, tournament_edition_id, is_simulation, archived_at")
    .eq("is_simulation", false)
    .is("archived_at", null)
    .order("name");
  const { data: poolsRaw, error: poolErr } = await poolsQuery;
  if (poolErr) throw new Error(poolErr.message);
  let pools = poolsRaw ?? [];
  if (poolFilter) {
    pools = pools.filter((p) =>
      String(p.name).toLowerCase().includes(poolFilter.toLowerCase()),
    );
  }

  const report: {
    generatedAt: string;
    mode: string;
    fullHistoryCorrectionApplied: false;
    pools: Record<string, unknown>[];
    fampoolFocus: Record<string, unknown> | null;
  } = {
    generatedAt: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    fullHistoryCorrectionApplied: false,
    pools: [],
    fampoolFocus: null,
  };

  for (const pool of pools) {
    const poolId = pool.id as string;
    const poolName = pool.name as string;
    const editionId = pool.tournament_edition_id as string;

    const beforeSnap = await capturePoolStandingsState(sb, poolId);
    const beforeRows = beforeSnap.rows;

    const built = await buildPoolLedgerPayloadWithClient(sb, poolId);
    if (!built.ok) {
      console.error(`FAIL ${poolName}: ${built.error}`);
      process.exit(1);
    }
    if (!built.validation.ok) {
      console.error(`FAIL ${poolName}: clean payload invalid: ${built.validation.error}`);
      process.exit(1);
    }

    const cleanTotals = new Map<string, number>();
    for (const r of beforeRows) cleanTotals.set(r.participantId, 0);
    for (const row of built.payload) {
      cleanTotals.set(
        row.participant_id,
        (cleanTotals.get(row.participant_id) ?? 0) + Number(row.points_delta),
      );
    }
    const cleanRows = ranksFromTotals(
      beforeRows.map((r) => ({
        participantId: r.participantId,
        displayName: r.displayName,
        totalPoints: cleanTotals.get(r.participantId) ?? 0,
      })),
    );
    const cleanById = new Map(cleanRows.map((r) => [r.participantId, r] as const));

    const predRows = await fetchAll(sb, "predictions", "*", [
      { column: "pool_id", value: poolId },
    ]);
    const predictions = predRows.map((r) => mapPredictionRow(r as any));

    // M102 activity for pre-M102 reconstruction
    const { data: acts } = await sb
      .from("pool_activity")
      .select("id, created_at, type, metadata_json, body_text")
      .eq("pool_id", poolId)
      .eq("type", "ash_score_impact")
      .order("created_at", { ascending: false })
      .limit(40);
    const m102Act =
      (acts ?? []).find((a) => {
        const md = (a.metadata_json ?? {}) as Record<string, unknown>;
        const codes = (md.match_codes as string[] | undefined) ?? [];
        return codes.includes(M102);
      }) ?? null;
    const m102Md = (m102Act?.metadata_json ?? null) as Record<string, unknown> | null;
    const preM102FromActivity = new Map<string, number>();
    if (Array.isArray(m102Md?.previous_standings)) {
      for (const row of m102Md!.previous_standings as Array<{
        participant_id: string;
        total_points: number;
      }>) {
        preM102FromActivity.set(row.participant_id, Number(row.total_points));
      }
    }

    let orphanKoRemoved = built.excludedOrphans.length;
    let duplicateKeysRemoved = built.liveDuplicateKeys;
    let m101Retained = 0;
    let m102Retained = 0;
    const unexplained: Array<Record<string, unknown>> = [];
    const participantReports: Array<Record<string, unknown>> = [];

    for (const before of beforeRows) {
      const after = cleanById.get(before.participantId)!;
      const delta = after.totalPoints - before.totalPoints;

      const eligibleM102 =
        argentinaId &&
        predictedDepthAtLeast(
          predictions,
          before.participantId,
          argentinaId,
          "finalist",
        );
      const eligibleM101 =
        spainId &&
        predictedDepthAtLeast(
          predictions,
          before.participantId,
          spainId,
          "finalist",
        );
      if (eligibleM101) m101Retained += 1;
      if (eligibleM102) m102Retained += 1;

      // Prefer activity pre-M102 + legitimate +8 when available.
      const preM102 = preM102FromActivity.get(before.participantId);
      let expectedFromPreM102: number | null = null;
      if (preM102 != null) {
        expectedFromPreM102 = preM102 + (eligibleM102 ? 8 : 0);
      }

      const explainableByDedup = delta <= 0;
      if (
        expectedFromPreM102 != null &&
        Math.abs(after.totalPoints - expectedFromPreM102) > 0.01
      ) {
        // Note as mismatch vs clean pre-M102 reconstruction; may still be OK if
        // intermediate corruptions or missing group restore edge cases.
        unexplained.push({
          displayName: before.displayName,
          corrupted: before.totalPoints,
          clean: after.totalPoints,
          expectedFromPreM102,
          diffVsExpected: after.totalPoints - expectedFromPreM102,
        });
      }

      participantReports.push({
        displayName: before.displayName,
        participantId: before.participantId,
        corruptedTotal: before.totalPoints,
        cleanTotal: after.totalPoints,
        pointsRemoved: before.totalPoints - after.totalPoints,
        rankBefore: before.rank,
        rankAfter: after.rank,
        eligibleM101FinalistIncrement: Boolean(eligibleM101),
        eligibleM102FinalistIncrement: Boolean(eligibleM102),
        preM102FromActivity: preM102 ?? null,
        expectedFromPreM102,
        explainableByDedup,
      });
    }

    const focusNames = [
      "Emil",
      "YellowFever",
      "Dipa",
      "Niki",
      "Naveen",
      "WinnerWinnerChickenDinner",
    ];
    const focus = focusNames
      .map((n) => participantReports.find((p) => p.displayName === n))
      .filter(Boolean);

    const poolReport = {
      poolId,
      poolName,
      editionId,
      knockoutMode: built.knockoutMode,
      corruptedTotalPoints: beforeRows.reduce((s, r) => s + r.totalPoints, 0),
      cleanTotalPoints: cleanRows.reduce((s, r) => s + r.totalPoints, 0),
      pointsRemoved:
        beforeRows.reduce((s, r) => s + r.totalPoints, 0) -
        cleanRows.reduce((s, r) => s + r.totalPoints, 0),
      orphanKoRowsRemoved: orphanKoRemoved,
      liveNullResultKoRows: built.liveNullResultKoRows,
      liveKoRows: built.liveKoRows,
      duplicateParticipantTeamKeysRemoved: duplicateKeysRemoved,
      cleanKoRows: built.validation.knockoutRowCount,
      legitimateM101FinalistEligibleCount: m101Retained,
      legitimateM102FinalistEligibleCount: m102Retained,
      tiesBefore: countTies(beforeRows),
      tiesAfter: countTies(cleanRows),
      top10Before: beforeRows.slice(0, 10).map((r) => ({
        name: r.displayName,
        pts: r.totalPoints,
        rank: r.rank,
      })),
      top10After: cleanRows.slice(0, 10).map((r) => ({
        name: r.displayName,
        pts: r.totalPoints,
        rank: r.rank,
      })),
      focusParticipants: focus,
      unexplainedVsPreM102Reconstruction: unexplained.slice(0, 40),
      m102ActivityId: m102Act?.id ?? null,
      validation: built.validation,
      excludedOrphanSample: built.excludedOrphans.slice(0, 10),
    };
    report.pools.push(poolReport);

    if (/fampool/i.test(poolName)) {
      report.fampoolFocus = {
        poolName,
        note: "Clean expected = transitional scorer payload after fixed merge. Pre-M102 reconstruction uses M102 activity previous_standings + legitimate +8.",
        focus,
        top10After: poolReport.top10After,
        emil: focus.find((p) => p && p.displayName === "Emil") ?? null,
        wwcd:
          focus.find((p) => p && p.displayName === "WinnerWinnerChickenDinner") ??
          null,
      };
    }

    console.log(
      `\n${poolName}: corruptedPts=${poolReport.corruptedTotalPoints} cleanPts=${poolReport.cleanTotalPoints} removed=${poolReport.pointsRemoved} nullKo=${built.liveNullResultKoRows} dupKeys=${duplicateKeysRemoved} orphanExcluded=${orphanKoRemoved}`,
    );

    if (apply) {
      if (confirm !== KO_DUP_REPAIR_CONFIRM) {
        console.error(`Refusing apply: pass --confirm ${KO_DUP_REPAIR_CONFIRM}`);
        process.exit(1);
      }
      if (process.env.ASHBRACKET_ALLOW_KO_DUP_LEDGER_REPAIR_WRITE !== "1") {
        console.error(
          "Refusing production write: set ASHBRACKET_ALLOW_KO_DUP_LEDGER_REPAIR_WRITE=1",
        );
        process.exit(1);
      }

      // Snapshot ledger before write
      const liveLedger = await fetchAll(
        sb,
        "points_ledger",
        "id,participant_id,points_delta,prediction_kind,prediction_id,result_id,note",
        [{ column: "pool_id", value: poolId }],
      );
      writeFileSync(
        join(reportDir, `pre-ledger-${poolId}.json`),
        JSON.stringify({ poolName, beforeRows, liveLedger }, null, 2),
      );

      const ledger = await recomputePoolLedgerWithClient(sb, poolId, {
        ledgerTrigger: "admin_manual_recompute",
        skipRevalidation: true,
      });
      if (ledger.error) {
        console.error(`FAIL replace ${poolName}: ${ledger.error}`);
        process.exit(1);
      }

      const afterSnap = await capturePoolStandingsState(sb, poolId);
      const mismatch = afterSnap.rows.filter((r) => {
        const exp = cleanById.get(r.participantId);
        return !exp || Math.abs(exp.totalPoints - r.totalPoints) > 0.01;
      });
      if (mismatch.length) {
        console.error(
          `FAIL verify ${poolName}: ${mismatch.length} totals != clean plan`,
        );
        process.exit(1);
      }

      if (repairActivity && m102Act) {
        // Archive + delete corrupted M102 activity
        writeFileSync(
          join(reportDir, `archived-m102-${poolId}.json`),
          JSON.stringify(
            {
              ...m102Act,
              archived_at: new Date().toISOString(),
              archive_reason: "m102_duplicate_ko_ledger_repair",
            },
            null,
            2,
          ),
        );
        const { error: delErr } = await sb
          .from("pool_activity")
          .delete()
          .eq("id", m102Act.id);
        if (delErr) throw new Error(delErr.message);

        // Build clean pre-M102 standings from activity previous_standings
        const preRows = ranksFromTotals(
          beforeRows.map((r) => ({
            participantId: r.participantId,
            displayName: r.displayName,
            totalPoints:
              preM102FromActivity.get(r.participantId) ??
              // fallback: subtract corrupted gain if present
              r.totalPoints,
          })),
        );
        // Prefer true clean after rows
        const postRows = afterSnap.rows;

        const matchResults: ScoreImpactMatchResult[] = [
          {
            matchCode: M102,
            label: "England 1–2 Argentina",
            groupCode: null,
            winnerTeamId: argentinaId,
            homeTeamId: null,
            awayTeamId: argentinaId,
            stageCode: "knockout",
          },
        ];

        await postScoreImpactForPools({
          poolIds: [poolId],
          trigger: "tournament_sync",
          beforeByPool: new Map([
            [
              poolId,
              {
                rows: preRows,
                summaryHash: hashPilotStandingsRows(preRows),
              },
            ],
          ]),
          afterByPool: new Map([
            [
              poolId,
              {
                rows: postRows,
                summaryHash: hashPilotStandingsRows(postRows),
              },
            ],
          ]),
          runContext: {
            editionId,
            matchResults,
            scoreSignature: CLEAN_SCORE_SIGNATURE,
          },
          editionIsSimulation: false,
        });
        console.log(`  posted clean M102 activity for ${poolName}`);
      }

      console.log(`  repaired ${poolName}`);
    }
  }

  writeFileSync(join(reportDir, "repair-report.json"), JSON.stringify(report, null, 2));
  console.log(`\nWrote ${join(reportDir, "repair-report.json")}`);
  console.log("fullHistoryCorrectionApplied: false");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
