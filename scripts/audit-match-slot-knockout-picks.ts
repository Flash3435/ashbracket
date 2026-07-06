#!/usr/bin/env tsx
/**
 * Dry-run audit: saved knockout picks marked out/stale where savedTeamId is still
 * present in the official match slot (likely strict-path false positives).
 *
 * Usage:
 *   npx tsx scripts/audit-match-slot-knockout-picks.ts --all-pools
 *   npx tsx scripts/audit-match-slot-knockout-picks.ts <poolId>
 *   Add --report-json /tmp/match-slot-pick-audit.json
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateMatchSlotSavedPick } from "../lib/picks/knockoutStrictBracketPath";
import {
  buildKnockoutMatchPickRows,
  knockoutMatchStepDef,
  type KnockoutWizardBracketKind,
} from "../lib/picks/knockoutMatchPickRows";
import { getGradualKnockoutSelectionState } from "../lib/picks/gradualKnockoutUnlock";
import { buildAllParticipantPickDrafts } from "../lib/predictions/buildParticipantPickDrafts";
import { pickStatusFromPrediction } from "../lib/predictions/knockoutPickStatus";
import { mapPredictionRow } from "../src/lib/scoring/mapSupabaseRows";
import type { Team } from "../src/types/domain";
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
const reportJsonIdx = args.indexOf("--report-json");
const reportJsonPath =
  reportJsonIdx >= 0
    ? args[reportJsonIdx + 1]?.trim()
    : "/tmp/match-slot-pick-audit.json";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

const WIZARD_KINDS: KnockoutWizardBracketKind[] = [
  "round_of_16",
  "quarterfinalist",
  "semifinalist",
  "finalist",
];

type Finding = {
  poolId: string;
  participantId: string;
  participantName: string;
  matchCode: string;
  predictionKind: string;
  slotKey: string | null;
  savedTeamId: string;
  savedTeamName: string | null;
  pickStatus: string | null;
  slotEvalStatus: string;
};

async function auditPool(poolId: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  const { data: participants } = await supabase
    .from("participants")
    .select("id, display_name")
    .eq("pool_id", poolId);
  if (!participants?.length) return findings;

  const { data: predsRaw } = await supabase
    .from("predictions")
    .select("*")
    .eq("pool_id", poolId);
  const predictions = (predsRaw ?? []).map(mapPredictionRow);

  const { data: teamsRaw } = await supabase.from("teams").select("*");
  const teams = (teamsRaw ?? []) as Team[];

  const { data: matchesRaw } = await supabase
    .from("tournament_matches_public")
    .select("*");
  const tournamentMatches = (matchesRaw ?? []) as TournamentMatchPublicRow[];

  const gradual = getGradualKnockoutSelectionState({
    matches: tournamentMatches,
    teams,
    fullRoundOf32Official: true,
  });

  const teamName = (id: string) =>
    teams.find((t) => t.id === id)?.name?.trim() ?? id;

  for (const participant of participants) {
    const participantPreds = predictions.filter(
      (p) => p.participantId === participant.id,
    );
    const slots = buildAllParticipantPickDrafts({
      stageByCode: {},
      teams,
      predictions: participantPreds,
      participantId: participant.id,
      bonusKeys: [],
      groupTeamCountryCodesByLetter: {},
    }).map((row) => {
      const pred = participantPreds.find(
        (p) =>
          p.predictionKind === row.predictionKind &&
          p.slotKey === row.slotKey,
      );
      const { pickStatus } = pred ? pickStatusFromPrediction(pred) : { pickStatus: null };
      return { ...row, pickStatus };
    });

    for (const wizardKind of WIZARD_KINDS) {
      const def = knockoutMatchStepDef(wizardKind);
      if (!def) continue;
      const rows = buildKnockoutMatchPickRows({
        bracketKind: wizardKind,
        slots,
        teams,
        tournamentMatches,
        gradual,
        knockoutBracketPicksUnlocked: true,
      });

      for (const row of rows) {
        if (!row.winnerTeamId.trim()) continue;
        const eval_ = evaluateMatchSlotSavedPick({
          wizardKind,
          matchIndex: row.matchIndex,
          slots,
          teams,
          tournamentMatches,
          gradual,
          knockoutBracketPicksUnlocked: true,
        });
        if (!eval_) continue;

        const markedOut =
          row.pickStatus === "out" ||
          (eval_.status === "live" && row.lockReason === "frozen" && eval_.savedTeamInOfficialMatchup);

        if (
          eval_.status === "live" &&
          eval_.savedTeamInOfficialMatchup &&
          (row.pickStatus === "out" || row.lockReason === "frozen")
        ) {
          findings.push({
            poolId,
            participantId: participant.id,
            participantName: participant.display_name,
            matchCode: `M${row.fifaMatchNo}`,
            predictionKind: row.savePredictionKind,
            slotKey: row.saveSlotKey,
            savedTeamId: row.winnerTeamId.trim(),
            savedTeamName: teamName(row.winnerTeamId.trim()),
            pickStatus: row.pickStatus,
            slotEvalStatus: eval_.status,
          });
        }
      }
    }
  }

  return findings;
}

async function main() {
  if (!allPools && !poolArg) {
    console.error(
      "Usage: npx tsx scripts/audit-match-slot-knockout-picks.ts <poolId> | --all-pools [--report-json path]",
    );
    process.exit(1);
  }

  let poolIds: string[] = [];
  if (allPools) {
    const { data } = await supabase.from("pools").select("id");
    poolIds = (data ?? []).map((r) => r.id as string);
  } else {
    poolIds = [poolArg!];
  }

  const allFindings: Finding[] = [];
  for (const poolId of poolIds) {
    const findings = await auditPool(poolId);
    allFindings.push(...findings);
    if (findings.length > 0) {
      console.log(`Pool ${poolId}: ${findings.length} likely false-positive out/frozen pick(s)`);
      for (const f of findings.slice(0, 25)) {
        console.log(
          `  ${f.participantName}: ${f.matchCode} saved ${f.savedTeamName} (pickStatus=${f.pickStatus ?? "active"})`,
        );
      }
    }
  }

  if (allFindings.length === 0) {
    console.log("No picks marked out/frozen while still live in official match slots.");
  } else {
    console.log(`\nTotal findings: ${allFindings.length}`);
  }

  writeFileSync(
    reportJsonPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), findings: allFindings },
      null,
      2,
    ),
  );
  console.log(`Wrote ${reportJsonPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
