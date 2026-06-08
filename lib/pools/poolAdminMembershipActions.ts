"use server";

import { assertCanManagePoolAdmins } from "@/lib/admin/assertCanManagePoolAdmins";
import { revalidatePoolAdminPaths } from "@/lib/admin/revalidatePoolAdminPaths";
import { createClient } from "@/lib/supabase/server";
import { logPoolAdminAuditEvent } from "@/lib/pools/poolAdminAuditLog";
import { normalizePoolAdminInviteEmail } from "@/lib/pools/normalizePoolAdminInviteEmail";
import { sendPoolAdminInviteEmail } from "@/lib/pools/sendPoolAdminInviteEmail";

export type PoolAdminActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

function messageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

function revalidate(poolId: string) {
  revalidatePoolAdminPaths(poolId);
}

async function loadPoolName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  poolId: string,
): Promise<string> {
  const { data } = await supabase
    .from("pools")
    .select("name")
    .eq("id", poolId)
    .maybeSingle();
  return (data?.name as string | undefined)?.trim() || "Pool";
}

async function countOwners(
  supabase: Awaited<ReturnType<typeof createClient>>,
  poolId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("pool_admins")
    .select("id", { count: "exact", head: true })
    .eq("pool_id", poolId)
    .eq("role", "owner");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function addPoolAdminAction(input: {
  poolId: string;
  email: string;
  role: "owner" | "admin";
}): Promise<PoolAdminActionResult> {
  try {
    const supabase = await createClient();
    const gate = await assertCanManagePoolAdmins(supabase, input.poolId);
    if (!gate.ok) return { ok: false, error: gate.error };

    const poolId = input.poolId.trim();
    const role = input.role === "owner" ? "owner" : "admin";
    const normalized = normalizePoolAdminInviteEmail(input.email);
    if (normalized.length < 3) {
      return { ok: false, error: "Enter a valid email address." };
    }

    const { data: targetUserId, error: lookupErr } = await supabase.rpc(
      "ashbracket_find_user_id_by_email_for_pool",
      { p_pool_id: poolId, p_email: normalized },
    );
    if (lookupErr) return { ok: false, error: lookupErr.message };

    if (targetUserId) {
      const uid = targetUserId as string;

      const { data: existing, error: exErr } = await supabase
        .from("pool_admins")
        .select("id, role")
        .eq("pool_id", poolId)
        .eq("user_id", uid)
        .maybeSingle();
      if (exErr) return { ok: false, error: exErr.message };

      if (existing) {
        const row = existing as { id: string; role: string };
        if (row.role === role) {
          revalidate(poolId);
          return { ok: true, message: "That user is already in this role." };
        }
        const prevRole = row.role;
        const { error: upErr } = await supabase
          .from("pool_admins")
          .update({ role })
          .eq("id", row.id);
        if (upErr) return { ok: false, error: upErr.message };

        const audit = await logPoolAdminAuditEvent(supabase, {
          poolId,
          targetUserId: uid,
          targetEmail: normalized,
          action: "role_change",
          metadata: { from: prevRole, to: role, source: "add_by_email" },
        });
        if (!audit.ok) console.error("[addPoolAdminAction audit]", audit.error);

        revalidate(poolId);
        return { ok: true, message: "Updated this user’s role." };
      }

      const { error: insErr } = await supabase.from("pool_admins").insert({
        pool_id: poolId,
        user_id: uid,
        role,
      });
      if (insErr) return { ok: false, error: insErr.message };

      const audit = await logPoolAdminAuditEvent(supabase, {
        poolId,
        targetUserId: uid,
        targetEmail: normalized,
        action: "add_existing_admin",
        metadata: { role },
      });
      if (!audit.ok) console.error("[addPoolAdminAction audit]", audit.error);

      revalidate(poolId);
      return { ok: true, message: "Added as pool admin." };
    }

    const { data: pendingDup, error: dupErr } = await supabase
      .from("pool_admin_invites")
      .select("id")
      .eq("pool_id", poolId)
      .eq("invited_email", normalized)
      .is("claimed_at", null)
      .is("revoked_at", null)
      .maybeSingle();
    if (dupErr) return { ok: false, error: dupErr.message };
    if (pendingDup) {
      return {
        ok: false,
        error:
          "There is already a pending invite for that email. Revoke it first or wait until it is accepted.",
      };
    }

    const {
      data: { user: actor },
    } = await supabase.auth.getUser();

    const { error: invErr } = await supabase.from("pool_admin_invites").insert({
      pool_id: poolId,
      invited_email: normalized,
      role,
      invited_by_user_id: actor?.id ?? null,
    });

    if (invErr) {
      if (invErr.code === "23505") {
        return {
          ok: false,
          error:
            "A pending invite for that email already exists for this pool.",
        };
      }
      return { ok: false, error: invErr.message };
    }

    const audit = await logPoolAdminAuditEvent(supabase, {
      poolId,
      targetEmail: normalized,
      action: "create_pending_invite",
      metadata: { role },
    });
    if (!audit.ok) console.error("[addPoolAdminAction audit]", audit.error);

    const poolName = await loadPoolName(supabase, poolId);
    const send = await sendPoolAdminInviteEmail({
      toEmail: normalized,
      poolName,
      role,
    });
    if (send.ok) {
      await supabase
        .from("pool_admin_invites")
        .update({ invite_last_sent_at: new Date().toISOString() })
        .eq("pool_id", poolId)
        .eq("invited_email", normalized)
        .is("claimed_at", null)
        .is("revoked_at", null);
    }

    revalidate(poolId);

    let msg =
      "Invitation created. When they sign up or sign in with that email, they will get access automatically.";
    if (!send.ok && "skipped" in send && send.skipped) {
      msg +=
        " Email is not configured on this server; share the login link manually.";
    } else if (!send.ok) {
      msg += ` (Could not send email: ${send.error})`;
    }

    return { ok: true, message: msg };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

export async function updatePoolAdminRoleAction(input: {
  poolId: string;
  membershipId: string;
  role: "owner" | "admin";
}): Promise<PoolAdminActionResult> {
  try {
    const supabase = await createClient();
    const gate = await assertCanManagePoolAdmins(supabase, input.poolId);
    if (!gate.ok) return { ok: false, error: gate.error };

    const poolId = input.poolId.trim();
    const newRole = input.role === "owner" ? "owner" : "admin";

    const { data: row, error: fetchErr } = await supabase
      .from("pool_admins")
      .select("id, user_id, role")
      .eq("id", input.membershipId.trim())
      .eq("pool_id", poolId)
      .maybeSingle();
    if (fetchErr) return { ok: false, error: fetchErr.message };
    if (!row) return { ok: false, error: "That admin row was not found." };

    const prevRole = row.role as string;
    if (prevRole === newRole) {
      return { ok: true, message: "Role unchanged." };
    }

    if (prevRole === "owner" && newRole === "admin") {
      const owners = await countOwners(supabase, poolId);
      if (owners <= 1) {
        return {
          ok: false,
          error:
            "You cannot demote the only owner. Use “Transfer ownership” on the Admins page, or promote another owner first.",
        };
      }
    }

    const { error: upErr } = await supabase
      .from("pool_admins")
      .update({ role: newRole })
      .eq("id", row.id as string)
      .eq("pool_id", poolId);
    if (upErr) return { ok: false, error: upErr.message };

    const audit = await logPoolAdminAuditEvent(supabase, {
      poolId,
      targetUserId: row.user_id as string,
      action: "role_change",
      metadata: { from: prevRole, to: newRole },
    });
    if (!audit.ok) console.error("[updatePoolAdminRoleAction audit]", audit.error);

    revalidate(poolId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

/**
 * Guided ownership transfer: promote an existing non-owner admin to owner, then optionally
 * demote the acting owner to admin. Server-enforced; cannot leave zero owners.
 */
export async function transferPoolOwnershipAction(input: {
  poolId: string;
  targetMembershipId: string;
  /** When true, demote the session user from owner to admin after the target becomes owner (if they hold an owner row in this pool). */
  demoteSelfToAdmin: boolean;
}): Promise<PoolAdminActionResult> {
  try {
    const supabase = await createClient();
    const gate = await assertCanManagePoolAdmins(supabase, input.poolId);
    if (!gate.ok) return { ok: false, error: gate.error };

    const poolId = input.poolId.trim();
    const targetMembershipId = input.targetMembershipId.trim();

    const {
      data: { user: actor },
    } = await supabase.auth.getUser();
    if (!actor) return { ok: false, error: "Not authenticated." };

    const { data: targetRow, error: tErr } = await supabase
      .from("pool_admins")
      .select("id, user_id, role")
      .eq("id", targetMembershipId)
      .eq("pool_id", poolId)
      .maybeSingle();
    if (tErr) return { ok: false, error: tErr.message };
    if (!targetRow) return { ok: false, error: "That admin was not found in this pool." };

    const targetUserId = targetRow.user_id as string;
    const targetRole = targetRow.role as string;

    if (targetUserId === actor.id) {
      return {
        ok: false,
        error: "Choose another admin to receive ownership.",
      };
    }

    if (targetRole === "owner") {
      return {
        ok: false,
        error:
          "That person is already an owner. To step down, use “Step down to admin” after another owner is in place, or pick an admin who is not yet an owner.",
      };
    }

    let targetEmail: string | null = null;
    const { data: tp } = await supabase
      .from("participants")
      .select("email")
      .eq("pool_id", poolId)
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (tp?.email) targetEmail = String(tp.email).trim() || null;

    const { error: upTargetErr } = await supabase
      .from("pool_admins")
      .update({ role: "owner" })
      .eq("id", targetRow.id as string)
      .eq("pool_id", poolId);
    if (upTargetErr) return { ok: false, error: upTargetErr.message };

    const auditPromote = await logPoolAdminAuditEvent(supabase, {
      poolId,
      targetUserId,
      targetEmail,
      action: "ownership_transfer_promote",
      metadata: {
        previous_role: targetRole,
        target_membership_id: targetMembershipId,
      },
    });
    if (!auditPromote.ok) {
      console.error("[transferPoolOwnershipAction audit promote]", auditPromote.error);
    }

    if (input.demoteSelfToAdmin) {
      const { data: actorRow, error: aErr } = await supabase
        .from("pool_admins")
        .select("id, user_id, role")
        .eq("pool_id", poolId)
        .eq("user_id", actor.id)
        .maybeSingle();
      if (aErr) return { ok: false, error: aErr.message };

      if (actorRow && (actorRow.role as string) === "owner") {
        const ownersAfter = await countOwners(supabase, poolId);
        if (ownersAfter < 2) {
          return {
            ok: false,
            error: "Cannot step down: the pool must keep at least one owner.",
          };
        }

        const { error: demErr } = await supabase
          .from("pool_admins")
          .update({ role: "admin" })
          .eq("id", actorRow.id as string)
          .eq("pool_id", poolId);
        if (demErr) return { ok: false, error: demErr.message };

        let actorEmail: string | null = null;
        const { data: ap } = await supabase
          .from("participants")
          .select("email")
          .eq("pool_id", poolId)
          .eq("user_id", actor.id)
          .maybeSingle();
        if (ap?.email) actorEmail = String(ap.email).trim() || null;

        const auditDemote = await logPoolAdminAuditEvent(supabase, {
          poolId,
          targetUserId: actor.id,
          targetEmail: actorEmail,
          action: "ownership_transfer_demote",
          metadata: {
            previous_role: "owner",
            prior_owner_membership_id: actorRow.id,
          },
        });
        if (!auditDemote.ok) {
          console.error("[transferPoolOwnershipAction audit demote]", auditDemote.error);
        }
      }
    }

    revalidate(poolId);
    return {
      ok: true,
      message: input.demoteSelfToAdmin
        ? "Ownership transferred. You are now a pool admin (not owner)."
        : "Ownership transferred. The selected person is now a pool owner. You can step down to admin when ready.",
    };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

export async function removePoolAdminAction(input: {
  poolId: string;
  membershipId: string;
}): Promise<PoolAdminActionResult> {
  try {
    const supabase = await createClient();
    const gate = await assertCanManagePoolAdmins(supabase, input.poolId);
    if (!gate.ok) return { ok: false, error: gate.error };

    const poolId = input.poolId.trim();

    const { data: row, error: fetchErr } = await supabase
      .from("pool_admins")
      .select("id, user_id, role")
      .eq("id", input.membershipId.trim())
      .eq("pool_id", poolId)
      .maybeSingle();
    if (fetchErr) return { ok: false, error: fetchErr.message };
    if (!row) return { ok: false, error: "That admin row was not found." };

    if (row.role === "owner") {
      const owners = await countOwners(supabase, poolId);
      if (owners <= 1) {
        return {
          ok: false,
          error:
            "Cannot remove the only pool owner. Add or promote another owner first (or use Transfer ownership), then try again.",
        };
      }
    }

    const { error: delErr } = await supabase
      .from("pool_admins")
      .delete()
      .eq("id", row.id as string)
      .eq("pool_id", poolId);
    if (delErr) return { ok: false, error: delErr.message };

    const audit = await logPoolAdminAuditEvent(supabase, {
      poolId,
      targetUserId: row.user_id as string,
      action: "remove_admin",
      metadata: { previous_role: row.role },
    });
    if (!audit.ok) console.error("[removePoolAdminAction audit]", audit.error);

    revalidate(poolId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}
