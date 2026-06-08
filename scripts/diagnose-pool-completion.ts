#!/usr/bin/env tsx
/**
 * Local diagnostic for pool pick completion mismatches.
 *
 * Usage:
 *   npx tsx scripts/diagnose-pool-completion.ts <poolId> Sumitra Amanda Zach
 *
 * Requires `.env.local` with Supabase service role or anon + RLS-bypassing access.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ACCOUNT_TOURNAMENT_STAGE_CODES } from "../lib/account/loadAccountKnockoutSelection";
import {
  buildCompletionStatusForParticipant,
  loadPicksCompletenessInputsForPool,
} from "../lib/communications/picksCompleteness";
import { participantBonusKeysForPool } from "../lib/predictions/buildParticipantPickDrafts";
import { mapPredictionRow } from "../src/lib/scoring/mapSupabaseRows";
import { mapTournamentStageRow } from "../lib/results/mapRows";
import type { Prediction } from "../src/types/domain";

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

const poolId = process.argv[2]?.trim();
const nameFilters = process.argv.slice(3).map((n) => n.trim().toLowerCase());

if (!poolId) {
  console.error(
    "Usage: npx tsx scripts/diagnose-pool-completion.ts <poolId> [participant names...]",
  );
  process.exit(1);
}

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

if (!url || !key) {
  console.error("Missing Supabase URL/key in environment.");
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const { data: participants, error: parErr } = await supabase
    .from("participants")
    .select("id, display_name, user_id, pool_id, picks_first_submitted_at")
    .eq("pool_id", poolId)
    .order("display_name", { ascending: true });

  if (parErr) {
    console.error("participants query failed:", parErr.message);
    process.exit(1);
  }

  const rows = (participants ?? []).filter((p) => {
    if (nameFilters.length === 0) return true;
    const name = String(p.display_name ?? "").toLowerCase();
    return nameFilters.some((f) => name.includes(f));
  });

  if (rows.length === 0) {
    console.error("No matching participants.");
    process.exit(1);
  }

  const participantIds = rows.map((r) => r.id as string);
  const inputs = await loadPicksCompletenessInputsForPool(
    supabase,
    poolId,
    participantIds,
  );

  if (!inputs) {
    console.error("Failed to load completeness inputs.");
    process.exit(1);
  }

  console.log("Pool:", poolId);
  console.log("Knockout bracket unlocked:", inputs.knockoutBracketPicksUnlocked);
  console.log("Bonus keys required:", inputs.bonusKeys.join(", "));
  console.log("---");

  for (const row of rows) {
    const pid = row.id as string;
    const preds = inputs.predictions.filter((p) => p.participantId === pid);
    const status = buildCompletionStatusForParticipant(inputs, pid);

    console.log(`\n=== ${row.display_name ?? "Unnamed"} ===`);
    console.log("Membership ID:", pid);
    console.log("User ID:", row.user_id ?? "(none)");
    console.log("picks_first_submitted_at:", row.picks_first_submitted_at ?? "(null)");
    console.log("Admin-side complete:", status.isComplete);
    console.log("Participant-side complete (same helper):", status.isComplete);
    console.log("Display summary:", status.displaySummary);
    console.log("Missing pick keys:", status.missingPickKeys.join(", ") || "(none)");
    for (const section of status.sections) {
      console.log(
        `  ${section.label}: ${section.filled}/${section.total}` +
          (section.required ? "" : " (not required)"),
      );
    }
    console.log("Saved predictions by kind:");
    const byKind = new Map<string, number>();
    for (const p of preds) {
      if (!p.teamId?.trim()) continue;
      byKind.set(p.predictionKind, (byKind.get(p.predictionKind) ?? 0) + 1);
    }
    for (const [kind, count] of [...byKind.entries()].sort()) {
      console.log(`  ${kind}: ${count}`);
    }
    console.log("Raw prediction rows:", preds.length);
    if (process.env.DIAGNOSE_VERBOSE === "1") {
      console.log(JSON.stringify(preds, null, 2));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
