"use server";

import { createClient } from "@/lib/supabase/server";
import { applyKnockoutPickSlots } from "../../../lib/predictions/applyKnockoutPickSlots";
import { validateKnockoutPickSaveInput } from "../../../lib/predictions/validateKnockoutPickPayload";
import { recomputePoolLedgerForPool } from "@/lib/scoring/recomputePoolLedger";
import { revalidatePath } from "next/cache";
import { SAMPLE_POOL_ID } from "../../../lib/config/sample-pool";
import type {
  KnockoutPickSlotPayload,
  SaveKnockoutPicksResult,
} from "../../../types/knockoutPicksSave";

function messageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

export async function saveParticipantKnockoutPicksAction(input: {
  participantId: string;
  slots: KnockoutPickSlotPayload[];
}): Promise<SaveKnockoutPicksResult> {
  const invalid = validateKnockoutPickSaveInput(input);
  if (invalid) return invalid;

  try {
    const supabase = await createClient();

    const { data: participant, error: parErr } = await supabase
      .from("participants")
      .select("id")
      .eq("id", input.participantId)
      .eq("pool_id", SAMPLE_POOL_ID)
      .maybeSingle();

    if (parErr) return { ok: false, error: parErr.message };
    if (!participant) {
      return { ok: false, error: "Participant not found in this pool." };
    }

    const applied = await applyKnockoutPickSlots(supabase, {
      poolId: SAMPLE_POOL_ID,
      participantId: input.participantId,
      slots: input.slots,
    });
    if (!applied.ok) return applied;

    const ledger = await recomputePoolLedgerForPool(SAMPLE_POOL_ID);
    if (ledger.error) {
      return {
        ok: false,
        error: `Picks saved, but standings could not be recomputed: ${ledger.error}`,
      };
    }

    revalidatePath("/admin/picks");
    revalidatePath(`/participant/${input.participantId}`);

    return { ok: true };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}
