#!/usr/bin/env tsx
/**
 * One-time audit/backfill for knockout picks deleted or cleared by legacy repair
 * flows before locked "out" status was persisted on predictions.value_text.
 *
 * ## Recoverable data (root-cause scope)
 *
 * **High confidence — auto-apply with --apply**
 * - `participant_pick_correction_audit.metadata.markedOutPicks[]` (structured:
 *   predictionKind, slotKey, teamId, reason). Written by admin correction after
 *   the out-status fix; proves a locked invalid pick existed at correction time.
 *
 * **Medium confidence — manual review workflow**
 * - `metadata.clearedSummary[]` text lines from the same audit table. Parsed for
 *   stage label, team display name, and clear reason. Requires unique team name
 *   resolution and inferring slot/kind from label text.
 * - Dry run writes JSON/CSV review reports with stable `candidateId` values.
 * - Admin edits a decision file and applies with `--apply-reviewed`.
 *
 * **Not recoverable automatically**
 * - Rows removed by `repair-knockout-bracket-path-picks.ts` before out-status
 *   preservation (repair does not write audit rows).
 * - Audit rows with clearedPickCount but no markedOutPicks and unparseable
 *   clearedSummary lines.
 * - Conflicts where the slot already has a different active team pick.
 *
 * Usage:
 *   npx tsx scripts/backfill-knockout-out-picks-from-audit.ts --all-pools
 *   npx tsx scripts/backfill-knockout-out-picks-from-audit.ts <poolId> [--participant name]
 *   Add --report-json path/to/report.json for review artifact with candidate IDs.
 *   Add --report-csv path/to/review.csv for spreadsheet review.
 *   Add --apply to persist high-confidence restorations only (default dry run).
 *   Add --apply-reviewed path/to/review-decisions.json for approved medium rows.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildBackfillReviewReportPayload,
  buildKnockoutOutPickBackfillPlan,
  buildMediumCandidateReviewReports,
  buildReviewedMediumBackfillPlan,
  extractBackfillCandidatesFromAuditRows,
  getApplyableBackfillUpserts,
  getReviewedApplyableUpserts,
  mediumReviewReportsToCsv,
  parseBackfillReviewDecisionFile,
  validateBackfillReviewDecisions,
  type BackfillPlanItem,
  type CorrectionAuditRow,
} from "../lib/admin/knockoutOutPickBackfillPlanner";
import { mapTeamRow, mapTournamentStageRow } from "../lib/results/mapRows";
import { TEAM_TABLE_SELECT } from "../lib/teams/teamDbSelect";
import { mapPredictionRow } from "../src/lib/scoring/mapSupabaseRows";
import type { Prediction, TournamentStage } from "../src/types/domain";

function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const allPools = args.includes("--all-pools");
const FLAG_VALUE_KEYS = new Set([
  "--participant",
  "--report-json",
  "--report-csv",
  "--apply-reviewed",
]);

function isFlagValueArg(args: string[], index: number): boolean {
  const prev = args[index - 1];
  return prev != null && FLAG_VALUE_KEYS.has(prev);
}

const poolArg = args.find(
  (a, i) => !a.startsWith("--") && !isFlagValueArg(args, i),
)?.trim();
const participantIdx = args.indexOf("--participant");
const participantFilter =
  participantIdx >= 0 ? args[participantIdx + 1]?.trim().toLowerCase() : "";
const reportJsonIdx = args.indexOf("--report-json");
const reportJsonPath =
  reportJsonIdx >= 0 ? args[reportJsonIdx + 1]?.trim() : "";
const reportCsvIdx = args.indexOf("--report-csv");
const reportCsvPath = reportCsvIdx >= 0 ? args[reportCsvIdx + 1]?.trim() : "";
const applyReviewedIdx = args.indexOf("--apply-reviewed");
const applyReviewedPath =
  applyReviewedIdx >= 0 ? args[applyReviewedIdx + 1]?.trim() : "";

if (!allPools && !poolArg) {
  console.error(
    "Usage: npx tsx scripts/backfill-knockout-out-picks-from-audit.ts <poolId> [--participant name] [--apply] [--apply-reviewed path] [--report-json path] [--report-csv path]\n" +
      "   or: npx tsx scripts/backfill-knockout-out-picks-from-audit.ts --all-pools [flags]",
  );
  process.exit(1);
}

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!url || !key) {
  console.error("Requires SUPABASE_SERVICE_ROLE_KEY and Supabase URL.");
  process.exit(1);
}

const supabase = createClient(url, key);

const STAGE_CODES = [
  "group",
  "round_of_32",
  "round_of_16",
  "quarterfinal",
  "semifinal",
  "final",
] as const;

async function loadPoolIds(): Promise<string[]> {
  if (poolArg) return [poolArg];
  const { data, error } = await supabase
    .from("pools")
    .select("id")
    .is("archived_at", null);
  if (error) throw error;
  return (data ?? []).map((r) => r.id);
}

async function loadPoolNames(poolIds: string[]): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("pools")
    .select("id, name")
    .in("id", poolIds);
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(row.id, row.name?.trim() || row.id);
  }
  return map;
}

async function loadStages(): Promise<
  Partial<Record<TournamentStage["code"], TournamentStage>>
> {
  const { data, error } = await supabase
    .from("tournament_stages")
    .select(
      "id, code, label, sort_order, starts_at, ends_at, created_at, updated_at",
    )
    .in("code", STAGE_CODES);
  if (error) throw error;
  const stageByCode: Partial<Record<TournamentStage["code"], TournamentStage>> =
    {};
  for (const row of data ?? []) {
    const stage = mapTournamentStageRow(row);
    stageByCode[stage.code] = stage;
  }
  return stageByCode;
}

async function loadTeams() {
  const { data, error } = await supabase.from("teams").select(TEAM_TABLE_SELECT);
  if (error) throw error;
  return (data ?? []).map(mapTeamRow).map((t) => ({
    id: t.id,
    name: t.name,
    countryCode: t.countryCode,
  }));
}

async function loadParticipants(poolId: string) {
  const { data, error } = await supabase
    .from("participants")
    .select("id, display_name")
    .eq("pool_id", poolId);
  if (error) throw error;
  return data ?? [];
}

async function loadAuditRows(poolIds: string[]): Promise<CorrectionAuditRow[]> {
  const { data, error } = await supabase
    .from("participant_pick_correction_audit")
    .select(
      "id, pool_id, participant_id, match_code, created_at, actor_email, actor_user_id, metadata",
    )
    .in("pool_id", poolIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    poolId: row.pool_id,
    participantId: row.participant_id,
    matchCode: row.match_code,
    createdAt: row.created_at,
    actorEmail: row.actor_email,
    actorUserId: row.actor_user_id,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  }));
}

async function loadPredictions(
  poolIds: string[],
  participantIds: string[],
): Promise<Prediction[]> {
  if (participantIds.length === 0) return [];
  const { data, error } = await supabase
    .from("predictions")
    .select("*")
    .in("pool_id", poolIds)
    .in("participant_id", participantIds);
  if (error) throw error;
  return (data ?? []).map(mapPredictionRow);
}

function formatPlanItem(item: BackfillPlanItem): string {
  const c = item.candidate;
  const base =
    `[${c.confidence}] ${c.participantId} pool=${c.poolId} ${c.predictionKind}` +
    (c.slotKey ? ` slot=${c.slotKey}` : "") +
    ` team=${c.teamId} candidate=${c.candidateId}`;
  if (item.action === "restore" || item.action === "add_status_only") {
    return `  APPLY ${item.action}: ${base}\n    ${c.explanation}`;
  }
  if (item.action === "skip") {
    return `  SKIP (${item.reason}): ${base}${item.detail ? `\n    ${item.detail}` : ""}`;
  }
  return `  REVIEW (${item.reason}): ${base}\n    ${c.explanation}${item.detail ? `\n    ${item.detail}` : ""}`;
}

function detectManualAuditGaps(auditRows: CorrectionAuditRow[]): string[] {
  const gaps: string[] = [];
  for (const audit of auditRows) {
    const meta = audit.metadata;
    if (!meta) continue;
    const clearedCount =
      typeof meta.clearedPickCount === "number" ? meta.clearedPickCount : 0;
    if (clearedCount <= 0) continue;
    const marked = Array.isArray(meta.markedOutPicks)
      ? meta.markedOutPicks.length
      : 0;
    const summary = Array.isArray(meta.clearedSummary)
      ? meta.clearedSummary.length
      : 0;
    if (marked === 0 && summary === 0) {
      gaps.push(
        `Audit ${audit.id} (${audit.matchCode}) reports clearedPickCount=${clearedCount} without structured metadata — manual review required.`,
      );
    }
  }
  return gaps;
}

async function applyUpserts(
  upserts: ReturnType<typeof getApplyableBackfillUpserts>,
  label: string,
): Promise<number> {
  if (upserts.length === 0) return 0;
  for (const upsert of upserts) {
    const { error } = await supabase.from("predictions").upsert(upsert, {
      onConflict:
        "participant_id,pool_id,prediction_kind,tournament_stage_id,group_code,slot_key,bonus_key",
    });
    if (error) {
      console.error(`Failed to upsert prediction (${label}):`, error.message, upsert);
      process.exit(1);
    }
    console.log(
      `[${label}] Wrote out pick: participant=${upsert.participant_id} kind=${upsert.prediction_kind} slot=${upsert.slot_key ?? "null"} team=${upsert.team_id}`,
    );
  }
  return upserts.length;
}

async function main() {
  const poolIds = await loadPoolIds();
  const stageByCode = await loadStages();
  const teams = await loadTeams();
  const poolNameById = await loadPoolNames(poolIds);
  const auditRows = await loadAuditRows(poolIds);
  const auditById = new Map(auditRows.map((row) => [row.id, row] as const));

  const participantNameById = new Map<string, string>();
  for (const poolId of poolIds) {
    for (const p of await loadParticipants(poolId)) {
      participantNameById.set(p.id, p.display_name ?? p.id);
    }
  }

  const filteredAuditRows = auditRows.filter((row) => {
    if (!participantFilter) return true;
    const name = participantNameById.get(row.participantId)?.toLowerCase() ?? "";
    return name.includes(participantFilter);
  });

  const candidates = extractBackfillCandidatesFromAuditRows({
    auditRows: filteredAuditRows,
    stageByCode,
    teams,
  }).filter((c) => {
    if (!participantFilter) return true;
    const name = participantNameById.get(c.participantId)?.toLowerCase() ?? "";
    return name.includes(participantFilter);
  });

  const participantIds = [...new Set(candidates.map((c) => c.participantId))];
  const predictions = await loadPredictions(poolIds, participantIds);
  const plan = buildKnockoutOutPickBackfillPlan({
    candidates,
    existingPredictions: predictions,
  });

  const mediumReports = buildMediumCandidateReviewReports({
    candidates,
    existingPredictions: predictions,
    participantNameById,
    poolNameById,
    auditById,
  });
  const reviewPayload = buildBackfillReviewReportPayload({
    mediumReports,
  });
  const mediumCandidateIds = new Set(mediumReports.map((r) => r.candidateId));

  let reviewedPlan = null;
  let reviewedUpserts: ReturnType<typeof getReviewedApplyableUpserts> = [];
  if (applyReviewedPath) {
    const raw = JSON.parse(readFileSync(applyReviewedPath, "utf8")) as unknown;
    const decisionFile = parseBackfillReviewDecisionFile(raw);
    const validation = validateBackfillReviewDecisions({
      decisions: decisionFile.decisions,
      knownCandidateIds: mediumCandidateIds,
    });
    if (!validation.ok) {
      console.error("Review decision file rejected:");
      for (const err of validation.errors) console.error(`  ${err}`);
      process.exit(1);
    }
    reviewedPlan = buildReviewedMediumBackfillPlan({
      candidates,
      decisions: decisionFile.decisions,
      existingPredictions: predictions,
    });
    reviewedUpserts = getReviewedApplyableUpserts(reviewedPlan);
  }

  const highApplyUpserts = getApplyableBackfillUpserts(plan, apply);
  const manualGaps = detectManualAuditGaps(filteredAuditRows);
  const writeMode = apply || Boolean(applyReviewedPath);

  console.log("Knockout out-pick audit backfill");
  console.log(
    `Mode: ${writeMode ? "APPLY" : "DRY RUN"}${apply ? " (high-confidence)" : ""}${applyReviewedPath ? " (reviewed medium)" : ""}`,
  );
  console.log(`Pools scanned: ${poolIds.length}`);
  console.log(`Audit rows loaded: ${filteredAuditRows.length}`);
  console.log(`Medium review candidates: ${mediumReports.length}`);
  console.log("");
  console.log("Summary:");
  console.log(`  candidates found: ${plan.summary.candidatesFound}`);
  console.log(`  high-confidence restorations: ${plan.summary.plannedRestores + plan.summary.plannedStatusOnly}`);
  console.log(`    restore missing rows: ${plan.summary.plannedRestores}`);
  console.log(`    add out status only: ${plan.summary.plannedStatusOnly}`);
  console.log(`  skipped conflicts / already out: ${plan.summary.skippedConflicts}`);
  console.log(`  medium manual review: ${plan.summary.manualReview}`);
  console.log(`  high-confidence writes (${apply ? "this run" : "would apply"}): ${highApplyUpserts.length}`);
  if (reviewedPlan) {
    console.log(`  reviewed medium restores: ${reviewedPlan.summary.plannedRestores + reviewedPlan.summary.plannedStatusOnly}`);
    console.log(`  reviewed medium writes (${applyReviewedPath ? "this run" : "would apply"}): ${reviewedUpserts.length}`);
  }

  if (manualGaps.length > 0) {
    console.log("");
    console.log("Manual follow-up (audit gaps — likely old repair deletions):");
    for (const line of manualGaps) console.log(`  ${line}`);
  }

  console.log("");
  console.log("Plan details:");
  for (const item of plan.items) {
    const c = item.candidate;
    const name = participantNameById.get(c.participantId) ?? c.participantId;
    console.log(formatPlanItem(item).replace(c.participantId, name));
  }

  if (reviewedPlan) {
    console.log("");
    console.log("Reviewed medium plan:");
    for (const item of reviewedPlan.items) {
      const c = item.candidate;
      const name = participantNameById.get(c.participantId) ?? c.participantId;
      console.log(formatPlanItem(item).replace(c.participantId, name));
    }
  }

  const reportPayload = {
    ...reviewPayload,
    mode: writeMode ? "apply" : "dry_run",
    pools: poolIds,
    summary: plan.summary,
    manualAuditGaps: manualGaps,
    highConfidencePlan: plan.items.map((item) => ({
      ...item,
      participantName: participantNameById.get(item.candidate.participantId) ?? null,
      poolName: poolNameById.get(item.candidate.poolId) ?? null,
    })),
    reviewedMediumPlan: reviewedPlan?.items ?? null,
    highApplyUpsertCount: highApplyUpserts.length,
    reviewedApplyUpsertCount: reviewedUpserts.length,
  };

  if (reportJsonPath) {
    writeFileSync(reportJsonPath, `${JSON.stringify(reportPayload, null, 2)}\n`);
    console.log(`\nWrote JSON report: ${reportJsonPath}`);
  }

  if (reportCsvPath) {
    writeFileSync(reportCsvPath, mediumReviewReportsToCsv(mediumReports));
    console.log(`Wrote CSV review report: ${reportCsvPath}`);
  }

  if (!writeMode) {
    console.log(
      "\nDry run only. Use --apply for high-confidence rows, or --apply-reviewed <decisions.json> for approved medium rows.",
    );
    return;
  }

  let totalApplied = 0;
  if (apply) {
    totalApplied += await applyUpserts(highApplyUpserts, "high-confidence");
  }
  if (applyReviewedPath && reviewedUpserts.length > 0) {
    totalApplied += await applyUpserts(reviewedUpserts, "reviewed-medium");
  }

  if (totalApplied === 0) {
    console.log("\nNothing to apply.");
    return;
  }

  console.log(`\nApplied ${totalApplied} restoration(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
