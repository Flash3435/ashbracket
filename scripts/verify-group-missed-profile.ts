/**
 * Read-only: verify settled group misses for a participant profile presentation.
 *
 *   npx tsx scripts/verify-group-missed-profile.ts [participantId]
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./loadEnvLocal";
import {
  buildPublicParticipantPresentation,
  settledGroupCodesFromOfficialRows,
} from "../lib/participant/publicParticipantPresentation";
import type {
  PublicParticipantDetail,
  PublicParticipantLedgerRow,
  PublicParticipantPick,
} from "../types/publicParticipant";

const DEFAULT_ID = "f943e7b4-e753-432c-ab4c-19490f0d05a3";

async function main() {
  loadEnvLocal();
  const participantId = process.argv[2]?.trim() || DEFAULT_ID;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: part, error: pe } = await sb
    .from("participants")
    .select("id, display_name, pool_id")
    .eq("id", participantId)
    .maybeSingle();
  if (pe || !part) {
    console.error(pe?.message ?? "participant not found");
    process.exit(1);
  }

  const { data: pool, error: poe } = await sb
    .from("pools")
    .select("id, name, tournament_edition_id")
    .eq("id", part.pool_id)
    .maybeSingle();
  if (poe || !pool) {
    console.error(poe?.message ?? "pool not found");
    process.exit(1);
  }

  const [{ data: preds }, { data: ledger }, { data: results }] = await Promise.all([
    sb
      .from("predictions")
      .select("id, prediction_kind, group_code, slot_key, bonus_key, team_id, tournament_stage_id")
      .eq("participant_id", participantId)
      .eq("pool_id", pool.id)
      .in("prediction_kind", ["group_winner", "group_runner_up"]),
    sb
      .from("points_ledger")
      .select("id, points_delta, prediction_kind, created_at, prediction_id, result_id")
      .eq("participant_id", participantId)
      .eq("pool_id", pool.id)
      .in("prediction_kind", ["group_winner", "group_runner_up"]),
    sb
      .from("results")
      .select("kind, group_code")
      .eq("edition_id", pool.tournament_edition_id)
      .in("kind", ["group_winner", "group_runner_up"]),
  ]);

  const teamIds = [
    ...new Set((preds ?? []).map((p) => p.team_id).filter(Boolean) as string[]),
  ];
  const { data: teams } = await sb
    .from("teams")
    .select("id, name, country_code")
    .in("id", teamIds.length ? teamIds : ["00000000-0000-0000-0000-000000000000"]);
  const teamById = new Map((teams ?? []).map((t) => [t.id as string, t]));

  const picks: PublicParticipantPick[] = (preds ?? []).map((row) => {
    const team = row.team_id ? teamById.get(row.team_id) : undefined;
    return {
      predictionId: row.id as string,
      predictionKind: row.prediction_kind as string,
      groupCode: (row.group_code as string | null) ?? null,
      slotKey: (row.slot_key as string | null) ?? null,
      bonusKey: (row.bonus_key as string | null) ?? null,
      stageCode: "group",
      stageLabel: "Group Stage",
      stageSortOrder: 10,
      teamName: (team?.name as string | undefined) ?? null,
      teamCountryCode: (team?.country_code as string | undefined) ?? null,
    };
  });

  const ledgerRows: PublicParticipantLedgerRow[] = (ledger ?? []).map((row) => ({
    id: row.id as string,
    pointsDelta: Number(row.points_delta),
    predictionKind: (row.prediction_kind as string | null) ?? null,
    createdAt: row.created_at as string,
    predictionId: (row.prediction_id as string | null) ?? null,
    resultId: (row.result_id as string | null) ?? null,
  }));

  const settledGroupCodes = settledGroupCodesFromOfficialRows(results ?? []);
  const detail: PublicParticipantDetail = {
    displayName: String(part.display_name),
    poolName: String(pool.name),
    poolId: pool.id as string,
    participantId,
    totalPoints: ledgerRows.reduce((sum, row) => sum + row.pointsDelta, 0),
    rank: 1,
    picks,
    ledger: ledgerRows,
    settledGroupCodes,
  };

  const { summary, sections } = buildPublicParticipantPresentation(detail);
  const group = sections.find((s) => s.key === "group_stage");
  const missed = (group?.picks ?? [])
    .filter((p) => p.state === "missed")
    .map((p) => `${p.displayLabel} ${p.detailLabel}: ${p.teamName}`);

  console.log(
    JSON.stringify(
      {
        participantId,
        displayName: detail.displayName,
        settledGroupCount: settledGroupCodes.length,
        groupPicks: group?.picks.length ?? 0,
        scored: group?.scoredPicksCount ?? 0,
        missed: group?.missedPicksCount ?? 0,
        awaiting: group?.awaitingScoreCount ?? 0,
        groupPoints: group?.totalPoints ?? 0,
        summaryMissed: summary.missedPicksCount,
        summaryAwaiting: summary.awaitingScoreCount,
        missedPicks: missed,
      },
      null,
      2,
    ),
  );

  const ok =
    (group?.picks.length ?? 0) === 24 &&
    (group?.scoredPicksCount ?? 0) === 21 &&
    (group?.missedPicksCount ?? 0) === 3 &&
    (group?.awaitingScoreCount ?? 0) === 0 &&
    (group?.totalPoints ?? 0) === 59 &&
    missed.includes("Group C Runner-up: Scotland") &&
    missed.includes("Group G Runner-up: New Zealand") &&
    missed.includes("Group H Runner-up: Uruguay");

  if (!ok) {
    console.error("UNEXPECTED PROFILE STATE");
    process.exit(1);
  }
  console.log("verify-group-missed-profile: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
