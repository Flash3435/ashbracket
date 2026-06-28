#!/usr/bin/env tsx
/**
 * One-time repair for knockout progression picks saved under the pre-fix
 * sequential bracket UI. Validates against FIFA's official M89–M104 path.
 *
 * Usage:
 *   npx tsx scripts/repair-knockout-bracket-path-picks.ts <poolId> [--participant name]
 *   npx tsx scripts/repair-knockout-bracket-path-picks.ts --all-pools
 *   Add --apply to persist clears (default is dry run).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { mapTeamRow, mapTournamentStageRow } from "../lib/results/mapRows";
import { TEAM_TABLE_SELECT } from "../lib/teams/teamDbSelect";
import { fetchGroupTeamCountryCodesByLetter } from "../lib/tournament/fetchGroupTeamCountryCodesByLetter";
import { mapPredictionRow } from "../src/lib/scoring/mapSupabaseRows";
import type { TournamentStage } from "../src/types/domain";
import {
  buildAllParticipantPickDrafts,
  participantBonusKeysForPool,
} from "../lib/predictions/buildParticipantPickDrafts";
import {
  isKnockoutProgressionKind,
  type KnockoutProgressionPredictionKind,
} from "../lib/predictions/knockoutProgressionKinds";
import {
  participantNeedsKnockoutPathReview,
  pruneOfficialKnockoutPathPicks,
  summarizeKnockoutPathRepair,
} from "../lib/predictions/pruneOfficialKnockoutPathPicks";

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
const poolArg = args.find((a) => !a.startsWith("--"))?.trim();
const participantIdx = args.indexOf("--participant");
const participantFilter =
  participantIdx >= 0 ? args[participantIdx + 1]?.trim().toLowerCase() : "";

if (!allPools && !poolArg) {
  console.error(
    "Usage: npx tsx scripts/repair-knockout-bracket-path-picks.ts <poolId> [--participant name] [--apply]\n" +
      "   or: npx tsx scripts/repair-knockout-bracket-path-picks.ts --all-pools [--apply]",
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

type RepairAction = {
  participantId: string;
  participantName: string;
  poolId: string;
  predictionKind: KnockoutProgressionPredictionKind;
  slotKey: string | null;
  tournamentStageId: string;
  teamId: string;
  reason: string;
};

async function loadPoolIds(): Promise<string[]> {
  if (poolArg) return [poolArg];
  const { data, error } = await supabase
    .from("pools")
    .select("id")
    .is("archived_at", null);
  if (error) throw error;
  return (data ?? []).map((r) => r.id);
}

async function repairPool(poolId: string): Promise<RepairAction[]> {
  const [
    { data: participants, error: partErr },
    { data: stageRows, error: stageErr },
    { data: teamRows, error: teamErr },
    { data: predRows, error: predErr },
    { data: scoringRows, error: scoreErr },
    groupMap,
  ] = await Promise.all([
    supabase
      .from("participants")
      .select("id, display_name")
      .eq("pool_id", poolId),
    supabase
      .from("tournament_stages")
      .select("id, code, label, sort_order, starts_at, ends_at, created_at, updated_at")
      .in("code", [...STAGE_CODES]),
    supabase.from("teams").select(TEAM_TABLE_SELECT),
    supabase
      .from("predictions")
      .select(
        "id, pool_id, participant_id, prediction_kind, team_id, tournament_stage_id, group_code, slot_key, bonus_key, value_text, created_at, updated_at",
      )
      .eq("pool_id", poolId),
    supabase
      .from("scoring_rules")
      .select("bonus_key")
      .eq("pool_id", poolId),
    fetchGroupTeamCountryCodesByLetter(supabase),
  ]);

  if (partErr) throw partErr;
  if (stageErr) throw stageErr;
  if (teamErr) throw teamErr;
  if (predErr) throw predErr;
  if (scoreErr) throw scoreErr;

  const stageByCode: Partial<Record<TournamentStage["code"], TournamentStage>> =
    {};
  for (const row of stageRows ?? []) {
    const stage = mapTournamentStageRow(
      row as Parameters<typeof mapTournamentStageRow>[0],
    );
    stageByCode[stage.code] = stage;
  }

  const bonusKeys = participantBonusKeysForPool(
    (scoringRows ?? []).map((r) => String(r.bonus_key ?? "")),
  );
  const teams = (teamRows ?? []).map(mapTeamRow);
  const predictions = (predRows ?? []).map((r) =>
    mapPredictionRow(r as Parameters<typeof mapPredictionRow>[0]),
  );

  const actions: RepairAction[] = [];

  for (const participant of participants ?? []) {
    if (participantFilter) {
      const name = String(participant.display_name ?? "").toLowerCase();
      if (!name.includes(participantFilter)) continue;
    }

    const participantPredictions = predictions.filter(
      (p) => p.participantId === participant.id,
    );
    const before = buildAllParticipantPickDrafts({
      stageByCode,
      predictions: participantPredictions,
      participantId: participant.id,
      bonusKeys,
      teams,
      groupTeamCountryCodesByLetter: groupMap,
    });

    const hadProgression = before.some(
      (s) => isKnockoutProgressionKind(s.predictionKind) && s.teamId.trim(),
    );
    if (!hadProgression) continue;

    const pathResult = pruneOfficialKnockoutPathPicks(before);
    if (pathResult.cleared.length === 0) continue;

    for (const cleared of pathResult.cleared) {
      const row = before.find((s) => s.rowKey === cleared.rowKey);
      if (!row) continue;
      actions.push({
        participantId: participant.id,
        participantName: String(participant.display_name ?? participant.id),
        poolId,
        predictionKind: cleared.predictionKind,
        slotKey: cleared.slotKey,
        tournamentStageId: row.tournamentStageId,
        teamId: cleared.teamId,
        reason: cleared.reason,
      });
    }
  }

  return actions;
}

async function applyActions(actions: RepairAction[]): Promise<void> {
  for (const action of actions) {
    let query = supabase
      .from("predictions")
      .delete()
      .eq("pool_id", action.poolId)
      .eq("participant_id", action.participantId)
      .eq("prediction_kind", action.predictionKind)
      .eq("tournament_stage_id", action.tournamentStageId)
      .is("group_code", null)
      .is("bonus_key", null);

    query =
      action.slotKey === null
        ? query.is("slot_key", null)
        : query.eq("slot_key", action.slotKey);

    const { error } = await query;
    if (error) {
      console.error(
        `Failed to clear ${action.participantName} ${action.predictionKind}:`,
        error.message,
      );
      process.exit(1);
    }
  }
}

async function main() {
  const poolIds = await loadPoolIds();
  const allActions: RepairAction[] = [];

  for (const poolId of poolIds) {
    const actions = await repairPool(poolId);
    allActions.push(...actions);
  }

  const affectedParticipants = new Set(allActions.map((a) => a.participantId));
  const summary = summarizeKnockoutPathRepair(
    allActions.map((a) => ({
      predictionKind: a.predictionKind,
      slotKey: a.slotKey,
      rowKey: `${a.predictionKind}|${a.slotKey ?? ""}`,
      teamId: a.teamId,
      reason: a.reason as "not_in_official_matchup",
    })),
  );

  console.log(`Pools scanned: ${poolIds.length}`);
  console.log(`Participants affected: ${affectedParticipants.size}`);
  console.log(`Rows to clear: ${allActions.length}`);
  console.log("Cleared by prediction kind:");
  for (const [kind, count] of Object.entries(summary.clearedByKind)) {
    console.log(`  ${kind}: ${count}`);
  }

  const needsReview = new Set<string>();
  for (const poolId of poolIds) {
    const { data: participants } = await supabase
      .from("participants")
      .select("id, display_name")
      .eq("pool_id", poolId);
    for (const participant of participants ?? []) {
      const participantActions = allActions.filter(
        (a) => a.participantId === participant.id,
      );
      if (
        participantNeedsKnockoutPathReview(
          participantActions.map((a) => ({
            predictionKind: a.predictionKind,
            slotKey: a.slotKey,
            rowKey: `${a.predictionKind}|${a.slotKey ?? ""}`,
            teamId: a.teamId,
            reason: a.reason as "not_in_official_matchup",
          })),
        )
      ) {
        needsReview.add(participant.id);
      }
    }
  }
  console.log(
    `Participants needing Round of 16+ review: ${needsReview.size}`,
  );

  for (const action of allActions) {
    console.log(
      `  ${action.participantName}: clear ${action.predictionKind}` +
        (action.slotKey ? ` slot ${action.slotKey}` : "") +
        ` (${action.teamId}) — ${action.reason}`,
    );
  }

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to clear invalid rows.");
    return;
  }

  if (allActions.length === 0) {
    console.log("Nothing to apply.");
    return;
  }

  await applyActions(allActions);
  console.log(`Applied ${allActions.length} clear(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
