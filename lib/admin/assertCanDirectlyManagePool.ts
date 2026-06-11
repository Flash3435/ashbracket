import type { SupabaseClient } from "@supabase/supabase-js";
import { isDirectPoolAdmin } from "../auth/permissions";
import type { AssertCanManageResult } from "./assertCanManagePool";

/**
 * Server-side guard requiring direct pool management (pool_admins or pool creator).
 * Global app admins are not treated as managers unless they have that relationship.
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
