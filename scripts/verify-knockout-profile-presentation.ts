/**
 * Read-only: verify knockout profile Awarded/Satisfied/Missed/Awaiting for Vinay.
 *
 *   npx tsx scripts/verify-knockout-profile-presentation.ts [participantId]
 *
 * Does not recompute scores or modify data.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./loadEnvLocal";
import { buildPublicParticipantPresentation } from "../lib/participant/publicParticipantPresentation";
import {
  buildKnockoutProfileSettlementContext,
  buildKnockoutResultCounts,
} from "../lib/participant/knockoutProfileSettlement";
import { KNOCKOUT_PROGRESSION_PREDICTION_KINDS } from "../lib/predictions/knockoutProgressionKinds";
import { decodeKnockoutPickStatusMetadata } from "../lib/predictions/knockoutPickStatus";
import type { PublicParticipantDetail } from "../types/publicParticipant";

const DEFAULT_ID = "f943e7b4-e753-432c-ab4c-19490f0d05a3";
const KO = [...KNOCKOUT_PROGRESSION_PREDICTION_KINDS];

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
    .single();
  if (pe || !part) {
    console.error(pe?.message ?? "participant not found");
    process.exit(1);
  }

  const { data: pool, error: poe } = await sb
    .from("pools")
    .select("id, name, tournament_edition_id")
    .eq("id", part.pool_id)
    .single();
  if (poe || !pool) {
    console.error(poe?.message ?? "pool not found");
    process.exit(1);
  }

  const editionId = pool.tournament_edition_id as string;

  const [
    { data: preds },
    { data: ledger },
    { data: results },
    { data: matches },
    { data: rules },
  ] = await Promise.all([
    sb
      .from("predictions")
      .select(
        "id, prediction_kind, slot_key, team_id, value_text, group_code, bonus_key, tournament_stage_id",
      )
      .eq("participant_id", participantId)
      .eq("pool_id", pool.id),
    sb
      .from("points_ledger")
      .select(
        "id, points_delta, prediction_kind, prediction_id, result_id, created_at",
      )
      .eq("participant_id", participantId)
      .eq("pool_id", pool.id),
    sb
      .from("results")
      .select("kind, team_id")
      .eq("edition_id", editionId)
      .in("kind", KO),
    sb
      .from("tournament_matches")
      .select(
        "stage_code, home_team_id, away_team_id, winner_team_id, status",
      )
      .eq("edition_id", editionId)
      .in("stage_code", [
        "round_of_32",
        "round_of_16",
        "quarterfinal",
        "semifinal",
        "final",
        "third_place",
      ]),
    sb
      .from("scoring_rules")
      .select("prediction_kind, points")
      .eq("pool_id", pool.id)
      .in("prediction_kind", KO),
  ]);

  const teamIds = [
    ...new Set((preds ?? []).map((p) => p.team_id).filter(Boolean) as string[]),
  ];
  const { data: teams } = await sb
    .from("teams")
    .select("id, name, country_code")
    .in("id", teamIds.length ? teamIds : ["00000000-0000-0000-0000-000000000000"]);
  const teamById = new Map((teams ?? []).map((t) => [t.id as string, t]));

  const stageIds = [
    ...new Set(
      (preds ?? [])
        .map((p) => p.tournament_stage_id)
        .filter(Boolean) as string[],
    ),
  ];
  const { data: stages } = await sb
    .from("tournament_stages")
    .select("id, code, label, sort_order")
    .in("id", stageIds.length ? stageIds : ["00000000-0000-0000-0000-000000000000"]);
  const stageById = new Map((stages ?? []).map((s) => [s.id as string, s]));

  const kindsWithPositivePoints = (rules ?? [])
    .filter((r) => Number(r.points) > 0)
    .map((r) => String(r.prediction_kind));

  const settlement = buildKnockoutProfileSettlementContext({
    results: results ?? [],
    matches: matches ?? [],
    picks: (preds ?? []).map((p) => ({
      predictionId: p.id as string,
      predictionKind: p.prediction_kind as string,
      teamId: (p.team_id as string | null) ?? null,
    })),
    ledger: (ledger ?? []).map((l) => ({
      predictionId: (l.prediction_id as string | null) ?? null,
      pointsDelta: Number(l.points_delta),
      predictionKind: (l.prediction_kind as string | null) ?? null,
    })),
    kindsWithPositivePoints,
  });

  const ledgerTotal = (ledger ?? []).reduce(
    (sum, row) => sum + Number(row.points_delta),
    0,
  );
  const ledgerCountBefore = (ledger ?? []).length;

  const detail: PublicParticipantDetail = {
    displayName: part.display_name as string,
    poolName: pool.name as string,
    poolId: pool.id as string,
    participantId,
    totalPoints: ledgerTotal,
    rank: 0,
    picks: (preds ?? []).map((p) => {
      const team = p.team_id ? teamById.get(p.team_id as string) : undefined;
      const stage = p.tournament_stage_id
        ? stageById.get(p.tournament_stage_id as string)
        : undefined;
      return {
        predictionId: p.id as string,
        predictionKind: p.prediction_kind as string,
        groupCode: (p.group_code as string | null) ?? null,
        slotKey: (p.slot_key as string | null) ?? null,
        bonusKey: (p.bonus_key as string | null) ?? null,
        stageCode: (stage?.code as string | undefined) ?? null,
        stageLabel: String(stage?.label ?? "Other"),
        stageSortOrder: Number(stage?.sort_order ?? 10_000),
        teamName: (team?.name as string | undefined) ?? null,
        teamCountryCode: (team?.country_code as string | undefined) ?? null,
        teamId: (p.team_id as string | null) ?? null,
        pickIsOut:
          Boolean(p.team_id) &&
          decodeKnockoutPickStatusMetadata(p.value_text as string | null)
            ?.status === "out",
      };
    }),
    ledger: (ledger ?? []).map((l) => ({
      id: l.id as string,
      pointsDelta: Number(l.points_delta),
      predictionKind: (l.prediction_kind as string | null) ?? null,
      createdAt: String(l.created_at),
      predictionId: (l.prediction_id as string | null) ?? null,
      resultId: (l.result_id as string | null) ?? null,
    })),
    knockoutProgressByTeamId: Object.fromEntries(settlement.progressByTeamId),
    knockoutAwardByTeamId: Object.fromEntries(settlement.awardByTeamId),
    knockoutKindsWithPositivePoints: kindsWithPositivePoints,
    knockoutRoundOf32FieldComplete: settlement.roundOf32FieldComplete,
    knockoutOfficialResultCounts: Object.fromEntries(
      buildKnockoutResultCounts(results ?? []),
    ),
  };

  const { summary, sections, diagnostics } =
    buildPublicParticipantPresentation(detail);

  const koPicks = sections
    .filter((s) =>
      [
        "round_of_32",
        "round_of_16",
        "quarterfinalists",
        "semifinalists",
        "finalists",
        "champion",
      ].includes(s.key),
    )
    .flatMap((s) => s.picks);

  const counts = {
    awarded: koPicks.filter((p) => p.state === "awarded").length,
    satisfied: koPicks.filter((p) => p.state === "satisfied").length,
    missed: koPicks.filter((p) => p.state === "missed").length,
    awaiting: koPicks.filter((p) => p.state === "awaiting").length,
    out: koPicks.filter((p) => p.state === "out").length,
  };

  console.log("PARTICIPANT", part.display_name, participantId);
  console.log("POOL", pool.name, pool.id);
  console.log("LEDGER_TOTAL", ledgerTotal);
  console.log("LEDGER_ROW_COUNT", ledgerCountBefore);
  console.log("KO_COUNTS", counts);
  console.log("SUMMARY", {
    awarded: summary.awardedPicksCount,
    satisfied: summary.satisfiedPicksCount,
    missed: summary.missedPicksCount,
    awaiting: summary.awaitingScoreCount,
    out: summary.outPicksCount,
    totalPointsFromLedger: summary.totalPointsFromLedger,
  });
  console.log("DIAGNOSTICS", diagnostics);

  const find = (kind: string, name: string) =>
    koPicks.find(
      (p) => p.predictionKind === kind && p.teamName === name,
    );

  const expectations: Array<{
    label: string;
    pick: (typeof koPicks)[number] | undefined;
    state: string;
    minPts?: number;
  }> = [
    { label: "R16 Canada", pick: find("round_of_16", "Canada"), state: "awarded", minPts: 4 },
    { label: "R16 Norway", pick: find("round_of_16", "Norway"), state: "awarded", minPts: 8 },
    { label: "R16 France", pick: find("round_of_16", "France"), state: "satisfied" },
    { label: "R16 England", pick: find("round_of_16", "England"), state: "satisfied" },
    { label: "R16 Germany", pick: find("round_of_16", "Germany"), state: "out" },
    { label: "R16 Netherlands", pick: find("round_of_16", "Netherlands"), state: "out" },
    { label: "R16 Ecuador", pick: find("round_of_16", "Ecuador"), state: "out" },
    { label: "QF France", pick: find("quarterfinalist", "France"), state: "satisfied" },
    { label: "QF Morocco", pick: find("quarterfinalist", "Morocco"), state: "satisfied" },
    { label: "QF Brazil", pick: find("quarterfinalist", "Brazil"), state: "missed" },
    { label: "QF England", pick: find("quarterfinalist", "England"), state: "awarded" },
    { label: "QF Spain", pick: find("quarterfinalist", "Spain"), state: "awarded" },
    { label: "QF USA", pick: find("quarterfinalist", "United States"), state: "missed" },
    { label: "QF Argentina", pick: find("quarterfinalist", "Argentina"), state: "satisfied" },
    { label: "QF Colombia", pick: find("quarterfinalist", "Colombia"), state: "missed" },
    { label: "SF France", pick: find("semifinalist", "France"), state: "satisfied" },
    { label: "SF England", pick: find("semifinalist", "England"), state: "satisfied" },
    { label: "SF Argentina", pick: find("semifinalist", "Argentina"), state: "awarded" },
    { label: "Final France", pick: find("finalist", "France"), state: "missed" },
    { label: "Champ France", pick: find("champion", "France"), state: "missed" },
    { label: "Final Argentina", pick: find("finalist", "Argentina"), state: "awaiting" },
  ];

  const spainSf = find("semifinalist", "Spain");
  console.log(
    "SF Spain state",
    spainSf?.state,
    "pts",
    spainSf?.pointsEarned,
    "(awarded or satisfied depending on ownership)",
  );

  let failures = 0;
  for (const exp of expectations) {
    const ok =
      exp.pick != null &&
      exp.pick.state === exp.state &&
      (exp.minPts == null || exp.pick.pointsEarned >= exp.minPts);
    if (!ok) {
      failures += 1;
      console.error("FAIL", exp.label, {
        expected: exp.state,
        actual: exp.pick?.state,
        pts: exp.pick?.pointsEarned,
      });
    } else {
      console.log("OK", exp.label, exp.pick!.state, `pts=${exp.pick!.pointsEarned}`);
    }
  }

  const expectedCounts = {
    awarded: 16,
    satisfied: 22,
    missed: 21,
    awaiting: 1,
    out: 3,
  };
  for (const key of Object.keys(expectedCounts) as (keyof typeof expectedCounts)[]) {
    if (counts[key] !== expectedCounts[key]) {
      failures += 1;
      console.error("FAIL count", key, {
        expected: expectedCounts[key],
        actual: counts[key],
      });
    } else {
      console.log("OK count", key, counts[key]);
    }
  }

  const { data: ledgerAfter } = await sb
    .from("points_ledger")
    .select("id")
    .eq("participant_id", participantId)
    .eq("pool_id", pool.id);
  if ((ledgerAfter ?? []).length !== ledgerCountBefore) {
    failures += 1;
    console.error("FAIL ledger row count changed (mutation?)", {
      before: ledgerCountBefore,
      after: (ledgerAfter ?? []).length,
    });
  } else {
    console.log("OK ledger unchanged", ledgerCountBefore, "rows");
  }

  if (diagnostics.consistencyErrors.length > 0) {
    failures += 1;
    console.error("FAIL consistency", diagnostics.consistencyErrors);
  }

  if (failures > 0) {
    console.error(`\nFAILED with ${failures} issue(s)`);
    process.exit(1);
  }
  console.log("\nverify-knockout-profile-presentation: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
