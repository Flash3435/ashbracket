import type { SupabaseClient } from "@supabase/supabase-js";
import type { KnockoutPickSlotPayload } from "../../types/knockoutPicksSave";

type ApplyResult = { ok: true } | { ok: false; error: string };

/**
 * Writes knockout pick rows for one participant (delete cleared slots, upsert picks).
 * Caller must enforce auth / pool lock. Uses snake_case columns at the DB boundary.
 */
export async function applyKnockoutPickSlots(
  supabase: SupabaseClient,
  args: {
    poolId: string;
    participantId: string;
    slots: KnockoutPickSlotPayload[];
  },
): Promise<ApplyResult> {
  const { poolId, participantId, slots } = args;

  for (const s of slots) {
    const teamId = s.teamId.trim() || null;

    let del = supabase
      .from("predictions")
      .delete()
      .eq("pool_id", poolId)
      .eq("participant_id", participantId)
      .eq("prediction_kind", s.predictionKind)
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
        prediction_kind: s.predictionKind,
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
