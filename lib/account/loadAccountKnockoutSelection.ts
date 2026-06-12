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
import { poolLocked } from "../pools/poolLocked";
import { resolveKnockoutSelectionParticipantId } from "./accountKnockoutSelectionId";
import {
  mapPoolPaymentFromPool,
  mapPoolPaymentRow,
  type PoolPaymentSettings,
} from "../pools/poolPayment";

export { poolLocked };

/** Participant nav CTA — edit before lock, view after. */
export function accountPicksNavLabel(picksLocked: boolean): string {
  return picksLocked ? "View picks" : "Edit picks";
}

/** Stages needed to build the full participant picks wizard. */
export const ACCOUNT_TOURNAMENT_STAGE_CODES = [
  "group",
  "round_of_32",
  "round_of_16",
  "quarterfinal",
  "semifinal",
  "final",
] as const;

export type PoolEmbed = {
  name: string;
  lock_at: string | null;
  is_simulation: boolean | null;
  archived_at: string | null;
  tournament_edition_id: string | null;
  payment_type: string;
  entry_fee_label: string | null;
  entry_fee_amount: number | string | null;
  payment_instructions: string | null;
  entry_fee_cents: number | null;
  currency_code: string;
  show_pot_to_participants: boolean;
} | null;

export function embeddedPool(
  raw:
    | PoolEmbed
    | NonNullable<PoolEmbed>[]
    | null
    | undefined,
): PoolEmbed {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
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
  selectedPoolId: string | null;
  selectedLockAt: string | null;
  selectedPoolPayment: PoolPaymentSettings;
  teams: Team[];
  stages: TournamentStage[];
  predictions: Prediction[];
  bonusKeysOrdered: string[];
  initialSlots: KnockoutPickSlotDraft[];
  profileLinkItems: Array<{
    id: string;
    displayName: string;
    poolName: string;
    picksLocked: boolean;
  }>;
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
  let myParticipants: MyParticipantRow[] = [];
  let teams: Team[] = [];
  let stages: TournamentStage[] = [];
  let predictions: Prediction[] = [];
  let bonusKeysOrdered: string[] = participantBonusKeysForPool([]);
  let groupTeamCountryCodesByLetter: Record<string, string[]> = {};
  let knockoutBracketPicksUnlocked = true;
  let loadError: string | null = null;
  let paramId: string | null = null;
  let invalidQuery = false;
  let invalidOtherProfile = false;
  let selectedId: string | null = null;
  let selectedParticipant: Participant | null = null;
  let selectedPoolName = "";
  let selectedPoolId: string | null = null;
  let selectedLockAt: string | null = null;
  let selectedPoolPayment: PoolPaymentSettings = mapPoolPaymentFromPool({
    payment_type: "free",
  });

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
          lock_at,
          is_simulation,
          archived_at,
          tournament_edition_id,
          payment_type,
          entry_fee_label,
          entry_fee_amount,
          payment_instructions,
          entry_fee_cents,
          currency_code,
          show_pot_to_participants
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
            | NonNullable<PoolEmbed>
            | NonNullable<PoolEmbed>[]
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
      for (const code of ACCOUNT_TOURNAMENT_STAGE_CODES) {
        if (!stages.some((s) => s.code === code)) {
          loadError = `Missing tournament stage "${code}" in Supabase. Seed or migrate tournament_stages.`;
          break;
        }
      }
    }

    const selection = resolveKnockoutSelectionParticipantId(
      myParticipants.map((p) => ({
        id: p.id,
        pool_id: p.pool_id,
        pool_lock_at: p.pools?.lock_at ?? null,
        pool_name: p.pools?.name ?? undefined,
        is_simulation: Boolean(p.pools?.is_simulation),
        archived_at: p.pools?.archived_at ?? null,
      })),
      participantParam,
    );
    paramId = selection.paramId;
    invalidQuery = selection.invalidQuery;
    invalidOtherProfile = selection.invalidOtherProfile;
    selectedId = selection.selectedId;

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
        selectedPoolId = row.pool_id;
        selectedLockAt = row.pools?.lock_at ?? null;
        if (row.pools) {
          selectedPoolPayment = mapPoolPaymentRow({
            payment_type: row.pools.payment_type ?? "free",
            entry_fee_label: row.pools.entry_fee_label,
            entry_fee_amount: row.pools.entry_fee_amount,
            payment_instructions: row.pools.payment_instructions,
            entry_fee_cents: row.pools.entry_fee_cents,
            currency_code: row.pools.currency_code,
            show_pot_to_participants: row.pools.show_pot_to_participants,
          });
        }
        const selectedEditionId = row.pools?.tournament_edition_id ?? null;
        const r32Stage = stages.find((s) => s.code === "round_of_32");
        if (!loadError && r32Stage && selectedEditionId) {
          knockoutBracketPicksUnlocked = await fetchOfficialRoundOf32Complete(
            supabase,
            r32Stage.id,
            selectedEditionId,
          );
        }

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
          teams,
          groupTeamCountryCodesByLetter,
        })
      : [];

  const profileLinkItems = myParticipants.map((p) => ({
    id: p.id,
    displayName: p.display_name,
    poolName: p.pools?.name ?? "Pool",
    picksLocked: poolLocked(p.pools?.lock_at),
  }));

  return {
    loadError,
    myParticipants,
    invalidQuery,
    invalidOtherProfile,
    paramId,
    selectedId,
    selectedParticipant,
    selectedPoolName,
    selectedPoolId,
    selectedLockAt,
    selectedPoolPayment,
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
