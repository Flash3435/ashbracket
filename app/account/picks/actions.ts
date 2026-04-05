"use server";

import { createClient } from "@/lib/supabase/server";
import { applyKnockoutPickSlots } from "../../../lib/predictions/applyKnockoutPickSlots";
import { validateKnockoutPickSaveInput } from "../../../lib/predictions/validateKnockoutPickPayload";
import { recomputePoolLedgerWithClient } from "@/lib/scoring/recomputePoolLedger";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import type {
  KnockoutPickSlotPayload,
  SaveKnockoutPicksResult,
} from "../../../types/knockoutPicksSave";

function messageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

function poolIsLocked(lockAt: string | null): boolean {
  if (lockAt == null || lockAt === "") return false;
  const t = new Date(lockAt).getTime();
  if (Number.isNaN(t)) return false;
  return t <= Date.now();
}

/**
 * Saves knockout picks for the signed-in user's participant row only (RLS on predictions).
 * Verifies ownership and pool lock server-side, then recomputes ledger via service role.
 */
export async function saveMyKnockoutPicksAction(input: {
  participantId: string;
  slots: KnockoutPickSlotPayload[];
}): Promise<SaveKnockoutPicksResult> {
  const invalid = validateKnockoutPickSaveInput(input);
  if (invalid) return invalid;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: "You must be signed in to save picks." };
    }

    const { data: row, error: parErr } = await supabase
      .from("participants")
      .select("id, pool_id")
      .eq("id", input.participantId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (parErr) return { ok: false, error: parErr.message };
    if (!row) {
      return {
        ok: false,
        error: "That profile was not found or is not linked to your account.",
      };
    }

    const { data: poolRow, error: poolErr } = await supabase
      .from("pools")
      .select("lock_at")
      .eq("id", row.pool_id)
      .maybeSingle();

    if (poolErr) return { ok: false, error: poolErr.message };
    if (poolRow && poolIsLocked(poolRow.lock_at)) {
      return {
        ok: false,
        error:
          "This pool is locked. Your picks can no longer be changed.",
      };
    }

    const applied = await applyKnockoutPickSlots(supabase, {
      poolId: row.pool_id,
      participantId: input.participantId,
      slots: input.slots,
    });
    if (!applied.ok) return applied;

    const service = createServiceRoleClient();
    const ledger = await recomputePoolLedgerWithClient(service, row.pool_id);
    if (ledger.error) {
      return {
        ok: false,
        error: `Picks saved, but standings could not be recomputed: ${ledger.error}`,
      };
    }

    revalidatePath("/account/picks");
    revalidatePath("/account");
    revalidatePath(`/participant/${input.participantId}`);

    return { ok: true };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}
