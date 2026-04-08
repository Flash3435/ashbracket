"use server";

import { assertCanManagePool } from "@/lib/admin/assertCanManagePool";
import { createClient } from "@/lib/supabase/server";
import { recomputePoolLedgerForPool } from "@/lib/scoring/recomputePoolLedger";
import { applyParticipantPickSlots } from "../../../lib/predictions/applyParticipantPickSlots";
import { validateKnockoutPickSaveInput } from "../../../lib/predictions/validateKnockoutPickPayload";
import { revalidatePath } from "next/cache";
import type {
  ParticipantPickSlotPayload,
  SaveKnockoutPicksResult,
} from "../../../types/knockoutPicksSave";

function messageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

export async function saveParticipantKnockoutPicksAction(input: {
  poolId: string;
  participantId: string;
  slots: ParticipantPickSlotPayload[];
}): Promise<SaveKnockoutPicksResult> {
  const invalid = validateKnockoutPickSaveInput({
    participantId: input.participantId,
    slots: input.slots,
  });
  if (invalid) return invalid;

  try {
    const supabase = await createClient();
    const gate = await assertCanManagePool(supabase, input.poolId);
    if (!gate.ok) return { ok: false, error: gate.error };

    const poolId = input.poolId.trim();

    const { data: participant, error: parErr } = await supabase
      .from("participants")
      .select("id")
      .eq("id", input.participantId)
      .eq("pool_id", poolId)
      .maybeSingle();

    if (parErr) return { ok: false, error: parErr.message };
    if (!participant) {
      return { ok: false, error: "Participant not found in this pool." };
    }

    const applied = await applyParticipantPickSlots(supabase, {
      poolId,
      participantId: input.participantId,
      slots: input.slots,
    });
    if (!applied.ok) return applied;

    const ledger = await recomputePoolLedgerForPool(poolId);
    if (ledger.error) {
      return {
        ok: false,
        error: `Picks saved, but the leaderboard could not be updated: ${ledger.error}`,
      };
    }

    revalidatePath(`/admin/pools/${poolId}/picks`);
    revalidatePath(`/participant/${input.participantId}`);

    return { ok: true };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}
