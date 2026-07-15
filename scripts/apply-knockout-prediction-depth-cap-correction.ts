#!/usr/bin/env tsx
/**
 * ⛔ NOT APPROVED FOR PRODUCTION
 *
 * Full-history knockout prediction-depth cap correction runner.
 *
 * The product cutover decision changed: do **not** apply the audited −4,872
 * full-history correction. Use the M101 transition runner instead:
 *
 *   npx tsx scripts/audit-m101-knockout-depth-transition.ts
 *   npx tsx scripts/apply-m101-knockout-depth-transition.ts
 *
 * This script will refuse to apply unless BOTH the historical confirm token AND
 * an explicit override (`--i-understand-full-history-not-approved`) are provided.
 * Prefer deleting any operational runbooks that reference this apply path.
 *
 * Defaults to **dry-run** (no writes). Historical apply (blocked):
 *
 *   npx tsx scripts/apply-knockout-prediction-depth-cap-correction.ts --apply \
 *     --confirm APPLY_KNOCKOUT_DEPTH_CAP_CORRECTION \
 *     --i-understand-full-history-not-approved
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvLocal } from "./loadEnvLocal";
import { capturePoolStandingsState } from "../lib/admin/pilotStandingsSnapshot";
import { recomputePoolLedgersWithScoreImpact } from "../lib/poolActivity/scoreImpact/recomputeWithScoreImpact";
import { KNOCKOUT_DEPTH_CAP_SCORING_CORRECTION_NOTICE } from "../lib/leaderboard/scoringCorrectionDisplay";

loadEnvLocal();

const CONFIRM_TOKEN = "APPLY_KNOCKOUT_DEPTH_CAP_CORRECTION";
const UNSAFE_OVERRIDE = "--i-understand-full-history-not-approved";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const unsafeOverride = args.includes(UNSAFE_OVERRIDE);
const confirmIdx = args.indexOf("--confirm");
const confirm = confirmIdx >= 0 ? args[confirmIdx + 1]?.trim() : "";
const reportDirIdx = args.indexOf("--report-dir");
const reportDir =
  reportDirIdx >= 0
    ? args[reportDirIdx + 1]?.trim()
    : `/tmp/ko-depth-cap-correction-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const poolIdx = args.indexOf("--pool");
const poolFilter = poolIdx >= 0 ? args[poolIdx + 1]?.trim() : "";

async function main() {
  console.error(
    "\n⛔ FULL-HISTORY DEPTH-CAP CORRECTION IS NOT APPROVED FOR PRODUCTION.\n" +
      "   Use scripts/apply-m101-knockout-depth-transition.ts instead.\n",
  );

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

  console.log(`\nMode: ${apply ? "APPLY (BLOCKED unless override)" : "DRY-RUN (default)"}`);
  console.log(`Pools (${pools.length}):`);
  for (const p of pools) {
    console.log(`  - ${p.name} (${p.id})`);
  }
  console.log(
    `\nThis would recompute ledgers under FULL-HISTORY awardedDepth = min(official, maxPredicted).`,
  );
  console.log(`Score-impact notice: ${KNOCKOUT_DEPTH_CAP_SCORING_CORRECTION_NOTICE}`);
  console.log(`Reports → ${reportDir}`);

  if (!apply) {
    console.log(
      `\nDry-run only. This path is NOT approved.\n` +
        `Approved transition:\n` +
        `  npx tsx scripts/audit-m101-knockout-depth-transition.ts\n` +
        `  npx tsx scripts/apply-m101-knockout-depth-transition.ts --apply --confirm APPLY_M101_KNOCKOUT_DEPTH_TRANSITION\n`,
    );
    process.exit(0);
  }

  if (confirm !== CONFIRM_TOKEN || !unsafeOverride) {
    console.error(
      `Refusing full-history apply (not approved).\n` +
        `Required (still not recommended): --confirm ${CONFIRM_TOKEN} ${UNSAFE_OVERRIDE}\n` +
        `Use the M101 transition runner instead.`,
    );
    process.exit(1);
  }

  console.error(
    "Override acknowledged — proceeding with NOT-APPROVED full-history correction.",
  );

  mkdirSync(reportDir, { recursive: true });

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
  console.log(`Wrote ${join(reportDir, "pre-standings.json")}`);

  const byEdition = new Map<string, typeof pools>();
  for (const p of pools) {
    const eid = p.tournament_edition_id as string;
    const list = byEdition.get(eid) ?? [];
    list.push(p);
    byEdition.set(eid, list);
  }

  const results: Array<{
    editionId: string;
    poolIds: string[];
    ok: boolean;
    error?: string;
  }> = [];

  for (const [editionId, editionPools] of byEdition) {
    const poolIds = editionPools.map((p) => p.id as string);
    console.log(
      `\nRecomputing edition ${editionId} (${editionPools.map((p) => p.name).join(", ")})…`,
    );
    const outcome = await recomputePoolLedgersWithScoreImpact(
      sb,
      poolIds,
      "admin_manual_recompute",
      {
        editionId,
        scoreSignature: `knockout_prediction_depth_cap:${new Date().toISOString().slice(0, 10)}`,
        scoringCorrections: [{ kind: "knockout_prediction_depth_cap" }],
      },
      {
        editionIsSimulation: false,
        onPoolStart: (poolId, index) => {
          const name = editionPools.find((p) => p.id === poolId)?.name ?? poolId;
          console.log(`  [${index + 1}/${poolIds.length}] start ${name}`);
        },
        onPoolEnd: (poolId, index, err) => {
          const name = editionPools.find((p) => p.id === poolId)?.name ?? poolId;
          if (err) console.error(`  [${index + 1}/${poolIds.length}] FAIL ${name}: ${err}`);
          else console.log(`  [${index + 1}/${poolIds.length}] ok ${name}`);
        },
      },
    );
    results.push({
      editionId,
      poolIds,
      ok: outcome.ok,
      error: outcome.ok ? undefined : outcome.error,
    });
    if (!outcome.ok) {
      console.error(`Stopping after edition failure: ${outcome.error}`);
      writeFileSync(
        join(reportDir, "apply-result.json"),
        JSON.stringify({ ok: false, results }, null, 2),
      );
      process.exit(1);
    }
  }

  const postSnapshots: Record<string, unknown> = {};
  for (const pool of pools) {
    const snap = await capturePoolStandingsState(sb, pool.id as string);
    postSnapshots[pool.id as string] = {
      poolName: pool.name,
      summaryHash: snap.summaryHash,
      rows: snap.rows,
    };
  }
  writeFileSync(
    join(reportDir, "post-standings.json"),
    JSON.stringify({ capturedAt: new Date().toISOString(), pools: postSnapshots }, null, 2),
  );
  writeFileSync(
    join(reportDir, "apply-result.json"),
    JSON.stringify(
      { ok: true, results, notice: KNOCKOUT_DEPTH_CAP_SCORING_CORRECTION_NOTICE },
      null,
      2,
    ),
  );
  console.log(`Wrote ${join(reportDir, "post-standings.json")}`);
  console.log("Done (full-history — not the approved cutover).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
