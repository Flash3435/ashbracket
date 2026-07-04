#!/usr/bin/env npx tsx
/**
 * Diagnose R16 row resolution for one participant (e.g. M90 Canada vs Morocco).
 *
 * Usage:
 *   npx tsx scripts/diagnose-knockout-r16-row.ts --participant <uuid> [--match 90]
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { diagnoseKnockoutR16MatchRow, formatKnockoutR16RowDiagnostic } from "../lib/picks/knockoutR16RowDiagnostic";
import { buildAllParticipantPickDrafts } from "../lib/predictions/buildParticipantPickDrafts";
import { fetchOfficialRoundOf32Complete } from "../lib/tournament/fetchOfficialRoundOf32Complete";
import { fetchPublicTournamentProgress } from "../lib/tournament/fetchPublicTournamentProgress";
import type { Team } from "../src/types/domain";
import type { Prediction, TournamentStage } from "../src/types/domain";

function arg(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return null;
  return process.argv[idx + 1]?.trim() ?? null;
}

async function main() {
  const participantId = arg("--participant");
  assert.ok(participantId, "Pass --participant <uuid>");

  const fifaMatchNo = parseInt(arg("--match") ?? "90", 10);
  assert.ok(Number.isFinite(fifaMatchNo) && fifaMatchNo >= 89 && fifaMatchNo <= 96);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert.ok(url && key, "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: participant, error: partErr } = await supabase
    .from("participants")
    .select("id, pool_id, display_name")
    .eq("id", participantId)
    .maybeSingle();
  assert.ok(!partErr && participant, partErr?.message ?? "Participant not found");

  const { data: pool } = await supabase
    .from("pools")
    .select("id, tournament_edition_id")
    .eq("id", participant.pool_id)
    .maybeSingle();
  assert.ok(pool?.tournament_edition_id, "Pool edition missing");

  const [{ data: teams }, { data: stages }, { data: predictions }] = await Promise.all([
    supabase.from("teams").select("*"),
    supabase.from("tournament_stages").select("*").eq("edition_id", pool.tournament_edition_id),
    supabase
      .from("predictions")
      .select("*")
      .eq("participant_id", participantId)
      .eq("pool_id", participant.pool_id),
  ]);

  const stageByCode = Object.fromEntries(
    ((stages ?? []) as TournamentStage[]).map((s) => [s.code, s]),
  ) as Partial<Record<TournamentStage["code"], TournamentStage>>;

  const slots = buildAllParticipantPickDrafts({
    stageByCode,
    predictions: (predictions ?? []) as Prediction[],
    participantId,
    bonusKeys: [],
    teams: (teams ?? []) as Team[],
    groupTeamCountryCodesByLetter: {},
  });

  const r32Stage = (stages ?? []).find((s) => s.code === "round_of_32") as
    | TournamentStage
    | undefined;
  const knockoutBracketPicksUnlocked = r32Stage
    ? await fetchOfficialRoundOf32Complete(
        supabase,
        r32Stage.id,
        pool.tournament_edition_id,
      )
    : false;

  const { data: tournamentPayload } = await fetchPublicTournamentProgress();

  const diagnostic = diagnoseKnockoutR16MatchRow({
    fifaMatchNo,
    slots,
    teams: (teams ?? []) as Team[],
    tournamentMatches: tournamentPayload?.matches ?? null,
    knockoutBracketPicksUnlocked,
    participantId: participant.id,
    poolId: participant.pool_id,
    simulateWizardLoadRepair: true,
    deployCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  });

  console.log(
    JSON.stringify(
      {
        participant: {
          id: participant.id,
          displayName: participant.display_name,
          poolId: participant.pool_id,
        },
        diagnostic,
        diagnosticLine: diagnostic
          ? formatKnockoutR16RowDiagnostic(diagnostic)
          : null,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
