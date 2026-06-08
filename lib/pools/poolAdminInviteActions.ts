"use server";

import { assertCanManagePoolAdmins } from "@/lib/admin/assertCanManagePoolAdmins";
import { revalidatePoolAdminPaths } from "@/lib/admin/revalidatePoolAdminPaths";
import { createClient } from "@/lib/supabase/server";
import { logPoolAdminAuditEvent } from "@/lib/pools/poolAdminAuditLog";
import { normalizePoolAdminInviteEmail } from "@/lib/pools/normalizePoolAdminInviteEmail";
import { sendPoolAdminInviteEmail } from "@/lib/pools/sendPoolAdminInviteEmail";
import type { PoolAdminActionResult } from "@/lib/pools/poolAdminMembershipActions";

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

export async function revokePoolAdminInviteAction(input: {
  poolId: string;
  inviteId: string;
}): Promise<PoolAdminActionResult> {
  try {
    const supabase = await createClient();
    const gate = await assertCanManagePoolAdmins(supabase, input.poolId);
    if (!gate.ok) return { ok: false, error: gate.error };

    const poolId = input.poolId.trim();
    const inviteId = input.inviteId.trim();

    const { data: row, error: fetchErr } = await supabase
      .from("pool_admin_invites")
      .select("id, invited_email, revoked_at, claimed_at")
      .eq("id", inviteId)
      .eq("pool_id", poolId)
      .maybeSingle();
    if (fetchErr) return { ok: false, error: fetchErr.message };
    if (!row) return { ok: false, error: "Invite not found." };

    if (row.claimed_at) {
      return { ok: false, error: "This invite was already accepted." };
    }
    if (row.revoked_at) {
      revalidate(poolId);
      return { ok: true, message: "Invite was already revoked." };
    }

    const { error: upErr } = await supabase
      .from("pool_admin_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", inviteId)
      .eq("pool_id", poolId);
    if (upErr) return { ok: false, error: upErr.message };

    const audit = await logPoolAdminAuditEvent(supabase, {
      poolId,
      targetEmail: row.invited_email as string,
      action: "revoke_invite",
      metadata: { invite_id: inviteId },
    });
    if (!audit.ok) console.error("[revokePoolAdminInviteAction audit]", audit.error);

    revalidate(poolId);
    return { ok: true, message: "Invite revoked." };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

export async function resendPoolAdminInviteAction(input: {
  poolId: string;
  inviteId: string;
}): Promise<PoolAdminActionResult> {
  try {
    const supabase = await createClient();
    const gate = await assertCanManagePoolAdmins(supabase, input.poolId);
    if (!gate.ok) return { ok: false, error: gate.error };

    const poolId = input.poolId.trim();
    const inviteId = input.inviteId.trim();

    const { data: row, error: fetchErr } = await supabase
      .from("pool_admin_invites")
      .select("id, invited_email, role, revoked_at, claimed_at")
      .eq("id", inviteId)
      .eq("pool_id", poolId)
      .maybeSingle();
    if (fetchErr) return { ok: false, error: fetchErr.message };
    if (!row) return { ok: false, error: "Invite not found." };

    if (row.claimed_at) {
      return { ok: false, error: "This invite was already accepted." };
    }
    if (row.revoked_at) {
      return { ok: false, error: "This invite was revoked." };
    }

    const email = row.invited_email as string;
    const role = row.role === "owner" ? "owner" : "admin";
    const poolName = await loadPoolName(supabase, poolId);

    const send = await sendPoolAdminInviteEmail({
      toEmail: email,
      poolName,
      role,
    });

    const { error: upErr } = await supabase
      .from("pool_admin_invites")
      .update({ invite_last_sent_at: new Date().toISOString() })
      .eq("id", inviteId)
      .eq("pool_id", poolId);
    if (upErr) return { ok: false, error: upErr.message };

    const audit = await logPoolAdminAuditEvent(supabase, {
      poolId,
      targetEmail: email,
      action: "resend_invite",
      metadata: {
        invite_id: inviteId,
        email_sent: send.ok,
        email_skipped: send.ok === false && "skipped" in send && send.skipped,
      },
    });
    if (!audit.ok) console.error("[resendPoolAdminInviteAction audit]", audit.error);

    revalidate(poolId);

    if (!send.ok) {
      if ("skipped" in send && send.skipped) {
        return {
          ok: true,
          message:
            "Invite updated (email is not configured — copy the pool link manually or set RESEND_API_KEY).",
        };
      }
      return {
        ok: true,
        message: `Invite noted; email failed: ${send.error}`,
      };
    }

    return { ok: true, message: "Invitation email sent." };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}
