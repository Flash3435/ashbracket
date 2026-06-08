import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParticipantPickSlotPayload } from "../../types/knockoutPicksSave";
import { mapTeamRow } from "../results/mapRows";
import { TEAM_TABLE_SELECT } from "../teams/teamDbSelect";
import { fetchGroupTeamCountryCodesByLetter } from "../tournament/fetchGroupTeamCountryCodesByLetter";
import { normalizeParticipantThirdPlaceSaveSlots } from "./knockoutPickConsistency";

type ApplyResult = { ok: true } | { ok: false; error: string };

/**
 * Writes all tournament pick rows for one participant (group, bracket, bonus).
 * Caller must enforce auth / pool lock.
 */
export async function applyParticipantPickSlots(
  supabase: SupabaseClient,
  args: {
    poolId: string;
    participantId: string;
    slots: ParticipantPickSlotPayload[];
  },
): Promise<ApplyResult> {
  const { poolId, participantId, slots } = args;
  const thirdPlaceSlots = slots.filter(
    (s) => s.predictionKind === "third_place_qualifier",
  );

  let normalizedThirdPlaceSlots: ParticipantPickSlotPayload[] = [];
  if (thirdPlaceSlots.length > 0) {
    const [{ data: teamRows, error: teamsErr }, groupTeamCountryCodesByLetter] =
      await Promise.all([
        supabase.from("teams").select(TEAM_TABLE_SELECT).order("name", {
          ascending: true,
        }),
        fetchGroupTeamCountryCodesByLetter(supabase),
      ]);
    if (teamsErr) return { ok: false, error: teamsErr.message };

    const normalized = normalizeParticipantThirdPlaceSaveSlots({
      slots,
      teams: (teamRows ?? []).map(mapTeamRow),
      groupTeamCountryCodesByLetter,
    });
    if (!normalized.ok) return normalized;

    for (const stageId of normalized.thirdStageIds) {
      const { error: clearErr } = await supabase
        .from("predictions")
        .delete()
        .eq("pool_id", poolId)
        .eq("participant_id", participantId)
        .eq("prediction_kind", "third_place_qualifier")
        .eq("tournament_stage_id", stageId)
        .is("bonus_key", null);
      if (clearErr) return { ok: false, error: clearErr.message };
    }

    normalizedThirdPlaceSlots = normalized.normalizedThirdSlots;
  }

  const writeSlots = [
    ...slots.filter((s) => s.predictionKind !== "third_place_qualifier"),
    ...normalizedThirdPlaceSlots,
  ];

  for (const s of writeSlots) {
    const teamId = s.teamId.trim() || null;
    const kind = s.predictionKind;
    const gc =
      s.groupCode && s.groupCode.trim() !== ""
        ? s.groupCode.trim().toUpperCase()
        : null;
    const bk =
      s.bonusKey && s.bonusKey.trim() !== "" ? s.bonusKey.trim() : null;

    if (kind === "bonus_pick") {
      if (!bk) {
        return { ok: false, error: "Bonus pick is missing a category." };
      }
      const del = supabase
        .from("predictions")
        .delete()
        .eq("pool_id", poolId)
        .eq("participant_id", participantId)
        .eq("prediction_kind", "bonus_pick")
        .eq("tournament_stage_id", s.tournamentStageId)
        .eq("bonus_key", bk)
        .is("group_code", null)
        .is("slot_key", null);

      if (!teamId) {
        const { error } = await del;
        if (error) return { ok: false, error: error.message };
        continue;
      }

      const { error: upErr } = await supabase.from("predictions").upsert(
        {
          pool_id: poolId,
          participant_id: participantId,
          prediction_kind: "bonus_pick",
          tournament_stage_id: s.tournamentStageId,
          group_code: null,
          slot_key: null,
          bonus_key: bk,
          team_id: teamId,
        },
        {
          onConflict:
            "participant_id,pool_id,prediction_kind,tournament_stage_id,group_code,slot_key,bonus_key",
        },
      );
      if (upErr) return { ok: false, error: upErr.message };
      continue;
    }

    if (kind === "group_winner" || kind === "group_runner_up") {
      if (!gc) {
        return { ok: false, error: "Group pick is missing a group code." };
      }
      const del = supabase
        .from("predictions")
        .delete()
        .eq("pool_id", poolId)
        .eq("participant_id", participantId)
        .eq("prediction_kind", kind)
        .eq("tournament_stage_id", s.tournamentStageId)
        .eq("group_code", gc)
        .is("slot_key", null)
        .is("bonus_key", null);

      if (!teamId) {
        const { error } = await del;
        if (error) return { ok: false, error: error.message };
        continue;
      }

      const { error: upErr } = await supabase.from("predictions").upsert(
        {
          pool_id: poolId,
          participant_id: participantId,
          prediction_kind: kind,
          tournament_stage_id: s.tournamentStageId,
          group_code: gc,
          slot_key: null,
          bonus_key: null,
          team_id: teamId,
        },
        {
          onConflict:
            "participant_id,pool_id,prediction_kind,tournament_stage_id,group_code,slot_key,bonus_key",
        },
      );
      if (upErr) return { ok: false, error: upErr.message };
      continue;
    }

    if (kind === "third_place_qualifier") {
      if (!gc) {
        return {
          ok: false,
          error: "Third-place pick is missing its group code.",
        };
      }
      if (!teamId) {
        continue;
      }

      const { error: upErr } = await supabase.from("predictions").upsert(
        {
          pool_id: poolId,
          participant_id: participantId,
          prediction_kind: kind,
          tournament_stage_id: s.tournamentStageId,
          group_code: gc,
          slot_key: null,
          bonus_key: null,
          team_id: teamId,
        },
        {
          onConflict:
            "participant_id,pool_id,prediction_kind,tournament_stage_id,group_code,slot_key,bonus_key",
        },
      );
      if (upErr) return { ok: false, error: upErr.message };
      continue;
    }

    let del = supabase
      .from("predictions")
      .delete()
      .eq("pool_id", poolId)
      .eq("participant_id", participantId)
      .eq("prediction_kind", kind)
      .eq("tournament_stage_id", s.tournamentStageId)
      .is("group_code", null)
      .is("bonus_key", null);

    del =
      s.slotKey === null
        ? del.is("slot_key", null)
        : del.eq("slot_key", s.slotKey);

    if (!teamId) {
      const { error } = await del;
      if (error) return { ok: false, error: error.message };
      continue;
    }

    const { error: upErr } = await supabase.from("predictions").upsert(
      {
        pool_id: poolId,
        participant_id: participantId,
        prediction_kind: kind,
        tournament_stage_id: s.tournamentStageId,
        group_code: null,
        slot_key: s.slotKey,
        bonus_key: null,
        team_id: teamId,
      },
      {
        onConflict:
          "participant_id,pool_id,prediction_kind,tournament_stage_id,group_code,slot_key,bonus_key",
      },
    );

    if (upErr) return { ok: false, error: upErr.message };
  }

  return { ok: true };
}
