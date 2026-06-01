"use server";

import { assertCanManagePool } from "@/lib/admin/assertCanManagePool";
import { revalidatePoolAdminPaths } from "@/lib/admin/revalidatePoolAdminPaths";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  mapPoolSettingsRow,
  type PoolSettingsEditable,
  type PoolSettingsRow,
} from "../../../../lib/pools/poolSettingsDb";
import {
  poolPaymentToDbColumns,
  validatePoolPaymentInput,
  type PoolPaymentInput,
} from "../../../../lib/pools/poolPayment";

export type PoolSettingsActionResult =
  | { ok: true; pool: PoolSettingsEditable; paymentWarnings?: string[] }
  | { ok: false; error: string };

function messageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

export async function updatePoolSettingsAction(input: {
  poolId: string;
  name: string;
  isPublic: boolean;
  showPublicRules: boolean;
  lockAt: string | null;
  payment: PoolPaymentInput;
}): Promise<PoolSettingsActionResult> {
  try {
    const name = input.name.trim();
    if (!name) {
      return { ok: false, error: "Pool name is required." };
    }

    const paymentCheck = validatePoolPaymentInput(input.payment);
    if (!paymentCheck.ok) {
      return { ok: false, error: paymentCheck.error };
    }

    const supabase = await createClient();
    const gate = await assertCanManagePool(supabase, input.poolId);
    if (!gate.ok) return { ok: false, error: gate.error };

    const { data, error } = await supabase
      .from("pools")
      .update({
        name,
        is_public: input.isPublic,
        show_public_rules: input.showPublicRules,
        lock_at: input.lockAt,
        ...poolPaymentToDbColumns(paymentCheck.settings),
      })
      .eq("id", input.poolId.trim())
      .select(
        "id, name, is_public, show_public_rules, lock_at, payment_type, entry_fee_label, entry_fee_amount, payment_instructions, entry_fee_cents, currency_code, show_pot_to_participants",
      )
      .single();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Pool not found." };

    revalidatePoolAdminPaths(input.poolId.trim());
    revalidatePath("/rules");

    return {
      ok: true,
      pool: mapPoolSettingsRow(data as PoolSettingsRow),
      paymentWarnings: paymentCheck.warnings,
    };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}
