#!/usr/bin/env tsx
/**
 * M101 knockout depth-transition runner (approved cutover).
 *
 * Surgically adjusts awards only for teams that progressed past the M100 cutoff
 * (Spain → finalist via M101). All other live ledger rows are preserved,
 * including orphan KO rows without surviving predictions.
 *
 * Defaults to **dry-run**. Application requires:
 *
 *   npx tsx scripts/apply-m101-knockout-depth-transition.ts --apply \
 *     --confirm APPLY_M101_KNOCKOUT_DEPTH_TRANSITION
 *
 * Does NOT modify predictions or tournament results.
 * Does NOT invoke the full-history −4,872 correction.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvLocal } from "./loadEnvLocal";
import { capturePoolStandingsState } from "../lib/admin/pilotStandingsSnapshot";
import { isKnockoutPredictionScoringEligible } from "../lib/predictions/knockoutPickStatus";
import { isKnockoutProgressionKind } from "../lib/predictions/knockoutProgressionKinds";
import { M101_KNOCKOUT_DEPTH_TRANSITION_NOTICE } from "../lib/leaderboard/scoringCorrectionDisplay";
import { postScoreImpactForPools } from "../lib/poolActivity/scoreImpact/postScoreImpactActivity";
import {
  betterKnockoutKind,
  knockoutProgressionRank,
  participantMaximumPredictedDepthForTeam,
} from "../src/lib/scoring/knockoutOncePerTeamDepth";
import {
  FIFA_WC_2026_M101_KNOCKOUT_TRANSITION,
  buildCutoffOfficialTeamFurthestKnockoutKind,
  computeKnockoutTeamAward,
  knockoutScoringConfigFromTransition,
} from "../src/lib/scoring/knockoutScoringTransition";
import {
  mapPredictionRow,
  mapResultRow,
  mapScoringRuleRow,
} from "../src/lib/scoring/mapSupabaseRows";
import type { PredictionKind } from "../src/types/domain";

loadEnvLocal();

const CONFIRM_TOKEN = "APPLY_M101_KNOCKOUT_DEPTH_TRANSITION";
const TRANSITIONAL = knockoutScoringConfigFromTransition(
  FIFA_WC_2026_M101_KNOCKOUT_TRANSITION,
);

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const confirmIdx = args.indexOf("--confirm");
const confirm = confirmIdx >= 0 ? args[confirmIdx + 1]?.trim() : "";
const reportDirIdx = args.indexOf("--report-dir");
const reportDir =
  reportDirIdx >= 0
    ? args[reportDirIdx + 1]?.trim()
    : `/tmp/m101-knockout-depth-transition-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const poolIdx = args.indexOf("--pool");
const poolFilter = poolIdx >= 0 ? args[poolIdx + 1]?.trim() : "";

async function fetchAll(
  sb: SupabaseClient,
  table: string,
  select: string,
  filters: { column: string; value: string }[],
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = sb.from(table).select(select).range(from, from + page - 1);
    for (const f of filters) q = q.eq(f.column, f.value);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < page) break;
  }
  return out;
}

function buildOfficialFurthest(
  results: { kind: string; teamId: string | null }[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of results) {
    if (!r.teamId || knockoutProgressionRank(r.kind) < 0) continue;
    m.set(r.teamId, betterKnockoutKind(m.get(r.teamId) ?? null, r.kind));
  }
  return m;
}

function pickRepresentativePredictionId(
  preds: ReturnType<typeof mapPredictionRow>[],
  teamId: string,
): string | null {
  let best: ReturnType<typeof mapPredictionRow> | null = null;
  for (const p of preds) {
    if (p.teamId !== teamId) continue;
    if (!isKnockoutProgressionKind(p.predictionKind)) continue;
    if (!isKnockoutPredictionScoringEligible(p)) continue;
    if (!best || p.id.localeCompare(best.id) < 0) best = p;
  }
  return best?.id ?? null;
}

async function buildSurgicalLedger(
  sb: SupabaseClient,
  pool: { id: string; tournament_edition_id: string },
): Promise<{
  rows: Array<{
    participant_id: string;
    points_delta: number;
    prediction_kind: string;
    prediction_id: string;
    result_id: string;
    note: string | null;
  }>;
  deltaByParticipant: Record<string, number>;
  postCutoffTeams: string[];
  ordinaryCorrections: number;
  orphanCorrections: number;
  ordinaryPointsDelta: number;
  orphanPointsDelta: number;
}> {
  const poolId = pool.id;
  const editionId = pool.tournament_edition_id;
  const [predRows, ledgerRows, resultRows, ruleRows] = await Promise.all([
    fetchAll(sb, "predictions", "*", [{ column: "pool_id", value: poolId }]),
    fetchAll(
      sb,
      "points_ledger",
      "participant_id, points_delta, prediction_kind, prediction_id, result_id, note",
      [{ column: "pool_id", value: poolId }],
    ),
    fetchAll(sb, "results", "*", [{ column: "edition_id", value: editionId }]),
    fetchAll(sb, "scoring_rules", "*", [{ column: "pool_id", value: poolId }]),
  ]);

  const predictions = predRows.map((r) =>
    mapPredictionRow(r as Parameters<typeof mapPredictionRow>[0]),
  );
  const results = resultRows.map((r) =>
    mapResultRow(r as Parameters<typeof mapResultRow>[0]),
  );
  const scoringRules = ruleRows.map((r) =>
    mapScoringRuleRow(r as Parameters<typeof mapScoringRuleRow>[0]),
  );
  const rulesMap = new Map<string, number>(
    scoringRules
      .filter((r) => r.poolId === poolId)
      .map((r) => [r.predictionKind, r.points]),
  );
  const resultById = new Map(results.map((r) => [r.id, r]));
  const officialFurthest = buildOfficialFurthest(results);
  const cutoffFurthest = buildCutoffOfficialTeamFurthestKnockoutKind(
    results,
    FIFA_WC_2026_M101_KNOCKOUT_TRANSITION.cutoffMaxOfficialKind,
  );

  const postCutoffTeams: string[] = [];
  for (const [teamId, current] of officialFurthest) {
    const cutoff = cutoffFurthest.get(teamId) ?? null;
    if (
      knockoutProgressionRank(current) > knockoutProgressionRank(cutoff ?? "")
    ) {
      postCutoffTeams.push(teamId);
    }
  }

  const predsByPart = new Map<string, typeof predictions>();
  for (const p of predictions) {
    const list = predsByPart.get(p.participantId) ?? [];
    list.push(p);
    predsByPart.set(p.participantId, list);
  }

  // Keep every live row that is NOT a post-cutoff team KO award.
  const kept: Array<{
    participant_id: string;
    points_delta: number;
    prediction_kind: string;
    prediction_id: string;
    result_id: string;
    note: string | null;
  }> = [];
  const livePostCutoffPts = new Map<string, number>();
  const livePostCutoffPredictionId = new Map<string, string>();

  for (const row of ledgerRows) {
    const kind = String(row.prediction_kind);
    const res = resultById.get(row.result_id as string);
    const isPostCutoffKo =
      isKnockoutProgressionKind(kind) &&
      res?.teamId != null &&
      postCutoffTeams.includes(res.teamId);

    if (isPostCutoffKo && res?.teamId) {
      const key = `${row.participant_id}\0${res.teamId}`;
      livePostCutoffPts.set(
        key,
        (livePostCutoffPts.get(key) ?? 0) + Number(row.points_delta),
      );
      const predId = row.prediction_id as string;
      const prev = livePostCutoffPredictionId.get(key);
      if (!prev || predId.localeCompare(prev) < 0) {
        livePostCutoffPredictionId.set(key, predId);
      }
      continue;
    }

    kept.push({
      participant_id: row.participant_id as string,
      points_delta: Number(row.points_delta),
      prediction_kind: kind,
      prediction_id: row.prediction_id as string,
      result_id: row.result_id as string,
      note: (row.note as string | null) ?? null,
    });
  }

  const deltaByParticipant: Record<string, number> = {};
  let ordinaryCorrections = 0;
  let orphanCorrections = 0;
  let ordinaryPointsDelta = 0;
  let orphanPointsDelta = 0;
  const participantsNeedingTeam = new Set<string>();
  for (const key of livePostCutoffPts.keys()) {
    participantsNeedingTeam.add(key.split("\0")[0]!);
  }
  for (const p of predictions) {
    if (p.teamId && postCutoffTeams.includes(p.teamId)) {
      participantsNeedingTeam.add(p.participantId);
    }
  }

  for (const participantId of participantsNeedingTeam) {
    const plist = predsByPart.get(participantId) ?? [];
    for (const teamId of postCutoffTeams) {
      const key = `${participantId}\0${teamId}`;
      const livePts = livePostCutoffPts.get(key) ?? 0;
      const maxPredicted = participantMaximumPredictedDepthForTeam(
        plist.filter(isKnockoutPredictionScoringEligible),
        teamId,
      );
      if (!maxPredicted && livePts === 0) continue;

      let awardPoints: number;
      let awardLedgerKind: string | null;
      let awardNote: string;
      const orphan = !maxPredicted && livePts > 0;

      if (orphan) {
        const cutoffKind = cutoffFurthest.get(teamId) ?? null;
        const cutoffPts =
          cutoffKind != null ? (rulesMap.get(cutoffKind) ?? 0) : 0;
        awardPoints = cutoffPts > 0 ? cutoffPts : 0;
        awardLedgerKind = awardPoints > 0 ? cutoffKind : null;
        awardNote = `Knockout: orphan post-cutoff row grandfathered to cutoff (${awardPoints} pts)`;
      } else {
        const award = computeKnockoutTeamAward({
          currentOfficialKind: officialFurthest.get(teamId) ?? null,
          cutoffOfficialKind: cutoffFurthest.get(teamId) ?? null,
          maxPredictedKind: maxPredicted,
          rulesMap,
          config: TRANSITIONAL,
        });
        awardPoints = award.points;
        awardLedgerKind = award.ledgerKind;
        awardNote = award.note;
      }

      const d = awardPoints - livePts;
      if (d !== 0) {
        deltaByParticipant[participantId] =
          (deltaByParticipant[participantId] ?? 0) + d;
        if (orphan) {
          orphanCorrections += 1;
          orphanPointsDelta += d;
        } else {
          ordinaryCorrections += 1;
          ordinaryPointsDelta += d;
        }
      }

      if (awardPoints <= 0 || !awardLedgerKind) continue;

      const resForKind = results
        .filter((r) => r.teamId === teamId && r.kind === awardLedgerKind)
        .sort((a, b) => a.id.localeCompare(b.id))[0];
      if (!resForKind) continue;

      const predictionId =
        pickRepresentativePredictionId(plist, teamId) ??
        livePostCutoffPredictionId.get(key);
      if (!predictionId) continue;

      kept.push({
        participant_id: participantId,
        points_delta: awardPoints,
        prediction_kind: awardLedgerKind as PredictionKind,
        prediction_id: predictionId,
        result_id: resForKind.id,
        note: awardNote,
      });
    }
  }

  return {
    rows: kept,
    deltaByParticipant,
    postCutoffTeams,
    ordinaryCorrections,
    orphanCorrections,
    ordinaryPointsDelta,
    orphanPointsDelta,
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let q = sb
    .from("pools")
    .select("id, name, tournament_edition_id, is_simulation, archived_at")
    .is("archived_at", null)
    .eq("is_simulation", false)
    .order("name");
  if (poolFilter) q = q.ilike("name", `%${poolFilter}%`);
  const { data: pools, error } = await q;
  if (error) throw new Error(error.message);
  if (!pools?.length) {
    console.error("No live official pools matched.");
    process.exit(1);
  }

  console.log(`\nMode: ${apply ? "APPLY" : "DRY-RUN (default)"}`);
  console.log(
    "M101 cutover — surgical post-cutoff team adjustment only (Spain/M101).",
  );
  console.log(`Pools (${pools.length}):`);
  for (const p of pools) console.log(`  - ${p.name} (${p.id})`);
  console.log(`Notice: ${M101_KNOCKOUT_DEPTH_TRANSITION_NOTICE}`);

  let affectedPools = 0;
  let affectedParticipants = 0;
  let totalOrdinary = 0;
  let totalOrphan = 0;
  let totalOrdinaryPts = 0;
  let totalOrphanPts = 0;
  const preview: Record<string, unknown> = {};
  for (const pool of pools) {
    const surgical = await buildSurgicalLedger(sb, {
      id: pool.id as string,
      tournament_edition_id: pool.tournament_edition_id as string,
    });
    const n = Object.keys(surgical.deltaByParticipant).length;
    if (n) {
      affectedPools += 1;
      affectedParticipants += n;
    }
    totalOrdinary += surgical.ordinaryCorrections;
    totalOrphan += surgical.orphanCorrections;
    totalOrdinaryPts += surgical.ordinaryPointsDelta;
    totalOrphanPts += surgical.orphanPointsDelta;
    const pointsDeltaSum = Object.values(surgical.deltaByParticipant).reduce(
      (s, x) => s + x,
      0,
    );
    const unexpected = Object.values(surgical.deltaByParticipant).filter(
      (d) => d !== -8 && d !== 0 && d !== 8,
    );
    preview[pool.id as string] = {
      poolName: pool.name,
      postCutoffTeams: surgical.postCutoffTeams,
      affectedParticipants: n,
      ordinaryCorrections: surgical.ordinaryCorrections,
      orphanCorrections: surgical.orphanCorrections,
      ordinaryPointsDelta: surgical.ordinaryPointsDelta,
      orphanPointsDelta: surgical.orphanPointsDelta,
      pointsDeltaSum,
      unexpectedDeltas: unexpected,
      deltaByParticipant: surgical.deltaByParticipant,
    };
  }
  console.log(
    `\nPreview: ${affectedPools} pools / ${affectedParticipants} participants with delta`,
  );
  console.log(
    `  ordinary −8: ${totalOrdinary} (= ${totalOrdinaryPts} pts)`,
  );
  console.log(`  orphan −8:   ${totalOrphan} (= ${totalOrphanPts} pts)`);
  console.log(`  total:       ${totalOrdinaryPts + totalOrphanPts} pts`);

  mkdirSync(reportDir, { recursive: true });
  writeFileSync(
    join(reportDir, "dry-run-preview.json"),
    JSON.stringify(
      {
        preview,
        totals: {
          ordinaryCorrections: totalOrdinary,
          orphanCorrections: totalOrphan,
          ordinaryPointsDelta: totalOrdinaryPts,
          orphanPointsDelta: totalOrphanPts,
          pointsRemoved: totalOrdinaryPts + totalOrphanPts,
        },
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log(
      `Dry-run only. Wrote ${join(reportDir, "dry-run-preview.json")}\n` +
        `Audit:\n  npx tsx scripts/audit-m101-knockout-depth-transition.ts\n` +
        `Apply:\n  npx tsx scripts/apply-m101-knockout-depth-transition.ts --apply --confirm ${CONFIRM_TOKEN}\n`,
    );
    process.exit(0);
  }

  if (confirm !== CONFIRM_TOKEN) {
    console.error(
      `Refusing to apply: pass --confirm ${CONFIRM_TOKEN} (got ${JSON.stringify(confirm)}).`,
    );
    process.exit(1);
  }

  const preSnapshots: Record<string, unknown> = {};
  for (const pool of pools) {
    const snap = await capturePoolStandingsState(sb, pool.id as string);
    preSnapshots[pool.id as string] = {
      poolName: pool.name,
      summaryHash: snap.summaryHash,
      rows: snap.rows,
    };
  }
  writeFileSync(
    join(reportDir, "pre-standings.json"),
    JSON.stringify({ capturedAt: new Date().toISOString(), pools: preSnapshots }, null, 2),
  );

  const byEdition = new Map<string, typeof pools>();
  for (const p of pools) {
    const eid = p.tournament_edition_id as string;
    const list = byEdition.get(eid) ?? [];
    list.push(p);
    byEdition.set(eid, list);
  }

  const applyResults: Array<{
    poolId: string;
    poolName: string;
    ok: boolean;
    error?: string;
    affectedParticipants?: number;
  }> = [];

  for (const [, editionPools] of byEdition) {
    for (const pool of editionPools) {
      const poolId = pool.id as string;
      const poolName = pool.name as string;
      console.log(`\nApplying ${poolName}…`);
      try {
        const surgical = await buildSurgicalLedger(sb, {
          id: poolId,
          tournament_edition_id: pool.tournament_edition_id as string,
        });
        const { error: rpcErr } = await sb.rpc("replace_points_ledger_for_pool", {
          p_pool_id: poolId,
          p_rows: surgical.rows,
        });
        if (rpcErr) throw new Error(rpcErr.message);
        applyResults.push({
          poolId,
          poolName,
          ok: true,
          affectedParticipants: Object.keys(surgical.deltaByParticipant).length,
        });
        console.log(
          `  ok — deltas for ${Object.keys(surgical.deltaByParticipant).length} participants`,
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`  FAIL ${poolName}: ${message}`);
        applyResults.push({ poolId, poolName, ok: false, error: message });
        writeFileSync(
          join(reportDir, "apply-result.json"),
          JSON.stringify({ ok: false, applyResults }, null, 2),
        );
        process.exit(1);
      }
    }
  }

  const postSnapshots: Record<string, unknown> = {};
  for (const pool of pools) {
    const snap = await capturePoolStandingsState(sb, pool.id as string);
    for (const row of snap.rows) {
      if (row.totalPoints < 0) {
        console.error(
          `Negative total: ${pool.name} / ${row.participantId} = ${row.totalPoints}`,
        );
        process.exit(1);
      }
    }
    postSnapshots[pool.id as string] = {
      poolName: pool.name,
      summaryHash: snap.summaryHash,
      rows: snap.rows,
    };
  }

  const scoreSignature = `m101_knockout_depth_transition:${new Date().toISOString()}`;
  for (const [editionId, editionPools] of byEdition) {
    const poolIds = editionPools.map((p) => p.id as string);
    const beforeByPool = new Map(
      poolIds.map((id) => {
        const pre = preSnapshots[id] as {
          rows: Awaited<ReturnType<typeof capturePoolStandingsState>>["rows"];
          summaryHash: string;
        };
        return [id, { rows: pre.rows, summaryHash: pre.summaryHash }] as const;
      }),
    );
    const afterByPool = new Map(
      poolIds.map((id) => {
        const post = postSnapshots[id] as {
          rows: Awaited<ReturnType<typeof capturePoolStandingsState>>["rows"];
          summaryHash: string;
        };
        return [id, { rows: post.rows, summaryHash: post.summaryHash }] as const;
      }),
    );
    await postScoreImpactForPools({
      poolIds,
      trigger: "admin_manual_recompute",
      beforeByPool,
      afterByPool,
      runContext: {
        editionId,
        scoreSignature,
        scoringCorrections: [{ kind: "m101_knockout_depth_transition" }],
      },
      editionIsSimulation: false,
    });
  }

  writeFileSync(
    join(reportDir, "post-standings.json"),
    JSON.stringify({ capturedAt: new Date().toISOString(), pools: postSnapshots }, null, 2),
  );
  writeFileSync(
    join(reportDir, "apply-result.json"),
    JSON.stringify(
      {
        ok: true,
        applyResults,
        notice: M101_KNOCKOUT_DEPTH_TRANSITION_NOTICE,
        scoreSignature,
      },
      null,
      2,
    ),
  );
  console.log("Done — M101 surgical transition applied.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
