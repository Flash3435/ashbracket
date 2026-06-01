import type { SupabaseClient } from "@supabase/supabase-js";
import {
  poolPaymentToDbColumns,
  type PoolPaymentSettings,
} from "./poolPayment";

export async function savePoolPaymentSettings(
  supabase: SupabaseClient,
  poolId: string,
  settings: PoolPaymentSettings,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("pools")
    .update(poolPaymentToDbColumns(settings))
    .eq("id", poolId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
