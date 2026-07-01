#!/usr/bin/env tsx
/**
 * Admin-only correction for a locked knockout match pick after kickoff.
 *
 * Usage:
 *   npx tsx scripts/admin-correct-knockout-pick.ts \
 *     --pool-id <uuid> \
 *     --participant-id <uuid> \
 *     --match-code M73 \
 *     --team-code CAN \
 *     --reason "Participant could not access account before kickoff; organizer-approved correction"
 *
 * Dry-run by default. Pass --apply to persist.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyKnockoutPickCorrection,
  resolveKnockoutPickCorrectionMatch,
  resolveKnockoutPickCorrectionTeamId,
  summarizeKnockoutPickCorrectionDryRun,
  summarizeKnockoutPickStatusAuditChanges,
  validateKnockoutPickCorrectionReason,
} from "../lib/admin/knockoutPickCorrection";
import { applyParticipantPickSlots } from "../lib/predictions/applyParticipantPickSlots";
import {
  buildAllParticipantPickDrafts,
  participantBonusKeysForPool,
} from "../lib/predictions/buildParticipantPickDrafts";
import { mapTeamRow, mapTournamentStageRow } from "../lib/results/mapRows";
import { TEAM_TABLE_SELECT } from "../lib/teams/teamDbSelect";
import { fetchGroupTeamCountryCodesByLetter } from "../lib/tournament/fetchGroupTeamCountryCodesByLetter";
import { fetchOfficialRoundOf32Complete } from "../lib/tournament/fetchOfficialRoundOf32Complete";
import { mapPredictionRow } from "../src/lib/scoring/mapSupabaseRows";
import type { TournamentStage } from "../src/types/domain";
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

function readArg(name: string): string {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return "";
  return process.argv[idx + 1]?.trim() ?? "";
}

const apply = process.argv.includes("--apply");
const poolId = readArg("--pool-id");
const participantId = readArg("--participant-id");
const matchCode = readArg("--match-code");
const teamId = readArg("--team-id");
const teamCode = readArg("--team-code");
const reason = readArg("--reason");

if (!poolId || !participantId || !matchCode || (!teamId && !teamCode) || !reason) {
  console.error(
    "Usage: npx tsx scripts/admin-correct-knockout-pick.ts \\\n" +
      "  --pool-id <uuid> --participant-id <uuid> --match-code M73 \\\n" +
      "  (--team-id <uuid> | --team-code CAN) --reason \"...\" [--apply]",
  );
  process.exit(1);
}

const reasonErr = validateKnockoutPickCorrectionReason(reason);
if (reasonErr) {
  console.error(reasonErr);
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

async function loadTournamentMatches(): Promise<TournamentMatchPublicRow[]> {
  const { data, error } = await supabase.from("tournament_public_matches").select(
    [
      "match_id",
      "edition_id",
      "edition_code",
      "match_code",
      "stage_code",
      "stage_label",
      "stage_sort_order",
      "group_code",
      "round_index",
      "kickoff_at",
      "status",
      "home_goals",
      "away_goals",
      "home_penalties",
      "away_penalties",
      "home_team_name",
      "home_country_code",
      "away_team_name",
      "away_country_code",
      "winner_team_name",
      "winner_country_code",
    ].join(", "),
  );
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TournamentMatchPublicRow[];
}

async function main(): Promise<void> {
  const { data: participant, error: parErr } = await supabase
    .from("participants")
    .select("id, display_name, pool_id")
    .eq("id", participantId)
    .eq("pool_id", poolId)
    .maybeSingle();
  if (parErr) throw new Error(parErr.message);
  if (!participant) {
    console.error("Participant not found in this pool.");
    process.exit(1);
  }

  const { data: poolRow, error: poolErr } = await supabase
    .from("pools")
    .select("tournament_edition_id")
    .eq("id", poolId)
    .maybeSingle();
  if (poolErr) throw new Error(poolErr.message);
  if (!poolRow?.tournament_edition_id) {
    console.error("Pool tournament edition is missing.");
    process.exit(1);
  }

  const [
    { data: teamRows, error: teamErr },
    { data: stageRows, error: stageErr },
    { data: predRows, error: predErr },
    { data: scoringRows, error: scoreErr },
    groupMap,
    tournamentMatches,
  ] = await Promise.all([
    supabase.from("teams").select(TEAM_TABLE_SELECT).order("name", {
      ascending: true,
    }),
    supabase
      .from("tournament_stages")
      .select("id, code, label, sort_order, starts_at, ends_at, created_at, updated_at")
      .in("code", [...STAGE_CODES])
      .order("sort_order", { ascending: true }),
    supabase
      .from("predictions")
      .select(
        "id, pool_id, participant_id, prediction_kind, team_id, tournament_stage_id, group_code, slot_key, bonus_key, value_text, created_at, updated_at",
      )
      .eq("pool_id", poolId)
      .eq("participant_id", participantId),
    supabase
      .from("scoring_rules")
      .select("bonus_key")
      .eq("pool_id", poolId)
      .eq("prediction_kind", "bonus_pick")
      .order("bonus_key", { ascending: true }),
    fetchGroupTeamCountryCodesByLetter(supabase),
    loadTournamentMatches(),
  ]);

  if (teamErr) throw new Error(teamErr.message);
  if (stageErr) throw new Error(stageErr.message);
  if (predErr) throw new Error(predErr.message);
  if (scoreErr) throw new Error(scoreErr.message);

  const teams = (teamRows ?? []).map(mapTeamRow);
  const stages = (stageRows ?? []).map(mapTournamentStageRow);
  type PredRow = Parameters<typeof mapPredictionRow>[0];
  const predictions = (predRows ?? []).map((r) =>
    mapPredictionRow(r as PredRow),
  );
  const bonusKeysOrdered = participantBonusKeysForPool(
    (scoringRows ?? [])
      .map((r) => r.bonus_key as string | null)
      .filter((k): k is string => Boolean(k && k.trim())),
  );
  const stageByCode = Object.fromEntries(
    stages.map((s) => [s.code, s]),
  ) as Partial<Record<TournamentStage["code"], TournamentStage>>;
  const slots = buildAllParticipantPickDrafts({
    stageByCode,
    predictions,
    participantId,
    bonusKeys: bonusKeysOrdered,
    teams,
    groupTeamCountryCodesByLetter: groupMap,
  });

  const r32Stage = stages.find((s) => s.code === "round_of_32");
  const fullRoundOf32Official = r32Stage
    ? await fetchOfficialRoundOf32Complete(
        supabase,
        r32Stage.id,
        poolRow.tournament_edition_id as string,
      )
    : true;

  const resolved = resolveKnockoutPickCorrectionMatch({
    matchCode,
    slots,
    teams,
    tournamentMatches,
    fullRoundOf32Official,
  });
  if ("error" in resolved) {
    console.error(resolved.error);
    process.exit(1);
  }

  const teamResolved = resolveKnockoutPickCorrectionTeamId({
    teamId,
    teamCode,
    teams,
    allowedTeamIds: resolved.match.allowedTeamIds,
  });
  if ("error" in teamResolved) {
    console.error(teamResolved.error);
    process.exit(1);
  }

  const applied = applyKnockoutPickCorrection({
    slots,
    match: resolved.match,
    newTeamId: teamResolved.teamId,
    teams,
    tournamentMatches,
    fullRoundOf32Official,
  });

  const summary = summarizeKnockoutPickCorrectionDryRun({
    match: resolved.match,
    newTeamId: teamResolved.teamId,
    teams,
    applyResult: applied,
  });

  console.log(`Participant: ${participant.display_name} (${participantId})`);
  console.log(`Pool: ${poolId}`);
  console.log(`Match: ${summary.matchCode}`);
  console.log(`Old pick: ${summary.oldTeamLabel}`);
  console.log(`New pick: ${summary.newTeamLabel}`);
  console.log(`Changed slots: ${applied.writePayloads.length}`);
  if (summary.clearedLabels.length > 0) {
    console.log("Downstream clears:");
    for (const line of summary.clearedLabels) {
      console.log(`  - ${line}`);
    }
  } else {
    console.log("Downstream clears: none");
  }

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to persist.");
    return;
  }

  const writeResult = await applyParticipantPickSlots(supabase, {
    poolId,
    participantId,
    slots: applied.writePayloads,
  });
  if (!writeResult.ok) {
    console.error(writeResult.error);
    process.exit(1);
  }

  const { error: auditErr } = await supabase
    .from("participant_pick_correction_audit")
    .insert({
      pool_id: poolId,
      participant_id: participantId,
      actor_user_id: null,
      actor_email: "service-role-script",
      match_code: resolved.match.matchCode,
      old_team_id: resolved.match.oldTeamId || null,
      new_team_id: teamResolved.teamId,
      old_team_country_code: resolved.match.oldTeamId
        ? teams.find((t) => t.id === resolved.match.oldTeamId)?.countryCode ?? null
        : null,
      new_team_country_code: teamResolved.countryCode,
      reason,
      metadata: {
        clearedPickCount: applied.cleared.length,
        clearedSummary: summary.clearedLabels,
        ...(() => {
          const statusAudit = summarizeKnockoutPickStatusAuditChanges(
            slots,
            applied.slots,
          );
          return {
            ...(statusAudit.markedOut.length
              ? { markedOutPicks: statusAudit.markedOut }
              : {}),
            ...(statusAudit.restoredActive.length
              ? { restoredActivePicks: statusAudit.restoredActive }
              : {}),
          };
        })(),
        source: "scripts/admin-correct-knockout-pick.ts",
      },
    });
  if (auditErr) {
    console.error(`Saved picks, but audit failed: ${auditErr.message}`);
    process.exit(1);
  }

  console.log("\nApplied correction and wrote audit entry.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
