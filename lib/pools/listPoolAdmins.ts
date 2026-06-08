import type { SupabaseClient } from "@supabase/supabase-js";

export type PoolAdminListEntry = {
  membershipId: string;
  userId: string;
  role: "owner" | "admin";
  createdAt: string;
  /** From `participants` in this pool when linked; otherwise null. */
  displayName: string | null;
  email: string | null;
};

/**
 * Lists `pool_admins` for a pool and enriches with participant display/email when available.
 * Call only after access checks (e.g. `requireManagedPool`).
 */
export async function listPoolAdmins(
  supabase: SupabaseClient,
  poolId: string,
): Promise<PoolAdminListEntry[]> {
  const trimmed = poolId.trim();
  const { data: rows, error } = await supabase
    .from("pool_admins")
    .select("id, user_id, role, created_at")
    .eq("pool_id", trimmed)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  const list = rows ?? [];
  if (list.length === 0) return [];

  const userIds = list.map((r) => r.user_id as string);
  const { data: parts, error: pErr } = await supabase
    .from("participants")
    .select("user_id, display_name, email")
    .eq("pool_id", trimmed)
    .in("user_id", userIds);

  if (pErr) throw new Error(pErr.message);

  const byUser = new Map<
    string,
    { display_name: string; email: string | null }
  >();
  for (const p of parts ?? []) {
    const uid = p.user_id as string | null;
    if (!uid || byUser.has(uid)) continue;
    byUser.set(uid, {
      display_name: String(p.display_name ?? "").trim(),
      email: p.email != null ? String(p.email).trim() : null,
    });
  }

  return list.map((r) => {
    const uid = r.user_id as string;
    const part = byUser.get(uid);
    const role = r.role === "owner" ? "owner" : "admin";
    return {
      membershipId: r.id as string,
      userId: uid,
      role,
      createdAt: r.created_at as string,
      displayName: part?.display_name ? part.display_name : null,
      email: part?.email ?? null,
    };
  });
}
