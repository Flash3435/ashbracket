import type { SupabaseClient } from "@supabase/supabase-js";
import { ACCOUNT_TOURNAMENT_STAGE_CODES } from "../account/loadAccountKnockoutSelection";
import {
  buildAllParticipantPickDrafts,
  participantBonusKeysForPool,
} from "../predictions/buildParticipantPickDrafts";
import { mapPredictionRow } from "../../src/lib/scoring/mapSupabaseRows";
import type { Prediction, Team, TournamentStage } from "../../src/types/domain";
import { mapTeamRow, mapTournamentStageRow } from "../results/mapRows";
import { isKnockoutProgressionKind } from "../predictions/knockoutProgressionKinds";
import { fetchOfficialRoundOf32Complete } from "../tournament/fetchOfficialRoundOf32Complete";
import { fetchGroupTeamCountryCodesByLetter } from "../tournament/fetchGroupTeamCountryCodesByLetter";
import { TEAM_TABLE_SELECT } from "../teams/teamDbSelect";

type PredRow = Parameters<typeof mapPredictionRow>[0];

/** Canonical description of how “bracket complete” is evaluated in app code. */
export const BRACKET_COMPLETION_RULES_SOURCE =
  "lib/communications/picksCompleteness.ts::participantPicksCompleteFromDrafts + " +
  "lib/predictions/buildParticipantPickDrafts.ts::buildAllParticipantPickDrafts " +
  "(group rows + per-group Stage 2 third-place rows + knockout sections + bonus keys)";

export type PicksCompletenessInputs = {
  stageByCode: Partial<Record<TournamentStage["code"], TournamentStage>>;
  predictions: Prediction[];
  bonusKeys: string[];
  teams: Team[];
  groupTeamCountryCodesByLetter: Record<string, string[]>;
  knockoutBracketPicksUnlocked: boolean;
};

export type BracketCompletionDiagnosticRow = {
  participant_id: string;
  display_name: string | null;
  pool_id: string;
  saved_predictions_by_kind: Record<string, number>;
  required_prediction_kinds: string[];
  missing_required_kinds: string[];
  picks_complete: boolean;
  knockout_bracket_picks_unlocked: boolean;
  relevant_slot_count: number;
  empty_relevant_slot_count: number;
  rules_source: string;
};

/**
 * Whether every required pick slot has a team chosen. When the official Round of 32 is
 * not published yet, knockout progression rows are ignored so participants are not
 * flagged incomplete for rounds they cannot fill.
 */
export function participantPicksCompleteFromDrafts(
  slots: ReturnType<typeof buildAllParticipantPickDrafts>,
  options?: { knockoutBracketPicksUnlocked?: boolean },
): boolean {
  if (slots.length === 0) return false;
  const unlocked = options?.knockoutBracketPicksUnlocked !== false;
  const relevant = unlocked
    ? slots
    : slots.filter((s) => !isKnockoutProgressionKind(s.predictionKind));
  if (relevant.length === 0) return false;

  const nonThird = relevant.filter(
    (s) => s.predictionKind !== "third_place_qualifier",
  );
  if (nonThird.some((s) => s.teamId.trim() === "")) return false;

  const third = relevant.filter(
    (s) => s.predictionKind === "third_place_qualifier",
  );
  if (third.length === 0) return false;

  return third.filter((s) => s.teamId.trim()).length === 8;
}

export function relevantSlotsForCompleteness(
  slots: ReturnType<typeof buildAllParticipantPickDrafts>,
  knockoutBracketPicksUnlocked: boolean,
): ReturnType<typeof buildAllParticipantPickDrafts> {
  const unlocked = knockoutBracketPicksUnlocked !== false;
  return unlocked
    ? slots
    : slots.filter((s) => !isKnockoutProgressionKind(s.predictionKind));
}

