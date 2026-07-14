#!/usr/bin/env tsx
/**
 * Restore historically deleted champion predictions.
 * Dry-run by default. Requires explicit `--apply` to write.
 *
 * Usage (dry-run):
 *   npx tsx scripts/restore-deleted-champion-picks.ts --report-json /tmp/deleted-champion-picks-audit.json
 *   npx tsx scripts/restore-deleted-champion-picks.ts --pool <poolId> --participant <participantId> --team <teamId>
 *
 * Apply (writes):
 *   … same args … --apply
 *
 * Rules:
 * - Restores only evidenceLevel confirmed_* / recommendedAction=restore from report
 *   (exact args path is treated as operator-confirmed)
 * - Refuses ambiguous / strongly_supported candidates from report
 * - Refuses if a champion row already exists
 * - Idempotent upsert of original champion row shape (no invented value_text)
 * - Does not recompute standings
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./loadEnvLocal";

loadEnvLocal();

const RESTORE_SOURCE = "restored_after_topology_champion_delete";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const reportJsonIdx = args.indexOf("--report-json");
const reportJsonPath =
  reportJsonIdx >= 0 ? args[reportJsonIdx + 1]?.trim() : "";
const outReportIdx = args.indexOf("--out-json");
const outReportPath =
  outReportIdx >= 0
    ? args[outReportIdx + 1]?.trim()
    : "/tmp/restore-deleted-champion-picks-result.json";
const poolIdx = args.indexOf("--pool");
const participantIdx = args.indexOf("--participant");
const teamIdx = args.indexOf("--team");
const poolArg = poolIdx >= 0 ? args[poolIdx + 1]?.trim() : "";
const participantArg =
  participantIdx >= 0 ? args[participantIdx + 1]?.trim() : "";
const teamArg = teamIdx >= 0 ? args[teamIdx + 1]?.trim() : "";

type RestoreTarget = {
  poolId: string;
  participantId: string;
  teamId: string;
  evidenceLevel: string;
  source: string;
};

type CandidateLike = {
  poolId: string;
  participantId: string;
  deletedChampionTeamId: string | null;
  evidenceLevel: string;
  recommendedAction: string;
  currentChampionRowExists: boolean;
};

function loadReportTargets(path: string): RestoreTarget[] {
  const raw = JSON.parse(readFileSync(resolve(path), "utf8")) as {
    candidates?: CandidateLike[];
    restoreCandidates?: CandidateLike[];
  };
  const list = raw.restoreCandidates ?? raw.candidates ?? [];
  const targets: RestoreTarget[] = [];
  for (const c of list) {
    if (c.recommendedAction !== "restore") continue;
    if (c.currentChampionRowExists) continue;
    if (
      !["confirmed_history", "confirmed_repair_log", "confirmed_snapshot"].includes(
        c.evidenceLevel,
      )
    ) {
      continue;
    }
    const teamId = c.deletedChampionTeamId?.trim();
    if (!teamId) continue;
    targets.push({
      poolId: c.poolId,
      participantId: c.participantId,
      teamId,
      evidenceLevel: c.evidenceLevel,
      source: `report:${path}`,
    });
  }
  return targets;
}

if (!reportJsonPath && !(poolArg && participantArg && teamArg)) {
  console.error(
    "Usage: npx tsx scripts/restore-deleted-champion-picks.ts --report-json <confirmed-audit-report> | --pool <id> --participant <id> --team <teamId> [--apply] [--out-json path]",
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

async function main(): Promise<void> {
  const targets: RestoreTarget[] = reportJsonPath
    ? loadReportTargets(reportJsonPath)
    : [
        {
          poolId: poolArg,
          participantId: participantArg,
          teamId: teamArg,
          evidenceLevel: "operator_exact_args",
          source: "cli-args",
        },
      ];

  if (targets.length === 0) {
    console.log("No confirmed restore targets. Nothing to do.");
    writeFileSync(
      outReportPath,
      JSON.stringify(
        {
          dryRun: !apply,
          wroteToDatabase: false,
          restoreSource: RESTORE_SOURCE,
          targets: [],
          results: [],
        },
        null,
        2,
      ),
    );
    console.log(`Wrote ${outReportPath}`);
    return;
  }

  const { data: stages, error: stageErr } = await supabase
    .from("tournament_stages")
    .select("id, code")
    .eq("code", "final")
    .maybeSingle();
  if (stageErr) throw new Error(stageErr.message);
  if (!stages?.id) throw new Error("Missing final tournament stage");
  const finalStageId = stages.id as string;

  const { data: teams } = await supabase.from("teams").select("id, name");
  const teamName = new Map(
    (teams ?? []).map((t) => [t.id as string, t.name as string]),
  );

  type RowResult = {
    poolId: string;
    participantId: string;
    teamId: string;
    teamName: string | null;
    status:
      | "would_restore"
      | "restored"
      | "skipped_exists"
      | "skipped_ambiguous"
      | "error";
    before: unknown;
    after: unknown;
    message?: string;
  };

  const results: RowResult[] = [];

  console.log(
    apply
      ? "=== Restore deleted champions (APPLY — writes enabled) ==="
      : "=== Restore deleted champions (DRY-RUN — no writes) ===",
  );
  console.log(`Targets: ${targets.length}`);
  console.log(`Restore source tag: ${RESTORE_SOURCE}\n`);

  for (const target of targets) {
    const { data: existing, error: existErr } = await supabase
      .from("predictions")
      .select(
        "id, pool_id, participant_id, prediction_kind, team_id, slot_key, tournament_stage_id, group_code, bonus_key, value_text, created_at, updated_at",
      )
      .eq("pool_id", target.poolId)
      .eq("participant_id", target.participantId)
      .eq("prediction_kind", "champion")
      .is("slot_key", null)
      .is("group_code", null)
      .is("bonus_key", null);

    if (existErr) {
      results.push({
        poolId: target.poolId,
        participantId: target.participantId,
        teamId: target.teamId,
        teamName: teamName.get(target.teamId) ?? null,
        status: "error",
        before: null,
        after: null,
        message: existErr.message,
      });
      continue;
    }

    const current = (existing ?? []).find((r) => Boolean(r.team_id?.trim()));
    if (current) {
      results.push({
        poolId: target.poolId,
        participantId: target.participantId,
        teamId: target.teamId,
        teamName: teamName.get(target.teamId) ?? null,
        status: "skipped_exists",
        before: current,
        after: current,
        message: `Champion already exists: ${current.team_id}`,
      });
      console.log(
        `SKIP exists ${target.participantId} current=${current.team_id}`,
      );
      continue;
    }

    const payload = {
      pool_id: target.poolId,
      participant_id: target.participantId,
      prediction_kind: "champion",
      tournament_stage_id: finalStageId,
      group_code: null,
      slot_key: null,
      bonus_key: null,
      team_id: target.teamId,
      value_text: null,
    };

    if (!apply) {
      results.push({
        poolId: target.poolId,
        participantId: target.participantId,
        teamId: target.teamId,
        teamName: teamName.get(target.teamId) ?? null,
        status: "would_restore",
        before: existing?.[0] ?? null,
        after: payload,
        message: `${RESTORE_SOURCE} (${target.evidenceLevel})`,
      });
      console.log(
        `DRY-RUN would restore pool=${target.poolId} participant=${target.participantId} team=${target.teamId} (${teamName.get(target.teamId) ?? "?"})`,
      );
      continue;
    }

    const { data: upserted, error: upErr } = await supabase
      .from("predictions")
      .upsert(payload, {
        onConflict:
          "participant_id,pool_id,prediction_kind,tournament_stage_id,group_code,slot_key,bonus_key",
      })
      .select(
        "id, pool_id, participant_id, prediction_kind, team_id, slot_key, tournament_stage_id, group_code, bonus_key, value_text, created_at, updated_at",
      )
      .maybeSingle();

    if (upErr) {
      results.push({
        poolId: target.poolId,
        participantId: target.participantId,
        teamId: target.teamId,
        teamName: teamName.get(target.teamId) ?? null,
        status: "error",
        before: existing?.[0] ?? null,
        after: null,
        message: upErr.message,
      });
      console.error(`ERROR ${target.participantId}: ${upErr.message}`);
      continue;
    }

    // Best-effort audit note in correction audit (does not alter prediction shape).
    await supabase.from("participant_pick_correction_audit").insert({
      pool_id: target.poolId,
      participant_id: target.participantId,
      actor_user_id: null,
      actor_email: null,
      match_code: "champion",
      old_team_id: null,
      new_team_id: target.teamId,
      old_team_country_code: null,
      new_team_country_code: null,
      reason: RESTORE_SOURCE,
      metadata: {
        source: RESTORE_SOURCE,
        evidenceLevel: target.evidenceLevel,
        restoreSource: target.source,
      },
    });

    results.push({
      poolId: target.poolId,
      participantId: target.participantId,
      teamId: target.teamId,
      teamName: teamName.get(target.teamId) ?? null,
      status: "restored",
      before: existing?.[0] ?? null,
      after: upserted,
      message: RESTORE_SOURCE,
    });
    console.log(
      `RESTORED pool=${target.poolId} participant=${target.participantId} team=${target.teamId}`,
    );
  }

  const summary = {
    dryRun: !apply,
    wroteToDatabase: apply,
    restoreSource: RESTORE_SOURCE,
    targetCount: targets.length,
    wouldRestore: results.filter((r) => r.status === "would_restore").length,
    restored: results.filter((r) => r.status === "restored").length,
    skippedExists: results.filter((r) => r.status === "skipped_exists").length,
    errors: results.filter((r) => r.status === "error").length,
    results,
  };

  writeFileSync(outReportPath, JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${outReportPath}`);
  if (!apply) {
    console.log("No production writes were made (dry-run).");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
