"use server";

import { assertCanManagePool } from "@/lib/admin/assertCanManagePool";
import { createClient } from "@/lib/supabase/server";
import { recomputePoolLedgerForPool } from "@/lib/scoring/recomputePoolLedger";
import { applyParticipantPickSlots } from "../../../../lib/predictions/applyParticipantPickSlots";
import { validateKnockoutPickSaveInput } from "../../../../lib/predictions/validateKnockoutPickPayload";
import {
  savePicksSuccess,
  savePicksUnexpectedError,
} from "../../../../lib/predictions/participantPicksSaveFlow";
import { revalidatePath } from "next/cache";
import type {
  ParticipantPickSlotPayload,
  SaveKnockoutPicksResult,
} from "../../../../types/knockoutPicksSave";

function messageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

/**
 * Use from pool-scoped admin UI with `.bind(null, poolId)` so the client wizard
 * receives a serializable server action (do not wrap the save action in an
 * inline arrow in a Server Component).
 */
export async function saveParticipantKnockoutPicksForPoolAction(
  poolId: string,
  input: {
    participantId: string;
    slots: ParticipantPickSlotPayload[];
  },
): Promise<SaveKnockoutPicksResult> {
  return saveParticipantKnockoutPicksAction({
    poolId,
    participantId: input.participantId,
    slots: input.slots,
  });
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
    if (!gate.ok) return savePicksUnexpectedError(gate.error);

    const poolId = input.poolId.trim();

    const { data: participant, error: parErr } = await supabase
      .from("participants")
      .select("id")
      .eq("id", input.participantId)
      .eq("pool_id", poolId)
      .maybeSingle();

    if (parErr) return savePicksUnexpectedError(parErr.message);
    if (!participant) {
      return savePicksUnexpectedError("Participant not found in this pool.");
    }

    const applied = await applyParticipantPickSlots(supabase, {
      poolId,
      participantId: input.participantId,
      slots: input.slots,
    });
    if (!applied.ok) return savePicksUnexpectedError(applied.error);

    const ledger = await recomputePoolLedgerForPool(poolId, {
      ledgerTrigger: "admin_pick_edit",
    });
    if (ledger.error) {
      return savePicksSuccess(
        `Picks saved, but the leaderboard could not be updated: ${ledger.error}`,
      );
    }

    revalidatePath(`/admin/pools/${poolId}/picks`);
    revalidatePath(`/participant/${input.participantId}`);

    return savePicksSuccess();
  } catch (e) {
    return savePicksUnexpectedError(messageFromUnknown(e));
  }
}
