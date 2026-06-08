import type { SupabaseClient } from "@supabase/supabase-js";
import type { ManagedPoolRow } from "./fetchManagedPoolsForViewer";

export type UserDirectPoolInvolvement = {
  adminPoolIds: Set<string>;
  participantPoolIds: Set<string>;
};

/** Pools the viewer created, organizes, or joined (not global-admin-only oversight). */
export function isPoolDirectlyInvolved(
  pool: Pick<ManagedPoolRow, "id" | "created_by_user_id">,
  userId: string,
  involvement: UserDirectPoolInvolvement,
): boolean {
  return (
    pool.created_by_user_id === userId ||
    involvement.adminPoolIds.has(pool.id) ||
    involvement.participantPoolIds.has(pool.id)
  );
}

export function splitManagedPoolsForAdminHome(
  pools: ManagedPoolRow[],
  userId: string,
  involvement: UserDirectPoolInvolvement,
): {
  directPools: ManagedPoolRow[];
  otherAdminVisiblePools: ManagedPoolRow[];
} {
  const directPools: ManagedPoolRow[] = [];
  const otherAdminVisiblePools: ManagedPoolRow[] = [];

  for (const pool of pools) {
    if (isPoolDirectlyInvolved(pool, userId, involvement)) {
      directPools.push(pool);
    } else {
      otherAdminVisiblePools.push(pool);
    }
  }

  const byName = (a: ManagedPoolRow, b: ManagedPoolRow) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

  directPools.sort(byName);
  otherAdminVisiblePools.sort(byName);

  return { directPools, otherAdminVisiblePools };
}

export async function fetchUserDirectPoolInvolvement(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  involvement: UserDirectPoolInvolvement | null;
  error: string | null;
}> {
  const [adminsRes, participantsRes] = await Promise.all([
    supabase.from("pool_admins").select("pool_id").eq("user_id", userId),
    supabase.from("participants").select("pool_id").eq("user_id", userId),
  ]);

  if (adminsRes.error) {
    return { involvement: null, error: adminsRes.error.message };
  }
  if (participantsRes.error) {
    return { involvement: null, error: participantsRes.error.message };
  }

  return {
    involvement: {
      adminPoolIds: new Set(
        (adminsRes.data ?? []).map((r) => r.pool_id as string),
      ),
      participantPoolIds: new Set(
        (participantsRes.data ?? []).map((r) => r.pool_id as string),
      ),
    },
    error: null,
  };
}
