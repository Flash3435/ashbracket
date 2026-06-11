import type { SupabaseClient } from "@supabase/supabase-js";
import type { ManagedPoolRow } from "./fetchManagedPoolsForViewer";

/**
 * Pools the session user directly manages via `pool_admins` or `pools.created_by_user_id`.
 * Unlike `fetchManagedPoolsForCurrentUser`, global app admins do not receive every pool.
 */
export async function fetchDirectlyManagedPoolsForCurrentUser(
  supabase: SupabaseClient,
): Promise<{ data: ManagedPoolRow[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc("ashbracket_list_directly_managed_pools");
  if (error) {
    return { data: null, error: error.message };
  }
  return { data: (data as ManagedPoolRow[] | null) ?? [], error: null };
}

/** True when the user has pool_admins membership or created the pool. */
export function userDirectlyManagesPool(
  pool: Pick<ManagedPoolRow, "id"> & { created_by_user_id?: string | null },
  userId: string,
  poolAdminMembershipIds: Set<string>,
): boolean {
  return poolAdminMembershipIds.has(pool.id) || pool.created_by_user_id === userId;
}

/** Keeps pools with explicit pool_admins membership and/or creator ownership. */
export function filterPoolsToDirectPoolManagement<
  T extends Pick<ManagedPoolRow, "id"> & { created_by_user_id?: string | null },
>(pools: T[], poolAdminMembershipIds: Set<string>, userId: string): T[] {
  return pools.filter((pool) =>
    userDirectlyManagesPool(pool, userId, poolAdminMembershipIds),
  );
}

/** @deprecated Use `filterPoolsToDirectPoolManagement` (pool_admins ids only). */
export function filterPoolsToDirectAdminMembership<T extends { id: string }>(
  pools: T[],
  directAdminPoolIds: Set<string>,
): T[] {
  return pools.filter((pool) => directAdminPoolIds.has(pool.id));
}
