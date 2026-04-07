import { createClient } from "@/lib/supabase/server";
import {
  buildAllParticipantPickDrafts,
  participantBonusKeysForPool,
} from "../predictions/buildParticipantPickDrafts";
import {
  mapParticipantRow,
  type ParticipantRow,
} from "../participants/participantsDb";
import { mapTeamRow, mapTournamentStageRow } from "../results/mapRows";
import { fetchGroupTeamCountryCodesByLetter } from "../tournament/fetchGroupTeamCountryCodesByLetter";
import { TEAM_TABLE_SELECT } from "../teams/teamDbSelect";
import { mapPredictionRow } from "../../src/lib/scoring/mapSupabaseRows";
import type { Prediction, Team, TournamentStage } from "../../src/types/domain";
import type { Participant } from "../../types/participant";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import { fetchOfficialRoundOf32Complete } from "../tournament/fetchOfficialRoundOf32Complete";

/** Stages needed to build the full participant picks wizard. */
export const ACCOUNT_TOURNAMENT_STAGE_CODES = [
  "group",
  "round_of_32",
  "round_of_16",
  "quarterfinal",
  "semifinal",
  "final",
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PoolEmbed = { name: string; lock_at: string | null } | null;

export function embeddedPool(
  raw:
    | { name: string; lock_at: string | null }
    | { name: string; lock_at: string | null }[]
    | null
    | undefined,
): PoolEmbed {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

export function poolLocked(lockAt: string | null | undefined): boolean {
  if (lockAt == null || lockAt === "") return false;
  const t = new Date(lockAt).getTime();
  if (Number.isNaN(t)) return false;
  return t <= Date.now();
}

export type MyParticipantRow = {
  id: string;
  display_name: string;
  email: string | null;
  is_paid: boolean;
  paid_at: string | null;
  pool_id: string;
  pools: PoolEmbed;
};

export type AccountKnockoutSelection = {
  loadError: string | null;
  myParticipants: MyParticipantRow[];
  invalidQuery: boolean;
  invalidOtherProfile: boolean;
  paramId: string | null;
  selectedId: string | null;
  selectedParticipant: Participant | null;
  selectedPoolName: string;
  selectedLockAt: string | null;
  teams: Team[];
  stages: TournamentStage[];
  predictions: Prediction[];
  bonusKeysOrdered: string[];
  initialSlots: KnockoutPickSlotDraft[];
  profileLinkItems: Array<{ id: string; displayName: string; poolName: string }>;
  /** Group letter → country codes from official group fixtures; empty when unavailable. */
  groupTeamCountryCodesByLetter: Record<string, string[]>;
  /**
   * When false, participants only edit groups, third-place qualifiers, and bonuses until
   * organizers publish all 32 official Round of 32 `results` rows.
   */
  knockoutBracketPicksUnlocked: boolean;
};

/**
 * Loads the signed-in user's pool profiles, teams, stages, and all tournament predictions
 * for the participant id from the query string (when valid and owned).
 */
export async function loadAccountKnockoutSelection(
  userId: string,
  participantParam: string,
): Promise<AccountKnockoutSelection> {
  const trimmed = participantParam.trim();
  const paramId =
    trimmed && UUID_RE.test(trimmed) ? trimmed : null;

  let myParticipants: MyParticipantRow[] = [];
  let teams: Team[] = [];
  let stages: TournamentStage[] = [];
  let predictions: Prediction[] = [];
  let bonusKeysOrdered: string[] = participantBonusKeysForPool([]);
  let groupTeamCountryCodesByLetter: Record<string, string[]> = {};
  let knockoutBracketPicksUnlocked = true;
  let loadError: string | null = null;
  let selectedId: string | null = null;
  let selectedParticipant: Participant | null = null;
  let selectedPoolName = "";
  let selectedLockAt: string | null = null;

  try {
    const supabase = await createClient();

    const { data: rows, error: parErr } = await supabase
      .from("participants")
      .select(
        `
        id,
        display_name,
        email,
        is_paid,
        paid_at,
        pool_id,
        pools (
          name,
          lock_at
        )
      `,
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (parErr) loadError = parErr.message;
    else {
      myParticipants = (rows ?? []).map((r) => ({
        id: r.id as string,
        display_name: r.display_name as string,
        email: r.email as string | null,
        is_paid: Boolean(r.is_paid),
        paid_at: (r.paid_at as string | null) ?? null,
        pool_id: r.pool_id as string,
        pools: embeddedPool(
          r.pools as
            | { name: string; lock_at: string | null }
            | { name: string; lock_at: string | null }[]
            | null
            | undefined,
        ),
      }));
    }

    if (!loadError) {
      const [teamsRes, stagesRes, groupCodes] = await Promise.all([
        supabase
          .from("teams")
          .select(TEAM_TABLE_SELECT)
          .order("name", { ascending: true }),
        supabase
          .from("tournament_stages")
          .select(
            "id, code, label, sort_order, starts_at, ends_at, created_at, updated_at",
          )
          .in("code", [...ACCOUNT_TOURNAMENT_STAGE_CODES])
          .order("sort_order", { ascending: true }),
        fetchGroupTeamCountryCodesByLetter(supabase),
      ]);

      if (teamsRes.error) loadError = teamsRes.error.message;
      else if (stagesRes.error) loadError = stagesRes.error.message;
      else {
        teams = (teamsRes.data ?? []).map(mapTeamRow);
        stages = (stagesRes.data ?? []).map(mapTournamentStageRow);
        groupTeamCountryCodesByLetter = groupCodes;
      }
    }

    if (!loadError) {
      const r32Stage = stages.find((s) => s.code === "round_of_32");
      if (r32Stage) {
        knockoutBracketPicksUnlocked = await fetchOfficialRoundOf32Complete(
          supabase,
          r32Stage.id,
        );
      }
    }

    if (!loadError) {
      for (const code of ACCOUNT_TOURNAMENT_STAGE_CODES) {
        if (!stages.some((s) => s.code === code)) {
          loadError = `Missing tournament stage "${code}" in Supabase. Seed or migrate tournament_stages.`;
          break;
        }
      }
    }

    const profileIds = new Set(myParticipants.map((p) => p.id));

    if (paramId && profileIds.has(paramId)) {
      selectedId = paramId;
    } else if (!paramId && myParticipants.length === 1) {
      selectedId = myParticipants[0].id;
    }

    if (!loadError && selectedId) {
      const row = myParticipants.find((p) => p.id === selectedId);
      if (row) {
        selectedParticipant = mapParticipantRow({
          id: row.id,
          pool_id: row.pool_id,
          display_name: row.display_name,
          email: row.email,
          is_paid: row.is_paid,
          paid_at: row.paid_at,
          user_id: userId,
          invite_pending: false,
          invite_last_sent_at: null,
        } as ParticipantRow);
        selectedPoolName = row.pools?.name ?? "Pool";
        selectedLockAt = row.pools?.lock_at ?? null;

        const [{ data: predData, error: predErr }, { data: ruleRows, error: ruleErr }] =
          await Promise.all([
            supabase
              .from("predictions")
              .select(
                "id, pool_id, participant_id, prediction_kind, team_id, tournament_stage_id, group_code, slot_key, bonus_key, value_text, created_at, updated_at",
              )
              .eq("pool_id", row.pool_id)
              .eq("participant_id", selectedId),
            supabase
              .from("scoring_rules")
              .select("bonus_key")
              .eq("pool_id", row.pool_id)
              .eq("prediction_kind", "bonus_pick")
              .order("bonus_key", { ascending: true }),
          ]);

        if (predErr) loadError = predErr.message;
        else if (ruleErr) loadError = ruleErr.message;
        else {
          type PredRow = Parameters<typeof mapPredictionRow>[0];
          predictions = (predData ?? []).map((r) =>
            mapPredictionRow(r as PredRow),
          );

          const fromDb = (ruleRows ?? [])
            .map((r) => r.bonus_key as string | null)
            .filter((k): k is string => Boolean(k && k.trim()));
          bonusKeysOrdered = participantBonusKeysForPool(fromDb);
        }
      }
    }
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Failed to load your picks page.";
  }

  const profileIds = new Set(myParticipants.map((p) => p.id));

  const invalidOtherProfile =
    Boolean(trimmed) &&
    UUID_RE.test(trimmed) &&
    !profileIds.has(trimmed);

  const stageByCode = Object.fromEntries(
    stages.map((s) => [s.code, s]),
  ) as Partial<Record<TournamentStage["code"], TournamentStage>>;

  const initialSlots =
    selectedParticipant && !loadError
      ? buildAllParticipantPickDrafts({
          stageByCode,
          predictions,
          participantId: selectedParticipant.id,
          bonusKeys: bonusKeysOrdered,
        })
      : [];

  const profileLinkItems = myParticipants.map((p) => ({
    id: p.id,
    displayName: p.display_name,
    poolName: p.pools?.name ?? "Pool",
  }));

  return {
    loadError,
    myParticipants,
    invalidQuery: Boolean(trimmed) && !UUID_RE.test(trimmed),
    invalidOtherProfile,
    paramId,
    selectedId,
    selectedParticipant,
    selectedPoolName,
    selectedLockAt,
    teams,
    stages,
    predictions,
    bonusKeysOrdered,
    initialSlots,
    profileLinkItems,
    groupTeamCountryCodesByLetter,
    knockoutBracketPicksUnlocked,
  };
}

/** @deprecated Use ACCOUNT_TOURNAMENT_STAGE_CODES */
export const ACCOUNT_KNOCKOUT_STAGE_CODES = ACCOUNT_TOURNAMENT_STAGE_CODES;
