#!/usr/bin/env tsx
/**
 * Audit locked knockout rows (M89–M96 R16 winners) comparing raw DB picks vs display state.
 *
 * Usage:
 *   npx tsx scripts/audit-locked-knockout-picks.ts --all-pools
 *   npx tsx scripts/audit-locked-knockout-picks.ts <poolId> [--participant name]
 *   Add --report-json path/to/report.json
 *   Add --report-csv path/to/report.csv
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildAdminKnockoutParticipantStatus,
} from "../lib/admin/adminKnockoutPickStatus";
import { mapTeamRow, mapTournamentStageRow } from "../lib/results/mapRows";
import { TEAM_TABLE_SELECT } from "../lib/teams/teamDbSelect";
import { fetchGroupTeamCountryCodesByLetter } from "../lib/tournament/fetchGroupTeamCountryCodesByLetter";
import {
  buildAllParticipantPickDrafts,
  participantBonusKeysForPool,
} from "../lib/predictions/buildParticipantPickDrafts";
import { applyKnockoutPathInvalidation } from "../lib/predictions/knockoutPathInvalidation";
import { pruneParticipantPicks } from "../lib/predictions/knockoutPickConsistency";
import { pruneOfficialKnockoutPathPicks } from "../lib/predictions/pruneOfficialKnockoutPathPicks";
import {
  buildKnockoutMatchPickRows,
  knockoutMatchSavedPickPresentation,
  mergeKnockoutMatchRowSavedPickFromSlots,
  type ConfirmedR32WinnerContext,
} from "../lib/picks/knockoutMatchPickRows";
import { getGradualKnockoutSelectionState } from "../lib/picks/gradualKnockoutUnlock";
import { pickStatusFromPrediction } from "../lib/predictions/knockoutPickStatus";
import { mapPredictionRow } from "../src/lib/scoring/mapSupabaseRows";
import type { Prediction, Team } from "../src/types/domain";
import type { KnockoutPickSlotDraft } from "../types/adminKnockoutPicks";
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
const poolArg = args.find((a) => !a.startsWith("--"))?.trim();
const participantIdx = args.indexOf("--participant");
const participantFilter =
  participantIdx >= 0 ? args[participantIdx + 1]?.trim().toLowerCase() : "";
const reportJsonIdx = args.indexOf("--report-json");
const reportJsonPath =
  reportJsonIdx >= 0 ? args[reportJsonIdx + 1]?.trim() : "";
const reportCsvIdx = args.indexOf("--report-csv");
const reportCsvPath = reportCsvIdx >= 0 ? args[reportCsvIdx + 1]?.trim() : "";

if (!allPools && !poolArg) {
  console.error(
    "Usage: npx tsx scripts/audit-locked-knockout-picks.ts <poolId> [--participant name]\n" +
      "   or: npx tsx scripts/audit-locked-knockout-picks.ts --all-pools",
  );
  process.exit(1);
}

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

type AuditRow = {
  poolId: string;
  poolName: string;
  participantId: string;
  participantName: string;
  completionStatus: string;
  lockedMissingCount: number;
  fifaMatchNo: number;
  matchCode: string;
  matchup: string | null;
  lockReason: string;
  rawDbTeamId: string | null;
  rawDbTeamName: string | null;
  rawDbPickStatus: string | null;
  rawDbValueText: string | null;
  initialSlotTeamId: string | null;
  normalizedSlotTeamId: string | null;
  displaySlotTeamId: string | null;
  displayedSavedPick: string;
  displayedSavedPickStatus: string;
  flags: string[];
};

function teamName(teamId: string | null, teams: Team[]): string | null {
  if (!teamId?.trim()) return null;
  return teams.find((t) => t.id === teamId.trim())?.name?.trim() ?? teamId;
}

function buildR32WinnerContext(
  teams: Team[],
  tournamentMatches: TournamentMatchPublicRow[] | null,
  knockoutBracketPicksUnlocked: boolean,
): ConfirmedR32WinnerContext {
  const gradual = getGradualKnockoutSelectionState({
    matches: tournamentMatches,
    teams,
    fullRoundOf32Official: knockoutBracketPicksUnlocked,
  });
  return {
    teams,
    tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked,
  };
}

function mirrorWizardSlotStates(input: {
  initialSlots: KnockoutPickSlotDraft[];
  teams: Team[];
  tournamentMatches: TournamentMatchPublicRow[] | null;
  knockoutBracketPicksUnlocked: boolean;
  knockoutPicksAccessible: boolean;
}): {
  normalizedInitialSlots: KnockoutPickSlotDraft[];
  knockoutDisplaySlots: KnockoutPickSlotDraft[];
  pathRepairCleared: ReturnType<typeof pruneOfficialKnockoutPathPicks>["cleared"];
  slotsAfterInvalidation: KnockoutPickSlotDraft[];
} {
  const r32WinnerContext = buildR32WinnerContext(
    input.teams,
    input.tournamentMatches,
    input.knockoutBracketPicksUnlocked,
  );
  const pruned = pruneOfficialKnockoutPathPicks(input.initialSlots, r32WinnerContext);
  const afterInvalidation = applyKnockoutPathInvalidation(
    pruned.slots,
    pruned.cleared,
    {
      teams: input.teams,
      tournamentMatches: input.tournamentMatches,
      knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
    },
  );
  const normalizedInitialSlots = pruneParticipantPicks(afterInvalidation, {
    freezeKnockoutProgressionPicks: !input.knockoutPicksAccessible,
    r32WinnerContext,
  });
  const knockoutDisplaySlots = input.knockoutPicksAccessible
    ? pruneParticipantPicks(afterInvalidation, { r32WinnerContext })
    : afterInvalidation;
  return {
    normalizedInitialSlots,
    knockoutDisplaySlots,
    pathRepairCleared: pruned.cleared,
    slotsAfterInvalidation: afterInvalidation,
  };
}

function slotTeamId(
  slots: KnockoutPickSlotDraft[],
  kind: string,
  slotKey: string,
): string | null {
  const id = slots.find(
    (s) => s.predictionKind === kind && s.slotKey === slotKey,
  )?.teamId?.trim();
  return id || null;
}

function rawDbQuarterfinalistPick(
  predictions: Prediction[],
  participantId: string,
  quarterfinalStageId: string,
  slotKey: string,
): Prediction | undefined {
  return predictions.find(
    (p) =>
      p.participantId === participantId &&
      p.predictionKind === "quarterfinalist" &&
      p.tournamentStageId === quarterfinalStageId &&
      p.slotKey === slotKey &&
      p.groupCode === null &&
      p.bonusKey === null,
  );
}

async function loadTournamentMatches(): Promise<TournamentMatchPublicRow[]> {
  const { data, error } = await supabase.from("tournament_public_matches").select(
    [
      "match_id",
      "edition_id",
      "edition_code",
      "stage_code",
      "match_code",
      "kickoff_at",
      "status",
      "home_country_code",
      "away_country_code",
      "home_goals",
      "away_goals",
      "winner_country_code",
      "home_team_name",
      "away_team_name",
      "winner_team_name",
    ].join(", "),
  );
  if (error) throw error;
  return (data ?? []) as unknown as TournamentMatchPublicRow[];
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
    .order("name");
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; name: string }>;
}

async function auditPool(pool: { id: string; name: string }): Promise<AuditRow[]> {
  const { data: participantRows, error: pErr } = await supabase
    .from("participants")
    .select("id, display_name")
    .eq("pool_id", pool.id)
    .order("display_name");
  if (pErr) throw pErr;

  const participants = (participantRows ?? []) as Array<{
    id: string;
    display_name: string;
  }>;
  const filtered = participantFilter
    ? participants.filter((p) =>
        p.display_name.toLowerCase().includes(participantFilter),
      )
    : participants;

  const [stagesRes, teamsRes, predsRes, bonusRes, groupMap, tournamentMatches] =
    await Promise.all([
      supabase.from("tournament_stages").select("*"),
      supabase.from("teams").select(TEAM_TABLE_SELECT),
      supabase
        .from("predictions")
        .select("*")
        .eq("pool_id", pool.id),
      supabase.from("pool_bonus_picks").select("bonus_key").eq("pool_id", pool.id),
      fetchGroupTeamCountryCodesByLetter(supabase),
      loadTournamentMatches(),
    ]);

  if (stagesRes.error) throw stagesRes.error;
  if (teamsRes.error) throw teamsRes.error;
  if (predsRes.error) throw predsRes.error;

  const stages = (stagesRes.data ?? []).map(mapTournamentStageRow);
  const stageByCode = Object.fromEntries(
    stages.map((s) => [s.code, s]),
  ) as Partial<Record<string, (typeof stages)[number]>>;
  const teams = (teamsRes.data ?? []).map(mapTeamRow);
  const predictions = (predsRes.data ?? []).map(mapPredictionRow);
  const bonusKeys = participantBonusKeysForPool(
    (bonusRes.data ?? []).map((r) => String(r.bonus_key ?? "")),
  );
  const knockoutBracketPicksUnlocked = true;
  const quarterfinalStage = stageByCode.quarterfinal;
  if (!quarterfinalStage) return [];

  const rows: AuditRow[] = [];

  for (const participant of filtered) {
    const initialSlots = buildAllParticipantPickDrafts({
      stageByCode,
      predictions,
      participantId: participant.id,
      bonusKeys,
      teams,
      groupTeamCountryCodesByLetter: groupMap,
    });

    const { normalizedInitialSlots, knockoutDisplaySlots, pathRepairCleared, slotsAfterInvalidation } =
      mirrorWizardSlotStates({
        initialSlots,
        teams,
        tournamentMatches,
        knockoutBracketPicksUnlocked,
        knockoutPicksAccessible: true,
      });

    const adminStatus = buildAdminKnockoutParticipantStatus(
      participant.id,
      participant.display_name,
      initialSlots,
      {
        slots: initialSlots,
        teams,
        tournamentMatches,
        officialRoundOf32Complete: knockoutBracketPicksUnlocked,
      },
      { teams },
    );

    const matchRows = buildKnockoutMatchPickRows({
      bracketKind: "round_of_16",
      slots: knockoutDisplaySlots,
      teams,
      tournamentMatches,
      gradual: getGradualKnockoutSelectionState({
        matches: tournamentMatches,
        teams,
        fullRoundOf32Official: knockoutBracketPicksUnlocked,
      }),
      knockoutBracketPicksUnlocked,
    });

    for (const matchRow of matchRows) {
      if (matchRow.lockReason !== "frozen" && matchRow.lockReason !== "started") {
        continue;
      }

      const slotKey = matchRow.saveSlotKey?.trim();
      if (!slotKey) continue;

      const rawPred = rawDbQuarterfinalistPick(
        predictions,
        participant.id,
        quarterfinalStage.id,
        slotKey,
      );
      const presentation = knockoutMatchSavedPickPresentation(
        mergeKnockoutMatchRowSavedPickFromSlots(
          matchRow,
          slotsAfterInvalidation,
        ),
        teams,
      );
      const flags: string[] = [];

      const rawDbTeamId = rawPred?.teamId?.trim() || null;
      const initialTeamId = slotTeamId(initialSlots, "quarterfinalist", slotKey);
      const normalizedTeamId = slotTeamId(
        normalizedInitialSlots,
        "quarterfinalist",
        slotKey,
      );
      const displayTeamId = slotTeamId(
        knockoutDisplaySlots,
        "quarterfinalist",
        slotKey,
      );

      if (
        adminStatus.status === "complete" &&
        presentation.savedPickStatus === "missing"
      ) {
        flags.push("completed_participant_locked_no_pick");
      }
      if (rawDbTeamId && presentation.savedPickStatus === "missing") {
        flags.push("raw_db_has_pick_display_missing");
      }
      if (rawDbTeamId && !displayTeamId) {
        flags.push("display_prune_cleared_raw_pick");
      }
      if (initialTeamId && !normalizedTeamId) {
        flags.push("path_repair_cleared_normalized");
      }
      if (normalizedTeamId && !displayTeamId) {
        flags.push("display_prune_cleared_normalized_pick");
      }
      if (rawDbTeamId && displayTeamId && rawDbTeamId !== displayTeamId) {
        flags.push("raw_differs_from_display");
      }
      if (
        pathRepairCleared.some(
          (c) =>
            c.predictionKind === "quarterfinalist" && c.slotKey === slotKey,
        ) &&
        (matchRow.lockReason === "frozen" || matchRow.lockReason === "started")
      ) {
        flags.push("path_repair_would_clear_locked_slot");
      }
      if (presentation.savedPickStatus === "stale") {
        flags.push("stale_pick_should_still_show");
      }
      if (presentation.savedPickStatus === "missing" && rawDbTeamId) {
        flags.push("data_or_display_loss");
      }

      rows.push({
        poolId: pool.id,
        poolName: pool.name,
        participantId: participant.id,
        participantName: participant.display_name,
        completionStatus: adminStatus.status,
        lockedMissingCount: adminStatus.lockedMissingCount,
        fifaMatchNo: matchRow.fifaMatchNo,
        matchCode: `M${matchRow.fifaMatchNo}`,
        matchup: presentation.matchupLine,
        lockReason: matchRow.lockReason,
        rawDbTeamId,
        rawDbTeamName: teamName(rawDbTeamId, teams),
        rawDbPickStatus: rawPred
          ? pickStatusFromPrediction(rawPred).pickStatus
          : null,
        rawDbValueText: rawPred?.valueText ?? null,
        initialSlotTeamId: initialTeamId,
        normalizedSlotTeamId: normalizedTeamId,
        displaySlotTeamId: displayTeamId,
        displayedSavedPick: presentation.savedPickSummaryLine,
        displayedSavedPickStatus: presentation.savedPickStatus,
        flags,
      });
    }
  }

  return rows;
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function writeCsv(path: string, rows: AuditRow[]): void {
  const headers = [
    "poolName",
    "participantName",
    "completionStatus",
    "matchCode",
    "matchup",
    "lockReason",
    "rawDbTeamName",
    "displayedSavedPick",
    "displayedSavedPickStatus",
    "initialSlotTeamId",
    "normalizedSlotTeamId",
    "displaySlotTeamId",
    "flags",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.poolName,
        r.participantName,
        r.completionStatus,
        r.matchCode,
        r.matchup ?? "",
        r.lockReason,
        r.rawDbTeamName ?? "",
        r.displayedSavedPick,
        r.displayedSavedPickStatus,
        r.initialSlotTeamId ?? "",
        r.normalizedSlotTeamId ?? "",
        r.displaySlotTeamId ?? "",
        r.flags.join("|"),
      ]
        .map((v) => csvEscape(String(v)))
        .join(","),
    ),
  ];
  writeFileSync(path, lines.join("\n") + "\n");
}

async function main(): Promise<void> {
  const pools = await loadPoolIds();
  const allRows: AuditRow[] = [];

  for (const pool of pools) {
    console.log(`\n=== Auditing pool: ${pool.name} (${pool.id}) ===`);
    const rows = await auditPool(pool);
    allRows.push(...rows);

    const flagged = rows.filter((r) => r.flags.length > 0);
    const lockedNoPick = rows.filter(
      (r) => r.displayedSavedPickStatus === "missing",
    );
    const completedLockedNoPick = rows.filter((r) =>
      r.flags.includes("completed_participant_locked_no_pick"),
    );
    const displayLoss = rows.filter((r) =>
      r.flags.includes("raw_db_has_pick_display_missing"),
    );

    console.log(`Locked rows audited: ${rows.length}`);
    console.log(`Locked rows showing No pick saved: ${lockedNoPick.length}`);
    console.log(`Flagged rows: ${flagged.length}`);
    console.log(
      `Completed participants with locked no-pick rows: ${completedLockedNoPick.length}`,
    );
    console.log(`Raw DB has pick but display missing: ${displayLoss.length}`);

    for (const r of flagged.slice(0, 30)) {
      console.log(
        `  ${r.participantName} ${r.matchCode} ${r.matchup ?? "?"} | raw=${r.rawDbTeamName ?? "—"} display=${r.displayedSavedPick} | ${r.flags.join(", ")}`,
      );
    }
    if (flagged.length > 30) {
      console.log(`  ... and ${flagged.length - 30} more flagged rows`);
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    poolCount: pools.length,
    lockedRowCount: allRows.length,
    flaggedRowCount: allRows.filter((r) => r.flags.length > 0).length,
    lockedNoPickCount: allRows.filter(
      (r) => r.displayedSavedPickStatus === "missing",
    ).length,
    rawDbHasPickDisplayMissing: allRows.filter((r) =>
      r.flags.includes("raw_db_has_pick_display_missing"),
    ).length,
    completedLockedNoPick: allRows.filter((r) =>
      r.flags.includes("completed_participant_locked_no_pick"),
    ).length,
    rows: allRows,
  };

  if (reportJsonPath) {
    writeFileSync(reportJsonPath, JSON.stringify(summary, null, 2) + "\n");
    console.log(`\nWrote JSON report: ${reportJsonPath}`);
  }
  if (reportCsvPath) {
    writeCsv(reportCsvPath, allRows);
    console.log(`Wrote CSV report: ${reportCsvPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
