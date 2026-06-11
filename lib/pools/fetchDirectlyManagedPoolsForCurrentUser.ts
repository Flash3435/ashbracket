import type { SupabaseClient } from "@supabase/supabase-js";
import type { ManagedPoolRow } from "./fetchManagedPoolsForViewer";

/**
 * Pools where the session user has an explicit `pool_admins` row (any role).
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

/** Keeps only pools with explicit pool_admins membership (for tests and client-side filtering). */
export function filterPoolsToDirectAdminMembership<T extends { id: string }>(
  pools: T[],
  directAdminPoolIds: Set<string>,
): T[] {
  return pools.filter((pool) => directAdminPoolIds.has(pool.id));
}
