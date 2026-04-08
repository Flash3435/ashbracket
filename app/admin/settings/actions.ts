"use server";

import { assertCanManagePool } from "@/lib/admin/assertCanManagePool";
import { revalidatePoolAdminPaths } from "@/lib/admin/revalidatePoolAdminPaths";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  mapPoolSettingsRow,
  type PoolSettingsEditable,
  type PoolSettingsRow,
} from "../../../lib/pools/poolSettingsDb";

export type PoolSettingsActionResult =
  | { ok: true; pool: PoolSettingsEditable }
  | { ok: false; error: string };

function messageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

export async function updatePoolSettingsAction(input: {
  poolId: string;
  name: string;
  isPublic: boolean;
  lockAt: string | null;
}): Promise<PoolSettingsActionResult> {
  try {
    const name = input.name.trim();
    if (!name) {
      return { ok: false, error: "Pool name is required." };
    }

    const supabase = await createClient();
    const gate = await assertCanManagePool(supabase, input.poolId);
    if (!gate.ok) return { ok: false, error: gate.error };

    const { data, error } = await supabase
      .from("pools")
      .update({
        name,
        is_public: input.isPublic,
        lock_at: input.lockAt,
      })
      .eq("id", input.poolId.trim())
      .select("id, name, is_public, lock_at")
      .single();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Pool not found." };

    revalidatePoolAdminPaths(input.poolId.trim());
    revalidatePath("/rules");

    return { ok: true, pool: mapPoolSettingsRow(data as PoolSettingsRow) };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}
