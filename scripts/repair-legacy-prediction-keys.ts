#!/usr/bin/env tsx
/**
 * Dry-run-first repair for third-place rows saved under the wrong group_code.
 * Inserts canonical group_code aliases by updating rows in place (never deletes).
 *
 * Usage:
 *   npx tsx scripts/repair-legacy-prediction-keys.ts <poolId> [--participant <name>]
 *   npx tsx scripts/repair-legacy-prediction-keys.ts <poolId> --apply
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { mapTeamRow } from "../lib/results/mapRows";
import { TEAM_TABLE_SELECT } from "../lib/teams/teamDbSelect";
import { buildTeamIdToGroupLetter } from "../lib/predictions/knockoutPickConsistency";
import { fetchGroupTeamCountryCodesByLetter } from "../lib/tournament/fetchGroupTeamCountryCodesByLetter";
import { mapPredictionRow } from "../src/lib/scoring/mapSupabaseRows";

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
const poolId = args.find((a) => !a.startsWith("--"))?.trim();
const apply = args.includes("--apply");
const participantIdx = args.indexOf("--participant");
const participantFilter =
  participantIdx >= 0 ? args[participantIdx + 1]?.trim().toLowerCase() : "";

if (!poolId) {
  console.error(
    "Usage: npx tsx scripts/repair-legacy-prediction-keys.ts <poolId> [--participant name] [--apply]",
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

type RepairAction = {
  predictionId: string;
  participantId: string;
  teamId: string;
  fromGroupCode: string | null;
  toGroupCode: string;
  slotKey: string | null;
};

async function main() {
  const [{ data: participants }, { data: teamRows }, groupMap, { data: predRows }] =
    await Promise.all([
      supabase
        .from("participants")
        .select("id, display_name")
        .eq("pool_id", poolId),
      supabase.from("teams").select(TEAM_TABLE_SELECT),
      fetchGroupTeamCountryCodesByLetter(supabase),
      supabase
        .from("predictions")
        .select(
          "id, pool_id, participant_id, prediction_kind, team_id, tournament_stage_id, group_code, slot_key, bonus_key, value_text, created_at, updated_at",
        )
        .eq("pool_id", poolId)
        .eq("prediction_kind", "third_place_qualifier"),
    ]);

  const teamIdToGroup = buildTeamIdToGroupLetter(
    (teamRows ?? []).map(mapTeamRow),
    groupMap,
  );

  const actions: RepairAction[] = [];
  for (const row of predRows ?? []) {
    const p = mapPredictionRow(
      row as Parameters<typeof mapPredictionRow>[0],
    );
    if (!p.teamId?.trim()) continue;
    if (participantFilter) {
      const par = (participants ?? []).find((x) => x.id === p.participantId);
      const name = String(par?.display_name ?? "").toLowerCase();
      if (!name.includes(participantFilter)) continue;
    }
    const inferred = teamIdToGroup.get(p.teamId.trim());
    if (!inferred) continue;
    const saved = (p.groupCode ?? "").trim().toUpperCase();
    if (saved === inferred) continue;
    if (saved && saved !== inferred) {
      actions.push({
        predictionId: p.id,
        participantId: p.participantId,
        teamId: p.teamId,
        fromGroupCode: p.groupCode,
        toGroupCode: inferred,
        slotKey: p.slotKey,
      });
    } else if (!saved && p.slotKey) {
      actions.push({
        predictionId: p.id,
        participantId: p.participantId,
        teamId: p.teamId,
        fromGroupCode: null,
        toGroupCode: inferred,
        slotKey: p.slotKey,
      });
    }
  }

  console.log(`Pool ${poolId}`);
  console.log(`Proposed repairs: ${actions.length}`);
  for (const a of actions) {
    const par = (participants ?? []).find((x) => x.id === a.participantId);
    console.log(
      `  ${par?.display_name ?? a.participantId}: prediction ${a.predictionId}` +
        ` group ${a.fromGroupCode ?? "(null)"} → ${a.toGroupCode}` +
        (a.slotKey ? ` (legacy slot_key ${a.slotKey})` : ""),
    );
  }

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to update rows.");
    return;
  }

  if (actions.length === 0) {
    console.log("Nothing to apply.");
    return;
  }

  for (const a of actions) {
    const { error } = await supabase
      .from("predictions")
      .update({
        group_code: a.toGroupCode,
        slot_key: null,
      })
      .eq("id", a.predictionId);
    if (error) {
      console.error(`Failed ${a.predictionId}:`, error.message);
      process.exit(1);
    }
  }
  console.log(`Applied ${actions.length} repair(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
