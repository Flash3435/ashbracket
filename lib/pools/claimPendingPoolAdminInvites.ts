import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Claims pending `pool_admin_invites` for the session user's email (server-side RPC).
 * Idempotent; safe to call after sign-in.
 */
export async function claimPendingPoolAdminInvitesForCurrentUser(
  supabase: SupabaseClient,
): Promise<{ claimedCount: number; error: string | null }> {
  const { data, error } = await supabase.rpc(
    "ashbracket_claim_pending_pool_admin_invites_for_user",
  );
  if (error) {
    return { claimedCount: 0, error: error.message };
  }
  const n = typeof data === "number" ? data : Number(data);
  return { claimedCount: Number.isFinite(n) ? n : 0, error: null };
}
