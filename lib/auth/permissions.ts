import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * True when the session user is listed in `app_admins` (global administrator).
 * Prefer this name over legacy “app admin” wording in new code.
 */
export async function isGlobalAdmin(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("ashbracket_is_global_admin");
  if (error) {
    console.error("[isGlobalAdmin]", error.message);
    return false;
  }
  return Boolean(data);
}

/** Global admin or pool_admins member for this pool. */
export async function canManagePool(
  supabase: SupabaseClient,
  poolId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("ashbracket_can_manage_pool", {
    target_pool_id: poolId,
  });
  if (error) {
    console.error("[canManagePool]", error.message);
    return false;
  }
  return Boolean(data);
}

/** Global admin or `pool_admins.role = owner` for this pool. */
export async function isPoolOwner(
  supabase: SupabaseClient,
  poolId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("ashbracket_is_pool_owner", {
    target_pool_id: poolId,
  });
  if (error) {
    console.error("[isPoolOwner]", error.message);
    return false;
  }
  return Boolean(data);
}

/**
 * Who may add/remove/promote/demote `pool_admins` rows: global admins or pool owners.
 * Matches `ashbracket_is_pool_owner` (global admins count as owners for authorization).
 */
export async function canManagePoolAdmins(
  supabase: SupabaseClient,
  poolId: string,
): Promise<boolean> {
  return isPoolOwner(supabase, poolId);
}

/**
 * Who may open `/admin` routes: global admins or anyone with a `pool_admins` row.
 */
export async function canAccessAdminDashboard(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== userId) return false;
  if (await isGlobalAdmin(supabase)) return true;
  const { data, error } = await supabase
    .from("pool_admins")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[canAccessAdminDashboard]", error.message);
    return false;
  }
  return data != null;
}
