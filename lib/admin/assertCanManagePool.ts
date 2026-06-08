import type { SupabaseClient } from "@supabase/supabase-js";
import { canManagePool } from "../auth/permissions";

export type AssertCanManageResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Server-side guard for pool-scoped mutations. Never trust client `poolId` alone.
 */
export async function assertCanManagePool(
  supabase: SupabaseClient,
  poolId: string,
): Promise<AssertCanManageResult> {
  const trimmed = poolId.trim();
  if (!trimmed) {
    return { ok: false, error: "Pool is required." };
  }
  if (!(await canManagePool(supabase, trimmed))) {
    return { ok: false, error: "You do not have access to this pool." };
  }
  return { ok: true };
}
