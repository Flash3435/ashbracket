#!/usr/bin/env tsx
/**
 * Read-only audit for semi-final and above picks stale under corrected FIFA 2026
 * knockout topology (M101 = M97+M98, M102 = M99+M100).
 *
 * This script makes NO database writes.
 *
 * Usage:
 *   npx tsx scripts/audit-knockout-topology-stale-picks.ts --all-pools
 *   npx tsx scripts/audit-knockout-topology-stale-picks.ts <poolId>
 *   Add --participant name-filter
 *   Add --report-json /tmp/knockout-topology-stale-picks-audit.json
 *   Add --include-semifinals (also run M101/M102 semifinal pick audit)
 *   Add --only-semifinals (semifinal pick audit only → /tmp/knockout-semifinal-picks-audit.json)
 *
 * Manual sanity checks (see lib/bracket/auditKnockoutTopologyStalePicks.selftest.ts):
 * - France + Spain finalists → stale (same M101 branch)
 * - France + Brazil finalists → not stale (opposite branches)
 * - Missing champion → missing, not stale
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  auditKnockoutTopologyStalePicks,
  CORRECTED_TOPOLOGY,
  formatTopologyAuditTotalsForConsole,
  summarizeTopologyAuditTotals,
  type TopologyParticipantAudit,
} from "../lib/bracket/auditKnockoutTopologyStalePicks";
import { TOPOLOGY_STALE_FINALIST_SLOTS_EXPLANATION } from "../lib/bracket/knockoutBracketDisplayCopy";
import {
  auditKnockoutSemifinalPicks,
  isStaleSemifinalPickStatus,
  summarizeSemifinalAuditTotals,
  type SemifinalParticipantAudit,
} from "../lib/bracket/auditKnockoutSemifinalPicks";
import {
  buildAllParticipantPickDrafts,
  participantBonusKeysForPool,
} from "../lib/predictions/buildParticipantPickDrafts";
import { pruneOfficialKnockoutPathPicks } from "../lib/predictions/pruneOfficialKnockoutPathPicks";
import {
  buildKnockoutMatchPickRows,
  type ConfirmedR32WinnerContext,
} from "../lib/picks/knockoutMatchPickRows";
import { getGradualKnockoutSelectionState } from "../lib/picks/gradualKnockoutUnlock";
import { isKnockoutPickLockedOut } from "../lib/predictions/knockoutPickStatus";
import { mapTeamRow, mapTournamentStageRow } from "../lib/results/mapRows";
import { TEAM_TABLE_SELECT } from "../lib/teams/teamDbSelect";
import { fetchGroupTeamCountryCodesByLetter } from "../lib/tournament/fetchGroupTeamCountryCodesByLetter";
import { mapPredictionRow } from "../src/lib/scoring/mapSupabaseRows";
import type { Prediction, Team } from "../src/types/domain";
import type { TournamentMatchPublicRow } from "../types/tournamentPublic";

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
const allPools = args.includes("--all-pools");
const includeSemifinals = args.includes("--include-semifinals");
const onlySemifinals = args.includes("--only-semifinals");
const poolArg = args.find((a) => !a.startsWith("--"))?.trim();
const participantIdx = args.indexOf("--participant");
const participantFilter =
  participantIdx >= 0 ? args[participantIdx + 1]?.trim().toLowerCase() : "";
const reportJsonIdx = args.indexOf("--report-json");
const defaultReportPath = onlySemifinals
  ? "/tmp/knockout-semifinal-picks-audit.json"
  : "/tmp/knockout-topology-stale-picks-audit.json";
const reportJsonPath =
  reportJsonIdx >= 0 ? args[reportJsonIdx + 1]?.trim() : defaultReportPath;

if (!allPools && !poolArg) {
  console.error(
    "Usage: npx tsx scripts/audit-knockout-topology-stale-picks.ts <poolId> | --all-pools [--participant name] [--report-json path] [--include-semifinals | --only-semifinals]",
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

type ParticipantRow = {
  id: string;
  display_name: string;
  email: string | null;
};

type PoolReport = {
  poolId: string;
  poolName: string;
  participantsScanned: number;
  participantsWithStalePicks: number;
  participantsWithOnlyMissingDownstream: number;
  participants: Array<{
    participantId: string;
    displayName: string;
    email: string | null;
    stalePicks: TopologyParticipantAudit["stalePicks"];
    missingPicks: TopologyParticipantAudit["missingPicks"];
    notes: string[];
  }>;
};

type SemifinalPoolReport = {
  poolId: string;
  poolName: string;
  participantsScanned: number;
  participants: Array<{
    participantId: string;
    displayName: string;
    email: string | null;
    semifinalPicks: SemifinalParticipantAudit["semifinalPicks"];
  }>;
};

function teamName(teamId: string | null, teams: Team[]): string | null {
  if (!teamId?.trim()) return null;
  return teams.find((t) => t.id === teamId.trim())?.name?.trim() ?? teamId;
}

async function loadTournamentMatches(): Promise<TournamentMatchPublicRow[]> {
  const { data, error } = await supabase.from("tournament_public_matches").select("*");
  if (error) throw error;
  return (data ?? []) as unknown as TournamentMatchPublicRow[];
}

async function loadAllPredictionsForPool(poolId: string): Promise<Prediction[]> {
  const pageSize = 1000;
  const all: Prediction[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("predictions")
      .select("*")
      .eq("pool_id", poolId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data ?? []).map(mapPredictionRow);
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

async function loadParticipantsPaged(poolId: string): Promise<ParticipantRow[]> {
  const pageSize = 200;
  const all: ParticipantRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("participants")
      .select("id, display_name, email")
      .eq("pool_id", poolId)
      .order("display_name")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data ?? []) as ParticipantRow[];
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

async function loadPoolIds(): Promise<Array<{ id: string; name: string }>> {
  if (!allPools) {
    const { data, error } = await supabase
      .from("pools")
      .select("id, name")
      .eq("id", poolArg!)
      .maybeSingle();
    if (error || !data) throw new Error(`Pool not found: ${poolArg}`);
    return [{ id: data.id, name: data.name }];
  }
  const { data, error } = await supabase
    .from("pools")
    .select("id, name")
    .is("archived_at", null)
    .eq("is_simulation", false)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; name: string }>;
}

function hasSfPlusSavedPick(slots: ReturnType<typeof buildAllParticipantPickDrafts>): boolean {
  return slots.some(
    (s) =>
      (s.predictionKind === "semifinalist" ||
        s.predictionKind === "finalist" ||
        s.predictionKind === "champion") &&
      s.teamId.trim(),
  );
}

function auditParticipant(input: {
  slots: ReturnType<typeof buildAllParticipantPickDrafts>;
  ctx: ConfirmedR32WinnerContext;
  teams: Team[];
}): TopologyParticipantAudit {
  const pathRepair = pruneOfficialKnockoutPathPicks(input.slots, input.ctx);
  const audit = auditKnockoutTopologyStalePicks({
    slots: input.slots,
    teamName: (id) => teamName(id, input.teams) ?? id,
    pathRepairCleared: pathRepair.cleared.filter((c) =>
      ["semifinalist", "finalist", "champion"].includes(c.predictionKind),
    ),
  });

  const notes = [...audit.notes];
  for (const stale of audit.stalePicks) {
    const row = input.slots.find(
      (s) =>
        s.predictionKind === stale.predictionKind &&
        s.slotKey === stale.slotKey,
    );
    if (row && isKnockoutPickLockedOut(row)) {
      notes.push(
        `${stale.slot} is locked out in DB (pickStatus=out) — audit only, no repair performed.`,
      );
    }
  }

  const sfRows = buildKnockoutMatchPickRows({
    bracketKind: "semifinalist",
    slots: input.slots,
    teams: input.teams,
    tournamentMatches: input.ctx.tournamentMatches ?? undefined,
    gradual: input.ctx.gradual,
    knockoutBracketPicksUnlocked: input.ctx.knockoutBracketPicksUnlocked ?? true,
  });
  for (const row of sfRows) {
    if (row.lockReason !== "frozen") continue;
    const kind = row.savePredictionKind;
    if (kind !== "semifinalist" && kind !== "finalist") continue;
    notes.push(
      `M${row.fifaMatchNo} row may be frozen by official feeder results — review before editing.`,
    );
  }

  return { ...audit, notes: [...new Set(notes)] };
}

function auditParticipantSemifinals(input: {
  slots: ReturnType<typeof buildAllParticipantPickDrafts>;
  ctx: ConfirmedR32WinnerContext;
  teams: Team[];
}): SemifinalParticipantAudit {
  return auditKnockoutSemifinalPicks({
    slots: input.slots,
    ctx: input.ctx,
    teamName: (id) => teamName(id, input.teams) ?? id,
  });
}

async function auditPoolSemifinals(
  pool: { id: string; name: string },
  tournamentMatches: TournamentMatchPublicRow[],
  teams: Team[],
  stageByCode: Record<string, { id: string; code: string }>,
  groupMap: Awaited<ReturnType<typeof fetchGroupTeamCountryCodesByLetter>>,
): Promise<SemifinalPoolReport> {
  const [participants, predictions, scoringRes] = await Promise.all([
    loadParticipantsPaged(pool.id),
    loadAllPredictionsForPool(pool.id),
    supabase.from("scoring_rules").select("bonus_key").eq("pool_id", pool.id),
  ]);
  if (scoringRes.error) throw scoringRes.error;

  const bonusKeys = participantBonusKeysForPool(
    (scoringRes.data ?? []).map((r) => String(r.bonus_key ?? "")),
  );
  const knockoutBracketPicksUnlocked = true;
  const gradual = getGradualKnockoutSelectionState({
    matches: tournamentMatches,
    teams,
    fullRoundOf32Official: knockoutBracketPicksUnlocked,
  });
  const ctx: ConfirmedR32WinnerContext = {
    teams,
    tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked,
  };

  const poolParticipants: SemifinalPoolReport["participants"] = [];

  for (const participant of participants) {
    if (participantFilter) {
      const hay = `${participant.display_name} ${participant.email ?? ""}`.toLowerCase();
      if (!hay.includes(participantFilter)) continue;
    }

    const participantPredictions = predictions.filter(
      (p) => p.participantId === participant.id,
    );
    const slots = buildAllParticipantPickDrafts({
      stageByCode: stageByCode as Parameters<
        typeof buildAllParticipantPickDrafts
      >[0]["stageByCode"],
      predictions: participantPredictions,
      participantId: participant.id,
      bonusKeys,
      teams,
      groupTeamCountryCodesByLetter: groupMap,
    });

    const audit = auditParticipantSemifinals({ slots, ctx, teams });
    poolParticipants.push({
      participantId: participant.id,
      displayName: participant.display_name,
      email: participant.email,
      semifinalPicks: audit.semifinalPicks,
    });
  }

  return {
    poolId: pool.id,
    poolName: pool.name,
    participantsScanned: participants.length,
    participants: poolParticipants,
  };
}

async function auditPool(
  pool: { id: string; name: string },
  tournamentMatches: TournamentMatchPublicRow[],
  teams: Team[],
  stageByCode: Record<string, { id: string; code: string }>,
  groupMap: Awaited<ReturnType<typeof fetchGroupTeamCountryCodesByLetter>>,
): Promise<PoolReport> {
  const [participants, predictions, scoringRes] = await Promise.all([
    loadParticipantsPaged(pool.id),
    loadAllPredictionsForPool(pool.id),
    supabase.from("scoring_rules").select("bonus_key").eq("pool_id", pool.id),
  ]);
  if (scoringRes.error) throw scoringRes.error;

  const bonusKeys = participantBonusKeysForPool(
    (scoringRes.data ?? []).map((r) => String(r.bonus_key ?? "")),
  );
  const knockoutBracketPicksUnlocked = true;
  const gradual = getGradualKnockoutSelectionState({
    matches: tournamentMatches,
    teams,
    fullRoundOf32Official: knockoutBracketPicksUnlocked,
  });
  const ctx: ConfirmedR32WinnerContext = {
    teams,
    tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked,
  };

  const poolParticipants: PoolReport["participants"] = [];
  let participantsWithStalePicks = 0;
  let participantsWithOnlyMissingDownstream = 0;

  for (const participant of participants) {
    if (participantFilter) {
      const hay = `${participant.display_name} ${participant.email ?? ""}`.toLowerCase();
      if (!hay.includes(participantFilter)) continue;
    }

    const participantPredictions = predictions.filter(
      (p) => p.participantId === participant.id,
    );
    const slots = buildAllParticipantPickDrafts({
      stageByCode: stageByCode as Parameters<
        typeof buildAllParticipantPickDrafts
      >[0]["stageByCode"],
      predictions: participantPredictions,
      participantId: participant.id,
      bonusKeys,
      teams,
      groupTeamCountryCodesByLetter: groupMap,
    });

    if (!hasSfPlusSavedPick(slots)) continue;

    const audit = auditParticipant({ slots, ctx, teams });
    if (audit.stalePicks.length === 0 && audit.missingPicks.length === 0) {
      continue;
    }

    if (audit.stalePicks.length > 0) {
      participantsWithStalePicks += 1;
    } else {
      participantsWithOnlyMissingDownstream += 1;
    }

    poolParticipants.push({
      participantId: participant.id,
      displayName: participant.display_name,
      email: participant.email,
      stalePicks: audit.stalePicks,
      missingPicks: audit.missingPicks,
      notes: audit.notes,
    });
  }

  return {
    poolId: pool.id,
    poolName: pool.name,
    participantsScanned: participants.length,
    participantsWithStalePicks,
    participantsWithOnlyMissingDownstream,
    participants: poolParticipants,
  };
}

async function main(): Promise<void> {
  console.log("MODE: read_only_audit — no predictions or scores will be modified.\n");

  const pools = await loadPoolIds();
  const tournamentMatches = await loadTournamentMatches();

  const [stagesRes, teamsRes, groupMap] = await Promise.all([
    supabase.from("tournament_stages").select("*"),
    supabase.from("teams").select(TEAM_TABLE_SELECT),
    fetchGroupTeamCountryCodesByLetter(supabase),
  ]);
  if (stagesRes.error) throw stagesRes.error;
  if (teamsRes.error) throw teamsRes.error;

  const stageByCode = Object.fromEntries(
    (stagesRes.data ?? []).map((row) => {
      const stage = mapTournamentStageRow(
        row as Parameters<typeof mapTournamentStageRow>[0],
      );
      return [stage.code, stage];
    }),
  );
  const teams = (teamsRes.data ?? []).map(mapTeamRow);

  if (onlySemifinals || includeSemifinals) {
    const semifinalPoolReports: SemifinalPoolReport[] = [];
    const allSemifinalAudits: SemifinalParticipantAudit[] = [];
    let semifinalParticipantsScanned = 0;

    for (const pool of pools) {
      console.log(`=== ${pool.name} (${pool.id}) — semifinal picks ===`);
      const report = await auditPoolSemifinals(
        pool,
        tournamentMatches,
        teams,
        stageByCode,
        groupMap,
      );
      semifinalPoolReports.push(report);
      semifinalParticipantsScanned += report.participantsScanned;

      for (const p of report.participants) {
        allSemifinalAudits.push({ semifinalPicks: p.semifinalPicks });
      }

      const poolStale = report.participants.filter((p) =>
        p.semifinalPicks.some((pick) => isStaleSemifinalPickStatus(pick.status)),
      );
      const poolMissing = report.participants.filter((p) =>
        p.semifinalPicks.some((pick) => pick.status === "missing"),
      );

      console.log(`Participants scanned: ${report.participantsScanned}`);
      console.log(`With stale semifinal picks: ${poolStale.length}`);
      console.log(`With missing semifinal picks: ${poolMissing.length}`);

      for (const p of poolStale.slice(0, 20)) {
        console.log(
          `  ${p.displayName}${p.email ? ` <${p.email}>` : ""}`,
        );
        for (const pick of p.semifinalPicks.filter((x) =>
          isStaleSemifinalPickStatus(x.status),
        )) {
          console.log(
            `    [${pick.locked ? "locked" : "editable"}] ${pick.slot}: ${pick.savedTeamName} — ${pick.reason}`,
          );
        }
      }
      if (poolStale.length > 20) {
        console.log(`  … +${poolStale.length - 20} more participants with stale semifinal picks`);
      }
    }

    const semifinalTotals = summarizeSemifinalAuditTotals({
      poolsScanned: semifinalPoolReports.length,
      participantsScanned: semifinalParticipantsScanned,
      participantAudits: allSemifinalAudits,
    });

    const semifinalOutput = {
      generatedAt: new Date().toISOString(),
      mode: "read_only_semifinal_audit" as const,
      topology: CORRECTED_TOPOLOGY,
      totals: semifinalTotals,
      pools: semifinalPoolReports,
    };

    const semifinalJsonPath = onlySemifinals
      ? reportJsonPath
      : "/tmp/knockout-semifinal-picks-audit.json";
    writeFileSync(semifinalJsonPath, JSON.stringify(semifinalOutput, null, 2) + "\n");
    console.log(`\nWrote ${semifinalJsonPath}`);
    console.log("\n=== SEMIFINAL PICK TOTALS ===");
    console.log(JSON.stringify(semifinalTotals, null, 2));
  }

  if (onlySemifinals) return;

  const poolReports: PoolReport[] = [];
  const allParticipantAudits: TopologyParticipantAudit[] = [];
  let participantsScanned = 0;

  for (const pool of pools) {
    console.log(`=== ${pool.name} (${pool.id}) ===`);
    const report = await auditPool(
      pool,
      tournamentMatches,
      teams,
      stageByCode,
      groupMap,
    );
    poolReports.push(report);
    participantsScanned += report.participantsScanned;

    for (const p of report.participants) {
      allParticipantAudits.push({
        stalePicks: p.stalePicks,
        missingPicks: p.missingPicks,
        notes: p.notes,
      });
    }

    console.log(`Participants scanned: ${report.participantsScanned}`);
    console.log(`With stale topology picks: ${report.participantsWithStalePicks}`);
    console.log(
      `With only missing downstream picks: ${report.participantsWithOnlyMissingDownstream}`,
    );

    for (const p of report.participants.filter((x) => x.stalePicks.length > 0)) {
      console.log(
        `  ${p.displayName}${p.email ? ` <${p.email}>` : ""} — ${p.stalePicks.length} stale`,
      );
      for (const stale of p.stalePicks.slice(0, 4)) {
        console.log(
          `    [${stale.rowState}] ${stale.displayLabel}: ${stale.savedTeamName} — ${stale.reason}`,
        );
      }
      if (p.stalePicks.length > 4) {
        console.log(`    … +${p.stalePicks.length - 4} more`);
      }
    }
  }

  const totals = summarizeTopologyAuditTotals({
    poolsScanned: poolReports.length,
    participantsScanned,
    participantAudits: allParticipantAudits,
  });

  const output = {
    generatedAt: new Date().toISOString(),
    mode: "read_only_audit" as const,
    topology: CORRECTED_TOPOLOGY,
    semifinalWinnerSlotNote: TOPOLOGY_STALE_FINALIST_SLOTS_EXPLANATION,
    totals: {
      poolsScanned: poolReports.length,
      participantsScanned,
      ...totals,
      labels: {
        staleFinalistPicks: "Stale semifinal-winner/finalist picks",
        staleChampionPicks: "Stale champion picks",
        missingSemifinalWinnerPicks: "Missing semifinal-winner picks",
        missingChampionPicks: "Missing champion picks",
      },
    },
    pools: poolReports,
  };

  const topologyJsonPath = includeSemifinals
    ? "/tmp/knockout-topology-stale-picks-audit.json"
    : reportJsonPath;
  writeFileSync(topologyJsonPath, JSON.stringify(output, null, 2) + "\n");
  console.log(`\nWrote ${topologyJsonPath}`);
  console.log("\n=== TOPOLOGY STALE PICK TOTALS ===");
  console.log(
    formatTopologyAuditTotalsForConsole({
      poolsScanned: poolReports.length,
      participantsScanned,
      ...totals,
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
