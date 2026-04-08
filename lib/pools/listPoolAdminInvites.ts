import type { SupabaseClient } from "@supabase/supabase-js";

export type PoolAdminInviteListEntry = {
  id: string;
  invitedEmail: string;
  role: "owner" | "admin";
  invitedByUserId: string | null;
  createdAt: string;
  claimedAt: string | null;
  revokedAt: string | null;
  claimedByUserId: string | null;
  inviteLastSentAt: string | null;
};

export type PoolAdminInviteStatus = "pending" | "claimed" | "revoked";

export function poolAdminInviteStatus(
  row: Pick<
    PoolAdminInviteListEntry,
    "claimedAt" | "revokedAt"
  >,
): PoolAdminInviteStatus {
  if (row.revokedAt) return "revoked";
  if (row.claimedAt) return "claimed";
  return "pending";
}

/**
 * Lists pool admin invites for a pool (all states). Call after access checks.
 */
export async function listPoolAdminInvites(
  supabase: SupabaseClient,
  poolId: string,
): Promise<PoolAdminInviteListEntry[]> {
  const trimmed = poolId.trim();
  const { data, error } = await supabase
    .from("pool_admin_invites")
    .select(
      "id, invited_email, role, invited_by_user_id, created_at, claimed_at, revoked_at, claimed_by_user_id, invite_last_sent_at",
    )
    .eq("pool_id", trimmed)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id as string,
    invitedEmail: r.invited_email as string,
    role: r.role === "owner" ? "owner" : "admin",
    invitedByUserId: (r.invited_by_user_id as string | null) ?? null,
    createdAt: r.created_at as string,
    claimedAt: (r.claimed_at as string | null) ?? null,
    revokedAt: (r.revoked_at as string | null) ?? null,
    claimedByUserId: (r.claimed_by_user_id as string | null) ?? null,
    inviteLastSentAt: (r.invite_last_sent_at as string | null) ?? null,
  }));
}
