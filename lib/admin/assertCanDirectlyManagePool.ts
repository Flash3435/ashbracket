import type { SupabaseClient } from "@supabase/supabase-js";
import { isDirectPoolAdmin } from "../auth/permissions";
import type { AssertCanManageResult } from "./assertCanManagePool";

/**
 * Server-side guard requiring explicit pool_admins membership.
 * Global app admins are not treated as managers unless they have a pool_admins row.
 */
export async function assertCanDirectlyManagePool(
  supabase: SupabaseClient,
  poolId: string,
): Promise<AssertCanManageResult> {
  const trimmed = poolId.trim();
  if (!trimmed) {
    return { ok: false, error: "Pool is required." };
  }
  if (!(await isDirectPoolAdmin(supabase, trimmed))) {
    return { ok: false, error: "You do not have access to this pool." };
  }
  return { ok: true };
}