function countSavedPredictionsByKindForParticipant(
  predictions: Prediction[],
  participantId: string,
): Record<string, number> {
  const m = new Map<string, number>();
  for (const p of predictions) {
    if (p.participantId !== participantId) continue;
    if (!p.teamId || !String(p.teamId).trim()) continue;
    m.set(p.predictionKind, (m.get(p.predictionKind) ?? 0) + 1);
  }
  return Object.fromEntries([...m.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

/**
 * Shared fetch for completeness, diagnostics, and recaps (single round-trip + RPC).
 * Returns null if any underlying query failed (callers should treat all participants incomplete).
 */
export async function loadPicksCompletenessInputsForPool(
  supabase: SupabaseClient,
  poolId: string,
  participantIds: string[],
): Promise<PicksCompletenessInputs | null> {
  if (participantIds.length === 0) {
    return {
      stageByCode: {},
      predictions: [],
      bonusKeys: participantBonusKeysForPool([]),
      teams: [],
      groupTeamCountryCodesByLetter: {},
      knockoutBracketPicksUnlocked: true,
    };
  }

  const stageCodes = [...ACCOUNT_TOURNAMENT_STAGE_CODES];
  const [
    { data: poolRow, error: poolErr },
    { data: stageRows, error: stageErr },
    { data: predRows, error: predErr },
    { data: ruleRows, error: ruleErr },
    { data: teamRows, error: teamsErr },
    groupTeamCountryCodesByLetter,
  ] =
    await Promise.all([
      supabase
        .from("pools")
        .select("tournament_edition_id")
        .eq("id", poolId)
        .maybeSingle(),
      supabase
        .from("tournament_stages")
        .select(
          "id, code, label, sort_order, starts_at, ends_at, created_at, updated_at",
        )
        .in("code", stageCodes)
        .order("sort_order", { ascending: true }),
      supabase
        .from("predictions")
        .select(
          "id, pool_id, participant_id, prediction_kind, team_id, tournament_stage_id, group_code, slot_key, bonus_key, value_text, created_at, updated_at",
        )
        .eq("pool_id", poolId)
        .in("participant_id", participantIds),
      supabase
        .from("scoring_rules")
        .select("bonus_key")
        .eq("pool_id", poolId)
        .eq("prediction_kind", "bonus_pick")
        .order("bonus_key", { ascending: true }),
      supabase.from("teams").select(TEAM_TABLE_SELECT).order("name", {
        ascending: true,
      }),
      fetchGroupTeamCountryCodesByLetter(supabase),
    ]);

  if (poolErr || stageErr || predErr || ruleErr || teamsErr) {
    return null;
  }
  const editionId = (poolRow?.tournament_edition_id as string | null) ?? null;
  if (!editionId) {
    return null;
  }

  const stages = (stageRows ?? []).map((r) =>
    mapTournamentStageRow(
      r as {
        id: string;
        code: string;
        label: string;
        sort_order: number;
        starts_at: string | null;
        ends_at: string | null;
        created_at: string;
        updated_at: string;
      },
    ),
  );
  const stageByCode = Object.fromEntries(
    stages.map((s) => [s.code, s]),
  ) as Partial<Record<TournamentStage["code"], TournamentStage>>;

  const predictions: Prediction[] = (predRows ?? []).map((row) =>
    mapPredictionRow(row as PredRow),
  );
  const teams: Team[] = (teamRows ?? []).map(mapTeamRow);

  const fromDb = (ruleRows ?? [])
    .map((r) => r.bonus_key as string | null)
    .filter((k): k is string => Boolean(k && k.trim()));
  const bonusKeys = participantBonusKeysForPool(fromDb);

  const r32Stage = stages.find((s) => s.code === "round_of_32");
  const knockoutBracketPicksUnlocked = r32Stage
    ? await fetchOfficialRoundOf32Complete(supabase, r32Stage.id, editionId)
    : true;

  return {
    stageByCode,
    predictions,
    bonusKeys,
    teams,
    groupTeamCountryCodesByLetter,
    knockoutBracketPicksUnlocked,
  };
}

export function buildCompletionDiagnosticRows(
  inputs: PicksCompletenessInputs,
  poolId: string,
  participantRows: Array<{ id: string; display_name: string | null }>,
): BracketCompletionDiagnosticRow[] {
  return participantRows.map((row) => {
    const slots = buildAllParticipantPickDrafts({
      stageByCode: inputs.stageByCode,
      predictions: inputs.predictions,
      participantId: row.id,
      bonusKeys: inputs.bonusKeys,
      teams: inputs.teams,
      groupTeamCountryCodesByLetter: inputs.groupTeamCountryCodesByLetter,
    });
    const relevant = relevantSlotsForCompleteness(
      slots,
      inputs.knockoutBracketPicksUnlocked,
    );
    const requiredKinds = [...new Set(relevant.map((s) => s.predictionKind))];
    const missingKinds = new Set<string>();
    for (const s of relevant) {
      if (!s.teamId.trim()) {
        missingKinds.add(s.predictionKind);
      }
    }
    const picksComplete = participantPicksCompleteFromDrafts(slots, {
      knockoutBracketPicksUnlocked: inputs.knockoutBracketPicksUnlocked,
    });
    const emptyRelevant = relevant.filter((s) => !s.teamId.trim()).length;

    return {
      participant_id: row.id,
      display_name: row.display_name,
      pool_id: poolId,
      saved_predictions_by_kind: countSavedPredictionsByKindForParticipant(
        inputs.predictions,
        row.id,
      ),
      required_prediction_kinds: requiredKinds,
      missing_required_kinds: [...missingKinds].sort((a, b) => a.localeCompare(b)),
      picks_complete: picksComplete,
      knockout_bracket_picks_unlocked: inputs.knockoutBracketPicksUnlocked,
      relevant_slot_count: relevant.length,
      empty_relevant_slot_count: emptyRelevant,
      rules_source: BRACKET_COMPLETION_RULES_SOURCE,
    };
  });
}

/**
 * Loads predictions + stages once, returns participant ids in the pool whose picks are incomplete.
 */
export async function loadParticipantIdsWithIncompletePicks(
  supabase: SupabaseClient,
  poolId: string,
  participantIds: string[],
): Promise<Set<string>> {
  const incomplete = new Set<string>();
  if (participantIds.length === 0) return incomplete;

  const inputs = await loadPicksCompletenessInputsForPool(
    supabase,
    poolId,
    participantIds,
  );
  if (!inputs) {
    participantIds.forEach((id) => incomplete.add(id));
    return incomplete;
  }

  for (const pid of participantIds) {
    const slots = buildAllParticipantPickDrafts({
      stageByCode: inputs.stageByCode,
      predictions: inputs.predictions,
      participantId: pid,
      bonusKeys: inputs.bonusKeys,
      teams: inputs.teams,
      groupTeamCountryCodesByLetter: inputs.groupTeamCountryCodesByLetter,
    });
    if (
      !participantPicksCompleteFromDrafts(slots, {
        knockoutBracketPicksUnlocked: inputs.knockoutBracketPicksUnlocked,
      })
    ) {
      incomplete.add(pid);
    }
  }

  return incomplete;
}

/** Whether one participant’s required pick slots are complete (same rules as bulk incomplete check). */
export async function isParticipantPicksCompleteForParticipant(
  supabase: SupabaseClient,
  poolId: string,
  participantId: string,
): Promise<boolean> {
  const incomplete = await loadParticipantIdsWithIncompletePicks(
    supabase,
    poolId,
    [participantId],
  );
  return !incomplete.has(participantId);
}
