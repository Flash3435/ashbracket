#!/usr/bin/env tsx
/**
 * Dry-run-first repair for semi-final and above picks stale under corrected
 * FIFA 2026 knockout topology. Clears impossible picks only — never auto-moves
 * teams between branches.
 *
 * Usage:
 *   npx tsx scripts/repair-knockout-topology-stale-picks.ts --all-pools
 *   npx tsx scripts/repair-knockout-topology-stale-picks.ts --pool <poolId> [--participant filter]
 *   Add --apply to persist clears (default is dry-run)
 *   Add --only-stale-finalists | --only-stale-champions
 *   Add --from-report /tmp/knockout-topology-stale-picks-audit.json to limit scope
 *   Add --recompute to recompute standings for affected pools after apply
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import {
  applyTopologyStalePickClear,
} from "../lib/bracket/executeKnockoutTopologyStalePickRepairs";
import {
  assertRepairPlanCanApply,
  repairPlanFingerprint,
  summarizeRepairActions,
  type TopologyStalePickRepairAction,
} from "../lib/bracket/planKnockoutTopologyStalePickRepairs";
import {
  loadActiveWorldCupPoolIds,
  loadTopologyScanContext,
  scanKnockoutTopologyStalePicksForPool,
  summarizeTopologyScanResults,
  type TopologyScanPoolResult,
} from "../lib/bracket/scanKnockoutTopologyStalePicks";
import { recomputePoolLedgerWithClient } from "../src/lib/scoring/recomputePoolLedger";
import { loadEnvLocal } from "./loadEnvLocal";

loadEnvLocal();

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const allPools = args.includes("--all-pools");
const recompute = args.includes("--recompute");
const onlyStaleFinalists = args.includes("--only-stale-finalists");
const onlyStaleChampions = args.includes("--only-stale-champions");
const poolIdx = args.indexOf("--pool");
const poolArg = poolIdx >= 0 ? args[poolIdx + 1]?.trim() : "";
const participantIdx = args.indexOf("--participant");
const participantFilter =
  participantIdx >= 0 ? args[participantIdx + 1]?.trim() : "";
const fromReportIdx = args.indexOf("--from-report");
const fromReportPath =
  fromReportIdx >= 0 ? args[fromReportIdx + 1]?.trim() : "";

if (!allPools && !poolArg) {
  console.error(
    "Usage: npx tsx scripts/repair-knockout-topology-stale-picks.ts --all-pools | --pool <poolId> [--participant filter] [--apply] [--recompute] [--from-report path]",
  );
  process.exit(1);
}

if (onlyStaleFinalists && onlyStaleChampions) {
  console.error("Use only one of --only-stale-finalists or --only-stale-champions.");
  process.exit(1);
}

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !key) {
  console.error("Missing Supabase URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

type ReportScope = {
  poolIds: Set<string>;
  participantIds: Set<string>;
};

function loadReportScope(path: string): ReportScope {
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    pools?: Array<{
      poolId: string;
      participants?: Array<{ participantId: string }>;
    }>;
  };
  const poolIds = new Set<string>();
  const participantIds = new Set<string>();
  for (const pool of raw.pools ?? []) {
    poolIds.add(pool.poolId);
    for (const participant of pool.participants ?? []) {
      participantIds.add(participant.participantId);
    }
  }
  return { poolIds, participantIds };
}

function printPlannedAction(action: TopologyStalePickRepairAction): void {
  console.log(
    [
      `[${action.rowState}]`,
      action.poolName,
      `(${action.poolId})`,
      "—",
      action.participantName,
      `(${action.participantId})`,
      "—",
      action.slot,
      "—",
      action.savedTeamName,
      "—",
      action.reason,
      "—",
      `before="${action.beforeValue}"`,
      `after="${action.afterValue}"`,
    ].join(" "),
  );
}

async function applyClear(
  client: SupabaseClient,
  action: TopologyStalePickRepairAction,
): Promise<void> {
  await applyTopologyStalePickClear(client, action);
}

async function planRepairs(): Promise<{
  poolResults: TopologyScanPoolResult[];
  actions: TopologyStalePickRepairAction[];
  fingerprint: string;
}> {
  const scope = fromReportPath ? loadReportScope(fromReportPath) : null;
  const poolIds = await loadActiveWorldCupPoolIds(
    supabase,
    allPools ? undefined : poolArg,
  );
  const filteredPools = scope
    ? poolIds.filter((pool) => scope.poolIds.has(pool.id))
    : poolIds;

  const scanContext = await loadTopologyScanContext(supabase);
  const poolResults: TopologyScanPoolResult[] = [];

  for (const pool of filteredPools) {
    const result = await scanKnockoutTopologyStalePicksForPool(supabase, {
      pool,
      ...scanContext,
      participantFilter,
      repairFilters: {
        onlyStaleFinalists,
        onlyStaleChampions,
      },
    });

    if (scope) {
      result.participants = result.participants.filter((p) =>
        scope.participantIds.has(p.participantId),
      );
    }

    poolResults.push(result);
  }

  const actions = poolResults.flatMap((pool) =>
    pool.participants.flatMap((p) => p.plannedClears),
  );

  return {
    poolResults,
    actions,
    fingerprint: repairPlanFingerprint(actions),
  };
}

async function main(): Promise<void> {
  console.log(`MODE: ${apply ? "apply" : "dry_run"}`);
  if (fromReportPath) {
    console.log(`Scope limited by report: ${fromReportPath}`);
  }
  console.log("Repair uses live audit logic — stale JSON is scope-only.\n");

  const initial = await planRepairs();
  const summary = summarizeRepairActions(initial.actions);
  const scanTotals = summarizeTopologyScanResults(initial.poolResults);

  console.log(`Pools scanned: ${scanTotals.poolsScanned}`);
  console.log(`Participants scanned: ${scanTotals.participantsScanned}`);
  console.log(`Participants with stale topology picks: ${scanTotals.participantsWithStalePicks}`);
  console.log(
    `Participants with missing-only downstream picks: ${scanTotals.participantsWithOnlyMissingDownstream}`,
  );
  console.log(`Planned clears: ${initial.actions.length}`);
  console.log(`  quarter-final-winner (semifinalist slots): ${summary.semifinalistClears}`);
  console.log(`  semifinal-winner/finalist: ${summary.finalistClears}`);
  console.log(`  champion: ${summary.championClears}`);
  console.log(`Plan fingerprint: ${initial.fingerprint}\n`);

  for (const action of initial.actions) {
    printPlannedAction(action);
  }

  if (initial.actions.length === 0) {
    console.log("\nNothing to repair.");
    return;
  }

  const gate = assertRepairPlanCanApply(initial.actions);
  if (!gate.ok) {
    console.error(`\n${gate.reason}`);
    process.exit(1);
  }

  if (!apply) {
    console.log("\nDry run complete. Re-run with --apply to persist clears.");
    return;
  }

  const verify = await planRepairs();
  if (verify.fingerprint !== initial.fingerprint) {
    console.error(
      "\nRefusing apply: audit results changed between planning and mutation.",
    );
    console.error(`  planned=${initial.fingerprint}`);
    console.error(`  current=${verify.fingerprint}`);
    process.exit(1);
  }

  let cleared = 0;
  for (const action of initial.actions) {
    await applyClear(supabase, action);
    cleared += 1;
  }

  const postScan = await planRepairs();
  const postSummary = summarizeRepairActions(initial.actions);
  const postTotals = summarizeTopologyScanResults(postScan.poolResults);

  console.log("\n=== POST-REPAIR SUMMARY ===");
  console.log(`Participants repaired: ${postSummary.participantsAffected}`);
  console.log(`Prediction rows cleared: ${cleared}`);
  console.log(`  quarter-final-winner slots cleared: ${postSummary.semifinalistClears}`);
  console.log(`  semifinal-winner/finalist slots cleared: ${postSummary.finalistClears}`);
  console.log(`  champion slots cleared: ${postSummary.championClears}`);
  console.log(
    `Participants still missing downstream picks: ${postTotals.participantsWithOnlyMissingDownstream}`,
  );
  console.log(
    `Participants still with stale topology picks: ${postTotals.participantsWithStalePicks}`,
  );

  if (recompute) {
    const poolIds = [...new Set(initial.actions.map((a) => a.poolId))];
    for (const poolId of poolIds) {
      const poolName =
        initial.actions.find((a) => a.poolId === poolId)?.poolName ?? poolId;
      console.log(`Recomputing standings for ${poolName} (${poolId})…`);
      const result = await recomputePoolLedgerWithClient(supabase, poolId, {
        ledgerTrigger: "admin_pick_edit",
        skipRevalidation: true,
      });
      if (result.error) {
        console.error(`  Recompute failed: ${result.error}`);
        process.exit(1);
      }
      console.log("  Recompute ok.");
    }
  } else {
    console.log("Standings recompute: skipped (pass --recompute to run).");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
