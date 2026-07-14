#!/usr/bin/env tsx
/**
 * Dry-run audit for champion predictions likely deleted by the old topology
 * repair (`champion_not_in_valid_final` → DELETE). Never writes to the database.
 *
 * Usage:
 *   npx tsx scripts/audit-deleted-champion-picks.ts --all-pools
 *   npx tsx scripts/audit-deleted-champion-picks.ts --pool <poolId>
 *   Add --participant <uuid-or-name-filter>
 *   Add --report-json path/to/report.json
 *   Add --snapshot-json path/to/prior-predictions-export.json
 *   Add --repair-report-json path/to/prior-topology-repair-or-audit.json
 *
 * Evidence reliability (highest first):
 *   1. prediction history / correction audit with champion deletes
 *   2. --snapshot-json comparison
 *   3. --repair-report-json / repair logs with champion clears
 *   4. pool insights (supporting)
 *   5. remaining deep-path picks (corroboration only; never sole proof)
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./loadEnvLocal";

loadEnvLocal();

const args = process.argv.slice(2);
const allPools = args.includes("--all-pools");
const poolIdx = args.indexOf("--pool");
const poolArg =
  (poolIdx >= 0 ? args[poolIdx + 1]?.trim() : "") ||
  args.find((a) => !a.startsWith("--") && a !== "tsx")?.trim() ||
  "";
const participantIdx = args.indexOf("--participant");
const participantFilter =
  participantIdx >= 0 ? args[participantIdx + 1]?.trim().toLowerCase() : "";
const reportJsonIdx = args.indexOf("--report-json");
const reportJsonPath =
  reportJsonIdx >= 0
    ? args[reportJsonIdx + 1]?.trim()
    : "/tmp/deleted-champion-picks-audit.json";
const snapshotIdx = args.indexOf("--snapshot-json");
const snapshotPath =
  snapshotIdx >= 0 ? args[snapshotIdx + 1]?.trim() : "";
const repairReportIdx = args.indexOf("--repair-report-json");
const repairReportPath =
  repairReportIdx >= 0 ? args[repairReportIdx + 1]?.trim() : "";

if (!allPools && !poolArg) {
  console.error(
    "Usage: npx tsx scripts/audit-deleted-champion-picks.ts --all-pools | --pool <poolId> [--participant filter] [--report-json path] [--snapshot-json path] [--repair-report-json path]",
  );
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

async function fetchAllRows<T>(
  label: string,
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const pageSize = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await build(from, to);
    if (error) throw new Error(`${label}: ${error.message}`);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

export type EvidenceLevel =
  | "confirmed_history"
  | "confirmed_repair_log"
  | "confirmed_snapshot"
  | "strongly_supported"
  | "ambiguous";

export type RecommendedAction = "restore" | "manual_review" | "no_action";

export type DeletedChampionCandidate = {
  poolId: string;
  poolName: string;
  participantId: string;
  participantName: string;
  participantEmail: string | null;
  deletedChampionTeamId: string | null;
  deletedChampionTeamName: string | null;
  evidenceLevel: EvidenceLevel;
  evidence: string[];
  originalCreatedAt: string | null;
  deletionTimestamp: string | null;
  currentChampionRowExists: boolean;
  currentChampionTeamId: string | null;
  currentChampionTeamName: string | null;
  recommendedAction: RecommendedAction;
  hasSavedFinalists: boolean;
  deepPathTeamIds: string[];
};

type SnapshotPrediction = {
  pool_id?: string;
  poolId?: string;
  participant_id?: string;
  participantId?: string;
  prediction_kind?: string;
  predictionKind?: string;
  team_id?: string | null;
  teamId?: string | null;
  slot_key?: string | null;
  slotKey?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  updated_at?: string | null;
  updatedAt?: string | null;
};

type RepairChampionClear = {
  poolId: string;
  participantId: string;
  teamId: string;
  teamName?: string;
  timestamp?: string | null;
  source: string;
};

function loadJsonFile(path: string): unknown {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }
  return JSON.parse(readFileSync(resolved, "utf8"));
}

function normalizeSnapshotRows(raw: unknown): SnapshotPrediction[] {
  if (Array.isArray(raw)) return raw as SnapshotPrediction[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.predictions)) {
      return obj.predictions as SnapshotPrediction[];
    }
    if (Array.isArray(obj.rows)) return obj.rows as SnapshotPrediction[];
  }
  return [];
}

function parseRepairChampionClears(raw: unknown): RepairChampionClear[] {
  const out: RepairChampionClear[] = [];
  const visit = (node: unknown, pathHint: string) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, pathHint);
      return;
    }
    const row = node as Record<string, unknown>;
    const kind = String(
      row.predictionKind ?? row.prediction_kind ?? row.kind ?? "",
    );
    const issue = String(row.topologyIssue ?? row.topology_issue ?? "");
    const teamId = String(
      row.savedTeamId ?? row.teamId ?? row.team_id ?? row.deletedChampionTeamId ?? "",
    ).trim();
    const poolId = String(row.poolId ?? row.pool_id ?? "").trim();
    const participantId = String(
      row.participantId ?? row.participant_id ?? "",
    ).trim();
    const looksChampionClear =
      kind === "champion" ||
      issue === "champion_not_in_valid_final" ||
      issue === "champion_on_stale_finalist_path" ||
      String(row.slot ?? "").toLowerCase() === "champion";

    if (looksChampionClear && teamId && poolId && participantId) {
      out.push({
        poolId,
        participantId,
        teamId,
        teamName: String(row.savedTeamName ?? row.teamName ?? row.team_name ?? "") || undefined,
        timestamp: String(
          row.deletionTimestamp ??
            row.clearedAt ??
            row.created_at ??
            row.timestamp ??
            "",
        ) || null,
        source: pathHint,
      });
    }
    for (const [k, v] of Object.entries(row)) {
      if (v && typeof v === "object") visit(v, `${pathHint}.${k}`);
    }
  };
  visit(raw, "repair-report");
  return out;
}

function parseChampionClearedFromCorrectionMetadata(
  metadata: unknown,
): Array<{ teamName: string; line: string }> {
  if (!metadata || typeof metadata !== "object") return [];
  const summary = (metadata as { clearedSummary?: unknown }).clearedSummary;
  if (!Array.isArray(summary)) return [];
  const out: Array<{ teamName: string; line: string }> = [];
  for (const line of summary) {
    const s = String(line);
    const m = /^Champion\s*\(([^)]+)\)/i.exec(s);
    if (m?.[1]) out.push({ teamName: m[1].trim(), line: s });
  }
  return out;
}

function recommendAction(
  level: EvidenceLevel,
  currentChampionRowExists: boolean,
  teamId: string | null,
): RecommendedAction {
  if (!teamId) return "manual_review";
  if (currentChampionRowExists) return "no_action";
  if (
    level === "confirmed_history" ||
    level === "confirmed_repair_log" ||
    level === "confirmed_snapshot"
  ) {
    return "restore";
  }
  if (level === "strongly_supported") return "manual_review";
  return "manual_review";
}

function bestLevel(levels: EvidenceLevel[]): EvidenceLevel {
  const order: EvidenceLevel[] = [
    "confirmed_history",
    "confirmed_repair_log",
    "confirmed_snapshot",
    "strongly_supported",
    "ambiguous",
  ];
  for (const level of order) {
    if (levels.includes(level)) return level;
  }
  return "ambiguous";
}

async function main(): Promise<void> {
  console.log("=== Deleted champion picks audit (dry-run, read-only) ===\n");

  const availability = {
    predictionHistoryTables: false,
    snapshotProvided: Boolean(snapshotPath),
    repairReportProvided: Boolean(repairReportPath),
    correctionAuditTable: true,
    poolInsights: true,
  };

  let poolsQuery = supabase
    .from("pools")
    .select("id, name, archived_at, tournament_edition_id")
    .is("archived_at", null)
    .order("name");
  if (!allPools) {
    poolsQuery = poolsQuery.eq("id", poolArg);
  }
  const { data: pools, error: poolsErr } = await poolsQuery;
  if (poolsErr) throw new Error(poolsErr.message);
  if (!pools?.length) {
    console.error("No pools found.");
    process.exit(1);
  }

  const { data: teams, error: teamsErr } = await supabase
    .from("teams")
    .select("id, name, country_code");
  if (teamsErr) throw new Error(teamsErr.message);
  const teamNameById = new Map(
    (teams ?? []).map((t) => [t.id as string, t.name as string]),
  );
  const teamIdByName = new Map(
    (teams ?? []).map((t) => [
      String(t.name).trim().toLowerCase(),
      t.id as string,
    ]),
  );

  const snapshotChampions = new Map<
    string,
    { teamId: string; createdAt: string | null; updatedAt: string | null }
  >();
  if (snapshotPath) {
    const rows = normalizeSnapshotRows(loadJsonFile(snapshotPath));
    for (const row of rows) {
      const kind = row.prediction_kind ?? row.predictionKind;
      if (kind !== "champion") continue;
      const poolId = String(row.pool_id ?? row.poolId ?? "");
      const participantId = String(
        row.participant_id ?? row.participantId ?? "",
      );
      const teamId = String(row.team_id ?? row.teamId ?? "").trim();
      if (!poolId || !participantId || !teamId) continue;
      snapshotChampions.set(`${poolId}|${participantId}`, {
        teamId,
        createdAt: (row.created_at ?? row.createdAt ?? null) as string | null,
        updatedAt: (row.updated_at ?? row.updatedAt ?? null) as string | null,
      });
    }
    console.log(
      `Loaded ${snapshotChampions.size} champion rows from snapshot ${snapshotPath}`,
    );
  }

  const repairClears = repairReportPath
    ? parseRepairChampionClears(loadJsonFile(repairReportPath))
    : [];
  if (repairReportPath) {
    console.log(
      `Loaded ${repairClears.length} champion clear event(s) from ${repairReportPath}`,
    );
  }

  const poolIds = pools.map((p) => p.id as string);

  const correctionAudits = await fetchAllRows(
    "participant_pick_correction_audit",
    (from, to) =>
      supabase
        .from("participant_pick_correction_audit")
        .select(
          "id, pool_id, participant_id, match_code, metadata, created_at, reason",
        )
        .in("pool_id", poolIds)
        .order("created_at", { ascending: false })
        .range(from, to),
  );

  const insights = await fetchAllRows(
    "pool_activity insights",
    (from, to) =>
      supabase
        .from("pool_activity")
        .select("pool_id, body_text, metadata_json, created_at, type")
        .in("pool_id", poolIds)
        .eq("type", "pool_insight")
        .order("created_at", { ascending: true })
        .range(from, to),
  );

  const uniqueChampionInsightByPool = new Map<
    string,
    Array<{ teamId: string; teamName: string; at: string; body: string }>
  >();
  for (const row of insights) {
    const meta = (row.metadata_json ?? {}) as {
      source_key?: string;
      team_id?: string;
      team_name?: string;
    };
    const sourceKey = meta.source_key ?? "";
    if (!sourceKey.startsWith("postlock_unique_champion_pick_")) continue;
    const teamId = String(meta.team_id ?? "").trim();
    if (!teamId) continue;
    const list = uniqueChampionInsightByPool.get(row.pool_id as string) ?? [];
    list.push({
      teamId,
      teamName: String(meta.team_name ?? teamNameById.get(teamId) ?? teamId),
      at: row.created_at as string,
      body: String(row.body_text ?? ""),
    });
    uniqueChampionInsightByPool.set(row.pool_id as string, list);
  }

  const candidates: DeletedChampionCandidate[] = [];
  let participantsWithNoChampion = 0;
  let candidatesWithCurrentChampion = 0;

  for (const pool of pools) {
    const poolId = pool.id as string;
    const poolName = String(pool.name ?? poolId);

    let participantsQuery = supabase
      .from("participants")
      .select("id, display_name, email")
      .eq("pool_id", poolId)
      .order("display_name");
    const { data: participants, error: partErr } = await participantsQuery;
    if (partErr) throw new Error(partErr.message);

    const filtered = (participants ?? []).filter((p) => {
      if (!participantFilter) return true;
      const id = String(p.id);
      const name = String(p.display_name ?? "").toLowerCase();
      const email = String(p.email ?? "").toLowerCase();
      return (
        id.toLowerCase() === participantFilter ||
        name.includes(participantFilter) ||
        email.includes(participantFilter)
      );
    });

    const predictions = await fetchAllRows(
      `predictions pool ${poolId}`,
      (from, to) =>
        supabase
          .from("predictions")
          .select(
            "id, participant_id, prediction_kind, team_id, slot_key, value_text, created_at, updated_at",
          )
          .eq("pool_id", poolId)
          .in("prediction_kind", [
            "champion",
            "finalist",
            "semifinalist",
            "quarterfinalist",
            "round_of_16",
            "round_of_32",
          ])
          .order("id")
          .range(from, to),
    );

    const predsByParticipant = new Map<string, typeof predictions>();
    for (const pred of predictions ?? []) {
      const pid = pred.participant_id as string;
      const list = predsByParticipant.get(pid) ?? [];
      list.push(pred);
      predsByParticipant.set(pid, list);
    }

    const currentChampionTeamIds = new Set(
      (predictions ?? [])
        .filter((p) => p.prediction_kind === "champion" && p.team_id)
        .map((p) => p.team_id as string),
    );

    for (const participant of filtered) {
      const participantId = participant.id as string;
      const preds = predsByParticipant.get(participantId) ?? [];
      const champRows = preds.filter((p) => p.prediction_kind === "champion");
      const currentChamp = champRows.find((p) => Boolean(p.team_id?.trim()));
      const currentChampionRowExists = Boolean(currentChamp?.team_id?.trim());
      if (!currentChampionRowExists) participantsWithNoChampion += 1;

      const finalists = preds.filter(
        (p) => p.prediction_kind === "finalist" && p.team_id?.trim(),
      );
      const hasSavedFinalists = finalists.length > 0;
      const finalistTeamIds = new Set(
        finalists.map((p) => p.team_id as string),
      );

      const deepKinds = [
        "round_of_32",
        "round_of_16",
        "quarterfinalist",
        "semifinalist",
      ] as const;
      const deepCounts = new Map<string, number>();
      for (const pred of preds) {
        if (!deepKinds.includes(pred.prediction_kind as (typeof deepKinds)[number])) {
          continue;
        }
        const tid = String(pred.team_id ?? "").trim();
        if (!tid) continue;
        deepCounts.set(tid, (deepCounts.get(tid) ?? 0) + 1);
      }
      const deepPathTeamIds = [...deepCounts.entries()]
        .filter(([, count]) => count >= 2)
        .map(([tid]) => tid);

      const evidence: string[] = [];
      const levels: EvidenceLevel[] = [];
      let deletedChampionTeamId: string | null = null;
      let originalCreatedAt: string | null = null;
      let deletionTimestamp: string | null = null;

      const key = `${poolId}|${participantId}`;
      const snap = snapshotChampions.get(key);
      if (snap) {
        if (!currentChampionRowExists || currentChamp?.team_id !== snap.teamId) {
          deletedChampionTeamId = snap.teamId;
          originalCreatedAt = snap.createdAt;
          levels.push("confirmed_snapshot");
          evidence.push(
            `Snapshot had champion team ${snap.teamId} (${teamNameById.get(snap.teamId) ?? "?"}); current row ${
              currentChampionRowExists
                ? `is ${currentChamp?.team_id}`
                : "is missing"
            }.`,
          );
        }
      }

      const repairHits = repairClears.filter(
        (c) => c.poolId === poolId && c.participantId === participantId,
      );
      for (const hit of repairHits) {
        deletedChampionTeamId = deletedChampionTeamId ?? hit.teamId;
        deletionTimestamp = deletionTimestamp ?? hit.timestamp;
        levels.push("confirmed_repair_log");
        evidence.push(
          `Repair log/report (${hit.source}) cleared champion ${hit.teamId}${
            hit.teamName ? ` (${hit.teamName})` : ""
          }.`,
        );
      }

      const participantCorrections = correctionAudits.filter(
        (a) =>
          a.pool_id === poolId && a.participant_id === participantId,
      );
      for (const audit of participantCorrections) {
        const champLines = parseChampionClearedFromCorrectionMetadata(
          audit.metadata,
        );
        for (const line of champLines) {
          const tid =
            teamIdByName.get(line.teamName.toLowerCase()) ?? null;
          if (!tid) continue;
          // Path-correction clears often re-saved the same champion. Only keep
          // as supporting evidence when the champion row is presently missing
          // or points at a different team — never treat as confirmed restore.
          if (
            currentChampionRowExists &&
            currentChamp?.team_id === tid
          ) {
            continue;
          }
          if (!currentChampionRowExists) {
            deletedChampionTeamId = deletedChampionTeamId ?? tid;
            deletionTimestamp =
              deletionTimestamp ?? (audit.created_at as string);
            levels.push("strongly_supported");
            evidence.push(
              `participant_pick_correction_audit ${audit.id} at ${audit.created_at} clearedSummary: ${line.line} (match ${audit.match_code}). Not confirmed topology repair delete.`,
            );
          } else {
            levels.push("ambiguous");
            evidence.push(
              `Correction audit cleared ${line.teamName} but a different champion (${currentChamp?.team_id}) exists now.`,
            );
          }
        }
      }

      // Supporting: unique-champion pool insight for a team nobody currently holds,
      // combined with topology-delete pattern (finalists present, champion missing,
      // and this participant carried that team at least to the semis).
      const uniqueInsights = uniqueChampionInsightByPool.get(poolId) ?? [];
      const matchingUnique: typeof uniqueInsights = [];
      for (const insight of uniqueInsights) {
        if (currentChampionTeamIds.has(insight.teamId)) continue;
        if (currentChampionRowExists) continue;
        if (!hasSavedFinalists) {
          evidence.push(
            `Supporting only: pool unique-champion insight for ${insight.teamName} at ${insight.at}, but no finalists (topology delete pattern weak).`,
          );
          continue;
        }
        if (finalistTeamIds.has(insight.teamId)) continue;
        const hasSemiOrDeeper = preds.some(
          (p) =>
            (p.prediction_kind === "semifinalist" ||
              p.prediction_kind === "finalist") &&
            p.team_id === insight.teamId,
        );
        if (!hasSemiOrDeeper) {
          evidence.push(
            `Supporting only: pool unique-champion insight for ${insight.teamName} at ${insight.at}; participant lacks semi/final path for that team.`,
          );
          continue;
        }
        matchingUnique.push(insight);
      }
      if (matchingUnique.length === 1) {
        const insight = matchingUnique[0]!;
        deletedChampionTeamId = deletedChampionTeamId ?? insight.teamId;
        levels.push("strongly_supported");
        evidence.push(
          `Pool insight "${insight.body}" (${insight.at}) names ${insight.teamName} as unique champion; participant has finalists that exclude that team (old repair delete pattern) and semi+ path picks for ${insight.teamName}. Not participant-named confirmation.`,
        );
      } else if (matchingUnique.length > 1) {
        levels.push("ambiguous");
        evidence.push(
          `Multiple unique-champion insights match semi+ path (${matchingUnique
            .map((i) => i.teamName)
            .join(", ")}); cannot choose a single deleted champion without history.`,
        );
      }

      // Topology delete pattern without a named team: finalists present, no champion.
      if (
        !currentChampionRowExists &&
        hasSavedFinalists &&
        !deletedChampionTeamId &&
        deepPathTeamIds.some((tid) => !finalistTeamIds.has(tid))
      ) {
        levels.push("ambiguous");
        evidence.push(
          `No champion row; has finalist(s); deep-path team(s) ${deepPathTeamIds
            .filter((tid) => !finalistTeamIds.has(tid))
            .map((tid) => teamNameById.get(tid) ?? tid)
            .join(", ")} are not among finalists — possible old topology champion delete, team unknown.`,
        );
      }

      if (levels.length === 0 && evidence.length === 0) {
        continue;
      }
      if (
        levels.length === 0 &&
        evidence.length > 0 &&
        !deletedChampionTeamId
      ) {
        continue;
      }
      if (levels.length === 0) continue;

      if (currentChampionRowExists) candidatesWithCurrentChampion += 1;

      const evidenceLevel = bestLevel(levels);
      const deletedChampionTeamName = deletedChampionTeamId
        ? teamNameById.get(deletedChampionTeamId) ?? null
        : null;

      candidates.push({
        poolId,
        poolName,
        participantId,
        participantName: String(participant.display_name ?? participantId),
        participantEmail: (participant.email as string | null) ?? null,
        deletedChampionTeamId,
        deletedChampionTeamName,
        evidenceLevel,
        evidence,
        originalCreatedAt,
        deletionTimestamp,
        currentChampionRowExists,
        currentChampionTeamId: (currentChamp?.team_id as string | null) ?? null,
        currentChampionTeamName: currentChamp?.team_id
          ? teamNameById.get(currentChamp.team_id as string) ?? null
          : null,
        recommendedAction: recommendAction(
          evidenceLevel,
          currentChampionRowExists,
          deletedChampionTeamId,
        ),
        hasSavedFinalists,
        deepPathTeamIds,
      });
    }
  }

  const confirmed = candidates.filter((c) =>
    ["confirmed_history", "confirmed_repair_log", "confirmed_snapshot"].includes(
      c.evidenceLevel,
    ),
  );
  const strongly = candidates.filter(
    (c) => c.evidenceLevel === "strongly_supported",
  );
  const ambiguous = candidates.filter((c) => c.evidenceLevel === "ambiguous");
  const restoreReady = confirmed.filter(
    (c) => c.recommendedAction === "restore" && !c.currentChampionRowExists,
  );

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: true,
    wroteToDatabase: false,
    availability,
    poolsChecked: pools.map((p) => ({
      poolId: p.id,
      poolName: p.name,
    })),
    totals: {
      poolsChecked: pools.length,
      candidates: candidates.length,
      confirmedDeletedChampionRows: confirmed.length,
      stronglySupported: strongly.length,
      ambiguous: ambiguous.length,
      participantsWithNoChampionRow: participantsWithNoChampion,
      candidatesWhereAnotherChampionExists: candidatesWithCurrentChampion,
      restoreRecommended: restoreReady.length,
    },
    candidates,
    restoreCandidates: restoreReady,
  };

  writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));

  console.log(`Pools checked: ${report.totals.poolsChecked}`);
  console.log(
    `Prediction history tables: ${availability.predictionHistoryTables ? "available" : "not present"}`,
  );
  console.log(
    `Confirmed deleted champion rows: ${report.totals.confirmedDeletedChampionRows}`,
  );
  console.log(`Strongly supported: ${report.totals.stronglySupported}`);
  console.log(`Ambiguous: ${report.totals.ambiguous}`);
  console.log(
    `Participants with no champion row (in scope): ${report.totals.participantsWithNoChampionRow}`,
  );
  console.log(
    `Candidates where another champion now exists: ${report.totals.candidatesWhereAnotherChampionExists}`,
  );
  console.log(`Restore-ready (confirmed + missing): ${report.totals.restoreRecommended}`);
  console.log(`\nWrote report: ${reportJsonPath}`);

  for (const c of candidates) {
    console.log(
      `\n- [${c.evidenceLevel}] ${c.participantName} (${c.participantEmail ?? "no-email"}) pool=${c.poolName}`,
    );
    console.log(
      `  deletedChampion=${c.deletedChampionTeamName ?? "?"} action=${c.recommendedAction} currentChampionExists=${c.currentChampionRowExists}`,
    );
    for (const e of c.evidence) console.log(`  evidence: ${e}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
