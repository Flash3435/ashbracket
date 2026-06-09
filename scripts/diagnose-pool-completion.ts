#!/usr/bin/env tsx
/**
 * Pool pick completion diagnostic (production-safe read-only).
 *
 * Usage:
 *   npx tsx scripts/diagnose-pool-completion.ts <poolId> [participant names...]
 *   npx tsx scripts/diagnose-pool-completion.ts --pool-name "work" BeeGee Alicia
 *   npx tsx scripts/diagnose-pool-completion.ts <poolId> --compare-complete
 *
 * Requires `.env.local` with Supabase service role (or anon with sufficient RLS).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildCompletionStatusForParticipant,
  loadPicksCompletenessInputsForPool,
} from "../lib/communications/picksCompleteness";
import {
  buildParticipantCompletionDiagnostic,
  savedPredictionKey,
} from "../lib/predictions/participantPickDiagnostics";
import { participantBonusKeysForPool } from "../lib/predictions/buildParticipantPickDrafts";
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

const args = process.argv.slice(2);
let poolId = "";
let poolNameFilter = "";
let compareComplete = false;
const nameFilters: string[] = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (a === "--pool-name" && args[i + 1]) {
    poolNameFilter = args[++i]!.trim().toLowerCase();
    continue;
  }
  if (a === "--compare-complete") {
    compareComplete = true;
    continue;
  }
  if (!poolId && !a.startsWith("--")) {
    poolId = a.trim();
    continue;
  }
  if (!a.startsWith("--")) {
    nameFilters.push(a.trim().toLowerCase());
  }
}

if (!poolId && !poolNameFilter) {
  console.error(
    "Usage: npx tsx scripts/diagnose-pool-completion.ts <poolId> [names...]\n" +
      "   or: npx tsx scripts/diagnose-pool-completion.ts --pool-name <substring> [names...]",
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

async function resolvePoolId(): Promise<{
  poolId: string;
  poolName: string;
}> {
  if (poolId) {
    const { data, error } = await supabase
      .from("pools")
      .select("id, name")
      .eq("id", poolId)
      .maybeSingle();
    if (error || !data) {
      console.error("Pool not found:", poolId, error?.message ?? "");
      process.exit(1);
    }
    return { poolId: data.id as string, poolName: String(data.name ?? "") };
  }

  const { data, error } = await supabase
    .from("pools")
    .select("id, name")
    .ilike("name", `%${poolNameFilter}%`)
    .order("name", { ascending: true });

  if (error) {
    console.error("Pool lookup failed:", error.message);
    process.exit(1);
  }
  const matches = data ?? [];
  if (matches.length === 0) {
    console.error(`No pool name matching "${poolNameFilter}".`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error("Multiple pools matched; pass an explicit poolId:");
    for (const row of matches) {
      console.error(`  ${row.id}  ${row.name}`);
    }
    process.exit(1);
  }
  return {
    poolId: matches[0]!.id as string,
    poolName: String(matches[0]!.name ?? ""),
  };
}

function printParticipantDiagnostic(
  diag: ReturnType<typeof buildParticipantCompletionDiagnostic>,
  preds: Prediction[],
): void {
  const { membership, canonicalStatus } = diag;
  console.log(`\n=== ${membership.displayName ?? "Unnamed"} ===`);
  console.log("Membership ID:", membership.id);
  console.log("User ID:", membership.userId ?? "(none)");
  console.log(
    "picks_first_submitted_at:",
    membership.picksFirstSubmittedAt ?? "(null)",
  );
  console.log("Canonical complete:", canonicalStatus.isComplete);
  console.log("Legacy complete (pre-helper):", diag.legacyComplete);
  console.log("Possible key mismatch:", diag.possibleKeyMismatch);
  console.log("Display summary:", canonicalStatus.displaySummary);
  console.log(
    "Missing pick keys:",
    diag.missingKeys.join(", ") || "(none)",
  );
  for (const section of canonicalStatus.sections) {
    console.log(
      `  ${section.label}: ${section.filled}/${section.total}` +
        (section.required ? "" : " (not required)"),
    );
  }
  console.log("Saved predictions by kind:");
  for (const [kind, count] of Object.entries(diag.savedByKind).sort()) {
    console.log(`  ${kind}: ${count}`);
  }
  console.log("Raw prediction rows (with team):", diag.savedKeys.length);
  console.log("Required bonus keys (canonical):", diag.canonicalStatus.sections.find((s) => s.id === "bonus")?.total ?? "—");
  console.log("Required bonus keys (legacy):", diag.legacyBonusKeys.join(", "));
  if (diag.orphanedSavedCount > 0) {
    console.log(
      `Orphaned saved rows (not hydrated into drafts): ${diag.orphanedSavedCount}`,
    );
    const pid = membership.id;
    const orphaned = preds.filter(
      (p) =>
        p.participantId === pid &&
        p.teamId?.trim() &&
        !diag.savedKeys.some((sk) => {
          const rowKey = savedPredictionKey(p);
          return sk === rowKey;
        }),
    );
    if (process.env.DIAGNOSE_VERBOSE === "1") {
      for (const p of orphaned.slice(0, 20)) {
        console.log("  ", savedPredictionKey(p), "team:", p.teamId);
      }
    }
  }
  if (diag.nearMatchHints.length > 0) {
    console.log("Near-matches for missing keys:");
    for (const hint of diag.nearMatchHints) {
      console.log(
        `  missing ${hint.missingKey} ↔ saved ${hint.savedKey} (${hint.reason})`,
      );
    }
  }
  if (process.env.DIAGNOSE_VERBOSE === "1") {
    console.log("Saved keys:");
    for (const k of diag.savedKeys) console.log(`  ${k}`);
    console.log("Expected draft keys (empty marked with *):");
    const filled = new Set(
      diag.expectedKeys.filter((k) => !diag.missingKeys.includes(k)),
    );
    for (const k of diag.expectedKeys) {
      console.log(`  ${filled.has(k) ? " " : "*"} ${k}`);
    }
  }
}

async function main() {
  const pool = await resolvePoolId();
  poolId = pool.poolId;

  const { data: participants, error: parErr } = await supabase
    .from("participants")
    .select("id, display_name, user_id, pool_id, picks_first_submitted_at")
    .eq("pool_id", poolId)
    .order("display_name", { ascending: true });

  if (parErr) {
    console.error("participants query failed:", parErr.message);
    process.exit(1);
  }

  let rows = participants ?? [];
  if (nameFilters.length > 0) {
    rows = rows.filter((p) => {
      const name = String(p.display_name ?? "").toLowerCase();
      return nameFilters.some((f) => name.includes(f));
    });
  }

  if (compareComplete && rows.length === nameFilters.length && nameFilters.length > 0) {
    const complete = (participants ?? []).find((p) => {
      const name = String(p.display_name ?? "").toLowerCase();
      return !nameFilters.some((f) => name.includes(f));
    });
    if (complete) {
      rows = [...rows, complete];
      console.log(
        "Compare participant:",
        complete.display_name,
        `(${complete.id})`,
      );
    }
  } else if (compareComplete && rows.length > 0) {
    const { data: ruleRows } = await supabase
      .from("scoring_rules")
      .select("bonus_key")
      .eq("pool_id", poolId)
      .eq("prediction_kind", "bonus_pick");
    const inputsProbe = await loadPicksCompletenessInputsForPool(
      supabase,
      poolId,
      rows.map((r) => r.id as string),
    );
    if (inputsProbe) {
      const fromDb = (ruleRows ?? [])
        .map((r) => r.bonus_key as string | null)
        .filter((k): k is string => Boolean(k && k.trim()));
      const bonusKeys = participantBonusKeysForPool(fromDb);
      const completeRow = (participants ?? []).find((p) => {
        const status = buildCompletionStatusForParticipant(
          inputsProbe,
          p.id as string,
        );
        return status.isComplete;
      });
      if (
        completeRow &&
        !rows.some((r) => r.id === completeRow.id)
      ) {
        rows.push(completeRow);
        console.log(
          "Compare participant (first complete in pool):",
          completeRow.display_name,
        );
      }
    }
  }

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

  const { data: ruleRows } = await supabase
    .from("scoring_rules")
    .select("bonus_key")
    .eq("pool_id", poolId)
    .eq("prediction_kind", "bonus_pick")
    .order("bonus_key", { ascending: true });
  const scoringRuleBonusKeys = (ruleRows ?? [])
    .map((r) => r.bonus_key as string | null)
    .filter((k): k is string => Boolean(k && k.trim()));

  console.log("Pool:", poolId);
  console.log("Pool name:", pool.poolName);
  console.log("Knockout bracket unlocked:", inputs.knockoutBracketPicksUnlocked);
  console.log("Bonus keys required:", inputs.bonusKeys.join(", "));
  console.log("Scoring rule bonus keys:", scoringRuleBonusKeys.join(", ") || "(none)");
  console.log("---");

  for (const row of rows) {
    const diag = buildParticipantCompletionDiagnostic({
      membership: {
        id: row.id as string,
        displayName: (row.display_name as string | null) ?? null,
        userId: (row.user_id as string | null) ?? null,
        picksFirstSubmittedAt:
          (row.picks_first_submitted_at as string | null) ?? null,
      },
      stageByCode: inputs.stageByCode,
      predictions: inputs.predictions,
      scoringRuleBonusKeys,
      bonusKeys: inputs.bonusKeys,
      teams: inputs.teams,
      groupTeamCountryCodesByLetter: inputs.groupTeamCountryCodesByLetter,
      knockoutBracketPicksUnlocked: inputs.knockoutBracketPicksUnlocked,
    });
    const preds = inputs.predictions.filter(
      (p) => p.participantId === (row.id as string),
    );
    printParticipantDiagnostic(diag, preds);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
