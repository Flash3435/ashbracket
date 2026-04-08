import type { SupabaseClient } from "@supabase/supabase-js";
import { canManagePoolAdmins } from "../auth/permissions";

export type AssertCanManagePoolAdminsResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Server-side guard for pool_admins membership mutations (add/remove/role change).
 * Pool operators without owner/global scope cannot pass.
 */
export async function assertCanManagePoolAdmins(
  supabase: SupabaseClient,
  poolId: string,
): Promise<AssertCanManagePoolAdminsResult> {
  const trimmed = poolId.trim();
  if (!trimmed) {
    return { ok: false, error: "Pool is required." };
  }
  if (!(await canManagePoolAdmins(supabase, trimmed))) {
    return {
      ok: false,
      error: "Only pool owners (or global administrators) can manage pool admins.",
    };
  }
  return { ok: true };
}

/** Same checks as `assertCanManagePoolAdmins` (global admin or pool owner). */
export const requirePoolOwnerOrGlobalAdmin = assertCanManagePoolAdmins;
