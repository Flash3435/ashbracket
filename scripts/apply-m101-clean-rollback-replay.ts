#!/usr/bin/env tsx
/**
 * Clean M101 score-impact presentation repair (activity-only).
 *
 * Confirmed: live standings/ledger already match the clean M101 replay.
 * This runner does NOT modify participant totals, ledger rows, predictions,
 * or official results. It only:
 *   1) supersedes `m101_knockout_depth_transition` correction activities
 *   2) upserts one clean M101 (`France 0–2 Spain` / Spain def. France) event
 *
 * Defaults to **dry-run**. Application requires:
 *
 *   ASHBRACKET_ALLOW_M101_CLEAN_REPLAY_WRITE=1 \
 *   npx tsx scripts/apply-m101-clean-rollback-replay.ts --apply \
 *     --confirm APPLY_M101_CLEAN_ROLLBACK_REPLAY
 *
 * Does NOT invoke the full-history depth-cap correction.
 * Simulation / archived pools are excluded.
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
import { isKnockoutPredictionScoringEligible } from "../lib/predictions/knockoutPickStatus";
import { isKnockoutProgressionKind } from "../lib/predictions/knockoutProgressionKinds";
import { postScoreImpactForPools } from "../lib/poolActivity/scoreImpact/postScoreImpactActivity";
import type { ScoreImpactMatchResult } from "../lib/poolActivity/scoreImpact/types";
import {
  M101_CLEAN_REPLAY_CONFIRM,
  M101_MATCH_CODE,
  buildCleanM101ReplayPlan,
  reconstructPreM101Standings,
} from "../lib/scoring/m101CleanReplay";
import { mapPredictionRow } from "../src/lib/scoring/mapSupabaseRows";

loadEnvLocal();

const SPAIN_TEAM_ID = "153d854f-aa4e-4d42-83a9-ddbf2244b436";
const SUPERSEDED_TYPE = "ash_score_impact_superseded";
const CLEAN_SCORE_SIGNATURE = "m101_clean_replay:france_0_2_spain";

const M101_MATCH: ScoreImpactMatchResult = {
  matchCode: M101_MATCH_CODE,
  label: "France 0–2 Spain",
  groupCode: null,
  winnerTeamId: SPAIN_TEAM_ID,
  homeTeamId: null,
  awayTeamId: SPAIN_TEAM_ID,
  stageCode: "knockout",
};

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const confirmIdx = args.indexOf("--confirm");
const confirm = confirmIdx >= 0 ? args[confirmIdx + 1]?.trim() : "";
const reportDirIdx = args.indexOf("--report-dir");
const reportDir =
  reportDirIdx >= 0
    ? args[reportDirIdx + 1]?.trim()
    : `/tmp/m101-clean-rollback-replay-${new Date().toISOString().replace(/[:.]/g, "-")}`;

async function fetchAll(
  sb: SupabaseClient,
  table: string,
  select: string,
  filters: { column: string; value: string }[],
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = sb.from(table).select(select).order("id").range(from, from + page - 1);
    for (const f of filters) q = q.eq(f.column, f.value);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      const id = String(row.id ?? "");
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      out.push(row);
    }
    if (!data || data.length < page) break;
  }
  return out;
}

function rowsFromPlanPre(
  planParticipants: ReturnType<typeof buildCleanM101ReplayPlan>["participants"],
): PilotStandingsRow[] {
  const sorted = [...planParticipants].sort(
    (a, b) =>
      b.preM101Points - a.preM101Points ||
      a.displayName.localeCompare(b.displayName),
  );
  const rows: PilotStandingsRow[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!;
    const rank =
      i === 0 || p.preM101Points !== sorted[i - 1]!.preM101Points
        ? i + 1
        : rows[i - 1]!.rank;
    rows.push({
      participantId: p.participantId,
      displayName: p.displayName,
      totalPoints: p.preM101Points,
      rank,
    });
  }
  return rows;
}

function isCorrectionActivity(metadata: unknown): boolean {
  return JSON.stringify(metadata ?? {}).includes(
    "m101_knockout_depth_transition",
  );
}

function isCleanM101Activity(metadata: unknown): boolean {
  const md = metadata as Record<string, unknown> | null;
  if (!md) return false;
  const codes = (md.match_codes as string[] | undefined) ?? [];
  if (!codes.includes(M101_MATCH_CODE)) return false;
  if (isCorrectionActivity(md)) return false;
  const sig = String(md.score_signature ?? "");
  if (sig.includes("m101_knockout_depth_transition")) return false;
  // Prefer the clean-replay signature; also accept a rewritten original M101
  // whose previous→after already matches the clean plan (idempotent).
  return true;
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  mkdirSync(reportDir, { recursive: true });

  const { data: pools, error: poolErr } = await sb
    .from("pools")
    .select("id, name, tournament_edition_id, is_simulation, archived_at")
    .eq("is_simulation", false)
    .is("archived_at", null)
    .order("name");
  if (poolErr) throw new Error(poolErr.message);

  console.log(
    apply
      ? `Mode: APPLY (confirm=${confirm === M101_CLEAN_REPLAY_CONFIRM})`
      : "Mode: DRY-RUN (default)",
  );
  console.log(
    "Activity-only: supersede correction rows + upsert clean M101 impact. No ledger/standings writes.\n",
  );

  const preview: Record<string, unknown> = {};
  type PoolWork = {
    poolId: string;
    poolName: string;
    editionId: string;
    liveRows: PilotStandingsRow[];
    liveHash: string;
    beforeRows: PilotStandingsRow[];
    beforeHash: string;
    correctionIds: string[];
    m101ActivityId: string | null;
    argentinaActivityId: string | null;
    plus8Names: string[];
    alreadyDone: boolean;
    liveAlreadyClean: boolean;
  };
  const work: PoolWork[] = [];

  for (const pool of pools ?? []) {
    const poolId = pool.id as string;
    const poolName = pool.name as string;
    const editionId = pool.tournament_edition_id as string;
    const snap = await capturePoolStandingsState(sb, poolId);
    const displayNameByParticipantId = new Map(
      snap.rows.map((r) => [r.participantId, r.displayName]),
    );
    const liveTotalsByParticipantId = new Map(
      snap.rows.map((r) => [r.participantId, r.totalPoints]),
    );

    const { data: acts } = await sb
      .from("pool_activity")
      .select("id, created_at, type, metadata_json, body_text")
      .eq("pool_id", poolId)
      .in("type", ["ash_score_impact", SUPERSEDED_TYPE])
      .order("created_at", { ascending: false })
      .limit(80);

    const liveActs = (acts ?? []).filter((a) => a.type === "ash_score_impact");
    const correctionActs = liveActs.filter((a) =>
      isCorrectionActivity(a.metadata_json),
    );
    const m101Act =
      liveActs.find((a) => {
        const md = a.metadata_json as Record<string, unknown> | null;
        const codes = (md?.match_codes as string[] | undefined) ?? [];
        return codes.includes(M101_MATCH_CODE) && !isCorrectionActivity(md);
      }) ?? null;
    const argentinaAct =
      liveActs.find((a) => {
        const md = a.metadata_json as Record<string, unknown> | null;
        const codes = (md?.match_codes as string[] | undefined) ?? [];
        return codes.includes("M100");
      }) ?? null;

    const predRows = await fetchAll(sb, "predictions", "*", [
      { column: "pool_id", value: poolId },
    ]);
    const predictions = predRows.map((r) =>
      mapPredictionRow(r as Parameters<typeof mapPredictionRow>[0]),
    );
    const predictionsByParticipantId = new Map<
      string,
      ReturnType<typeof mapPredictionRow>[]
    >();
    for (const p of predictions) {
      if (
        !isKnockoutProgressionKind(p.predictionKind) ||
        !isKnockoutPredictionScoringEligible(p)
      ) {
        continue;
      }
      const list = predictionsByParticipantId.get(p.participantId) ?? [];
      list.push(p);
      predictionsByParticipantId.set(p.participantId, list);
    }

    const prevStandings = m101Act
      ? ((m101Act.metadata_json as {
          previous_standings?: {
            participant_id: string;
            total_points: number;
          }[];
        })?.previous_standings ?? null)
      : null;

    const reconstructed = reconstructPreM101Standings({
      previousStandingsFromM101Activity: prevStandings,
      displayNameByParticipantId,
      liveTotalsByParticipantId,
      predictionsByParticipantId,
      spainTeamId: SPAIN_TEAM_ID,
    });
    const plan = buildCleanM101ReplayPlan({
      preM101Rows: reconstructed.rows,
      predictionsByParticipantId,
      spainTeamId: SPAIN_TEAM_ID,
    });

    if (plan.anomalous.length > 0) {
      console.error(`FAIL ${poolName}: anomalous negative deltas`);
      process.exit(1);
    }

    const liveAlreadyClean = plan.participants.every((p) => {
      const live = liveTotalsByParticipantId.get(p.participantId);
      return live === p.postReplayPoints;
    });
    if (!liveAlreadyClean) {
      console.error(
        `FAIL ${poolName}: live totals do not match clean post-replay — aborting (no ledger repair in this runner).`,
      );
      process.exit(1);
    }

    const latest = liveActs[0] ?? null;
    const latestIsCleanM101 =
      latest != null &&
      isCleanM101Activity(latest.metadata_json) &&
      ((latest.metadata_json as { score_signature?: string })?.score_signature ===
        CLEAN_SCORE_SIGNATURE ||
        correctionActs.length === 0);
    const alreadyDone =
      correctionActs.length === 0 &&
      latest != null &&
      isCleanM101Activity(latest.metadata_json) &&
      String(
        (latest.metadata_json as { score_signature?: string })?.score_signature ??
          "",
      ) === CLEAN_SCORE_SIGNATURE;

    const beforeRows = rowsFromPlanPre(plan.participants);
    const beforeHash = hashPilotStandingsRows(beforeRows);

    const poolPreview = {
      poolName,
      baselineSource: reconstructed.source,
      m101ActivityId: m101Act?.id ?? null,
      argentinaActivityId: argentinaAct?.id ?? null,
      correctionActivityIds: correctionActs.map((a) => a.id),
      plus8Count: plan.plus8Recipients.length,
      plus8Names: plan.plus8Recipients.map((p) => p.displayName),
      zeroCount: plan.zeroRecipients.length,
      preTop6: plan.preTop.slice(0, 6),
      postTop6: plan.postTop.slice(0, 6),
      liveAlreadyMatchesCleanPost: liveAlreadyClean,
      liveHash: snap.summaryHash,
      ledgerOrStandingsWrites: false,
      activityCleanup: {
        supersedeCorrectionRows: correctionActs.map((a) => a.id),
        upsertFreshM101ScoreImpact: !alreadyDone,
        match_codes: [M101_MATCH_CODE],
        match_label: M101_MATCH.label,
        matchupShortLabel: "Spain def. France",
        previousStandingsSource: reconstructed.source,
        afterStandings: "current live (unchanged)",
        preserveArgentinaM100Activity: argentinaAct?.id ?? null,
      },
      alreadyDone,
      anomalous: plan.anomalous,
    };
    preview[poolId] = poolPreview;

    work.push({
      poolId,
      poolName,
      editionId,
      liveRows: snap.rows,
      liveHash: snap.summaryHash,
      beforeRows,
      beforeHash,
      correctionIds: correctionActs.map((a) => a.id as string),
      m101ActivityId: (m101Act?.id as string) ?? null,
      argentinaActivityId: (argentinaAct?.id as string) ?? null,
      plus8Names: plan.plus8Recipients.map((p) => p.displayName),
      alreadyDone,
      liveAlreadyClean,
    });

    console.log(`--- ${poolName} ---`);
    console.log(
      `  liveClean=true; corrections=${correctionActs.length}; alreadyDone=${alreadyDone}; +8=${plan.plus8Recipients.length}`,
    );
    console.log(
      `  pre: ${plan.preTop
        .slice(0, 6)
        .map((r) => `${r.displayName} ${r.totalPoints}`)
        .join(" | ")}`,
    );
    console.log(
      `  post(=live): ${plan.postTop
        .slice(0, 6)
        .map((r) => `${r.displayName} ${r.postReplayPoints}`)
        .join(" | ")}`,
    );
    console.log(
      `  activity: supersede ${correctionActs.length}; upsertM101=${!alreadyDone}; ledgerWrites=false`,
    );
  }

  const totalsNeedWrite = work.filter((w) => !w.alreadyDone);
  writeFileSync(
    join(reportDir, "dry-run-preview.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: apply ? "apply-requested" : "dry-run",
        ledgerOrStandingsWrites: false,
        poolsNeedingActivityRepair: totalsNeedWrite.length,
        pools: preview,
      },
      null,
      2,
    ),
  );
  console.log(`\nWrote ${join(reportDir, "dry-run-preview.json")}`);
  console.log(
    `Summary: ${work.length} live pools; ${totalsNeedWrite.length} need activity repair; 0 ledger writes planned.`,
  );

  if (!apply) {
    console.log(
      `\nDry-run only. Apply:\n` +
        `  ASHBRACKET_ALLOW_M101_CLEAN_REPLAY_WRITE=1 \\\n` +
        `  npx tsx scripts/apply-m101-clean-rollback-replay.ts --apply \\\n` +
        `    --confirm ${M101_CLEAN_REPLAY_CONFIRM}\n`,
    );
    process.exit(0);
  }

  if (confirm !== M101_CLEAN_REPLAY_CONFIRM) {
    console.error(
      `Refusing apply: pass --confirm ${M101_CLEAN_REPLAY_CONFIRM}`,
    );
    process.exit(1);
  }
  if (process.env.ASHBRACKET_ALLOW_M101_CLEAN_REPLAY_WRITE !== "1") {
    console.error(
      "Refusing production write: set ASHBRACKET_ALLOW_M101_CLEAN_REPLAY_WRITE=1",
    );
    process.exit(1);
  }

  const preActivityReport: Record<string, unknown> = {};
  const applyResults: Array<Record<string, unknown>> = [];

  for (const pool of work) {
    const { data: beforeActs } = await sb
      .from("pool_activity")
      .select("id, created_at, type, body_text, metadata_json")
      .eq("pool_id", pool.poolId)
      .eq("type", "ash_score_impact")
      .order("created_at", { ascending: false })
      .limit(5);
    preActivityReport[pool.poolId] = {
      poolName: pool.poolName,
      standingsHash: pool.liveHash,
      latest: beforeActs?.[0] ?? null,
      correctionIds: pool.correctionIds,
    };

    if (pool.alreadyDone) {
      console.log(`\n${pool.poolName}: already clean — no-op`);
      applyResults.push({
        poolId: pool.poolId,
        poolName: pool.poolName,
        ok: true,
        noOp: true,
      });
      continue;
    }

    console.log(`\nApplying activity cleanup: ${pool.poolName}`);

    // 1) Supersede correction rows (hide from ash_score_impact latest queries).
    for (const id of pool.correctionIds) {
      const { data: row, error: loadErr } = await sb
        .from("pool_activity")
        .select("id, body_text, metadata_json")
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw new Error(loadErr.message);
      if (!row) continue;
      const md = {
        ...((row.metadata_json as Record<string, unknown>) ?? {}),
        superseded_at: new Date().toISOString(),
        superseded_reason: "m101_clean_activity_replay",
        original_type: "ash_score_impact",
      };
      const { error: updErr } = await sb
        .from("pool_activity")
        .update({
          type: SUPERSEDED_TYPE,
          body_text: `[superseded] ${row.body_text ?? ""}`.slice(0, 2000),
          metadata_json: md,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (updErr) throw new Error(updErr.message);
      console.log(`  superseded correction ${id}`);
    }

    // 2) Upsert clean M101 score-impact from pre-M101 → live (totals unchanged).
    const beforeByPool = new Map([
      [
        pool.poolId,
        { rows: pool.beforeRows, summaryHash: pool.beforeHash },
      ],
    ]);
    const afterByPool = new Map([
      [pool.poolId, { rows: pool.liveRows, summaryHash: pool.liveHash }],
    ]);
    const posted = await postScoreImpactForPools({
      poolIds: [pool.poolId],
      trigger: "tournament_sync",
      beforeByPool,
      afterByPool,
      runContext: {
        editionId: pool.editionId,
        matchResults: [M101_MATCH],
        scoreSignature: CLEAN_SCORE_SIGNATURE,
      },
      editionIsSimulation: false,
    });
    console.log(
      `  score-impact inserted=${posted.inserted} updated=${posted.updated} skipped=${posted.skipped}`,
    );
    if (posted.inserted + posted.updated === 0) {
      console.error(`  FAIL ${pool.poolName}: expected clean M101 activity`);
      process.exit(1);
    }

    // 3) Confirm standings hash unchanged.
    const afterSnap = await capturePoolStandingsState(sb, pool.poolId);
    if (afterSnap.summaryHash !== pool.liveHash) {
      console.error(
        `  FAIL ${pool.poolName}: standings hash changed ${pool.liveHash} → ${afterSnap.summaryHash}`,
      );
      process.exit(1);
    }

    const { data: latestAfter } = await sb
      .from("pool_activity")
      .select("id, created_at, type, body_text, metadata_json")
      .eq("pool_id", pool.poolId)
      .eq("type", "ash_score_impact")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    applyResults.push({
      poolId: pool.poolId,
      poolName: pool.poolName,
      ok: true,
      supersededCorrectionIds: pool.correctionIds,
      scoreImpact: posted,
      latestActivityId: latestAfter?.id ?? null,
      latestMatchCodes:
        (latestAfter?.metadata_json as { match_codes?: string[] })?.match_codes ??
        null,
      standingsHashUnchanged: true,
      argentinaActivityId: pool.argentinaActivityId,
      plus8Names: pool.plus8Names,
    });
  }

  writeFileSync(
    join(reportDir, "pre-activity.json"),
    JSON.stringify(preActivityReport, null, 2),
  );
  writeFileSync(
    join(reportDir, "apply-result.json"),
    JSON.stringify(
      {
        ok: true,
        ledgerOrStandingsWrites: false,
        applyResults,
      },
      null,
      2,
    ),
  );
  console.log("\nDone — M101 clean activity replay applied (no ledger writes).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
