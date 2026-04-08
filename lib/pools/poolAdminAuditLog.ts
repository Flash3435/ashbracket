import type { SupabaseClient } from "@supabase/supabase-js";

export type PoolAdminAuditAction =
  | "add_existing_admin"
  | "create_pending_invite"
  | "claim_invite"
  | "role_change"
  | "remove_admin"
  | "revoke_invite"
  | "resend_invite"
  /** Target promoted from admin to owner via guided transfer flow */
  | "ownership_transfer_promote"
  /** Prior owner stepped down to admin after transfer */
  | "ownership_transfer_demote";

/**
 * Append-only audit row (RLS: pool owner / global admin, actor = session user).
 */
export async function logPoolAdminAuditEvent(
  supabase: SupabaseClient,
  input: {
    poolId: string;
    targetUserId?: string | null;
    targetEmail?: string | null;
    action: PoolAdminAuditAction | string;
    metadata?: Record<string, unknown> | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated." };
  }

  const { error } = await supabase.from("pool_admin_audit_log").insert({
    pool_id: input.poolId.trim(),
    actor_user_id: user.id,
    target_user_id: input.targetUserId ?? null,
    target_email: input.targetEmail?.trim() ?? null,
    action: input.action,
    metadata: input.metadata ?? null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
