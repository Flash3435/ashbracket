import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPoolAdminIdentity } from "@/lib/pools/formatPoolAdminIdentity";

export type PoolAdminAuditLogFilter =
  | "all"
  | "membership"
  | "invites"
  | "ownership";

export type PoolAdminAuditLogEntry = {
  id: string;
  createdAt: string;
  action: string;
  actionLabel: string;
  actorUserId: string | null;
  actorLabel: string;
  targetUserId: string | null;
  targetEmail: string | null;
  targetLabel: string;
  metadata: Record<string, unknown> | null;
  metadataSummary: string | null;
};

const INVITE_ACTIONS = new Set<string>([
  "create_pending_invite",
  "claim_invite",
  "revoke_invite",
  "resend_invite",
]);

const OWNERSHIP_ACTIONS = new Set<string>([
  "ownership_transfer_promote",
  "ownership_transfer_demote",
]);

function isOwnershipAction(action: string, metadata: Record<string, unknown> | null): boolean {
  if (OWNERSHIP_ACTIONS.has(action)) return true;
  if (!metadata) return false;
  if (metadata.intent === "ownership_transfer") return true;
  if (action === "role_change") {
    const from = metadata.from;
    const to = metadata.to;
    if (from === "admin" && to === "owner") return true;
    if (from === "owner" && to === "admin") return true;
  }
  return false;
}

function passesFilter(
  filter: PoolAdminAuditLogFilter,
  action: string,
  metadata: Record<string, unknown> | null,
): boolean {
  if (filter === "all") return true;
  if (filter === "invites") return INVITE_ACTIONS.has(action);
  if (filter === "ownership") return isOwnershipAction(action, metadata);
  if (filter === "membership") return !INVITE_ACTIONS.has(action);
  return true;
}

function humanActionLabel(action: string, metadata: Record<string, unknown> | null): string {
  switch (action) {
    case "add_existing_admin":
      return "Add existing admin";
    case "create_pending_invite":
      return "Create pending invite";
    case "claim_invite":
      return "Claim invite";
    case "remove_admin":
      return "Remove admin";
    case "revoke_invite":
      return "Revoke invite";
    case "resend_invite":
      return "Resend invite";
    case "ownership_transfer_promote":
      return "Transfer ownership (new owner)";
    case "ownership_transfer_demote":
      return "Transfer ownership (prior owner stepped down)";
    case "role_change": {
      const from = metadata?.from != null ? String(metadata.from) : "?";
      const to = metadata?.to != null ? String(metadata.to) : "?";
      const intent = metadata?.intent === "ownership_transfer" ? " (ownership transfer)" : "";
      return `Role change: ${from} → ${to}${intent}`;
    }
    default:
      return action.replace(/_/g, " ");
  }
}

function summarizeMetadata(
  action: string,
  metadata: Record<string, unknown> | null,
): string | null {
  if (!metadata || Object.keys(metadata).length === 0) return null;
  const parts: string[] = [];
  if (typeof metadata.role === "string") parts.push(`role: ${metadata.role}`);
  if (typeof metadata.invited_role === "string")
    parts.push(`invited role: ${metadata.invited_role}`);
  if (metadata.email_sent != null) parts.push(`email sent: ${String(metadata.email_sent)}`);
  if (typeof metadata.source === "string" && metadata.source === "add_by_email") {
    parts.push("via add-by-email");
  }
  if (typeof metadata.invite_id === "string") parts.push(`invite id: ${metadata.invite_id.slice(0, 8)}…`);

  if (parts.length === 0) {
    try {
      const compact = JSON.stringify(metadata);
      return compact.length > 120 ? `${compact.slice(0, 117)}…` : compact;
    } catch {
      return null;
    }
  }
  return parts.join(" · ");
}

type ParticipantRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
};

function labelForUser(
  userId: string | null,
  emailFallback: string | null,
  map: Map<string, ParticipantRow>,
): string {
  if (!userId) {
    const e = emailFallback?.trim();
    return e || "—";
  }
  const p = map.get(userId);
  if (p) {
    const displayName = p.display_name?.trim() || null;
    const email = p.email?.trim() || null;
    return formatPoolAdminIdentity({
      displayName,
      email,
      userId,
    });
  }
  const e = emailFallback?.trim();
  if (e) return e;
  return userId.length > 12 ? `User ${userId.slice(0, 8)}…` : `User ${userId}`;
}

/**
 * Pool-scoped audit rows (newest first). Call only after access checks
 * (`assertCanManagePoolAdmins` / pool owner or global admin); enforces no cross-pool reads
 * by requiring `poolId` on every query.
 */
export async function listPoolAdminAuditLog(
  supabase: SupabaseClient,
  poolId: string,
  options?: {
    limit?: number;
    filter?: PoolAdminAuditLogFilter;
  },
): Promise<PoolAdminAuditLogEntry[]> {
  const trimmed = poolId.trim();
  const limit = Math.min(Math.max(options?.limit ?? 200, 1), 500);
  const filter = options?.filter ?? "all";

  const { data: rows, error } = await supabase
    .from("pool_admin_audit_log")
    .select(
      "id, created_at, actor_user_id, target_user_id, target_email, action, metadata",
    )
    .eq("pool_id", trimmed)
    .order("created_at", { ascending: false })
    .limit(filter === "all" ? limit : 500);

  if (error) throw new Error(error.message);

  const raw = rows ?? [];
  const userIds = new Set<string>();
  for (const r of raw) {
    const a = r.actor_user_id as string | null;
    const t = r.target_user_id as string | null;
    if (a) userIds.add(a);
    if (t) userIds.add(t);
  }

  const idList = [...userIds];
  let participantByUser = new Map<string, ParticipantRow>();
  if (idList.length > 0) {
    const { data: parts, error: pErr } = await supabase
      .from("participants")
      .select("user_id, display_name, email")
      .eq("pool_id", trimmed)
      .in("user_id", idList);
    if (pErr) throw new Error(pErr.message);
    participantByUser = new Map(
      (parts ?? []).map((p) => [
        p.user_id as string,
        {
          user_id: p.user_id as string,
          display_name: p.display_name as string | null,
          email: p.email as string | null,
        },
      ]),
    );
  }

  const out: PoolAdminAuditLogEntry[] = [];
  for (const r of raw) {
    const action = String(r.action ?? "");
    const meta =
      r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
        ? (r.metadata as Record<string, unknown>)
        : null;

    if (!passesFilter(filter, action, meta)) continue;

    const targetEmail = r.target_email != null ? String(r.target_email).trim() : null;
    const actorLabel = labelForUser(
      r.actor_user_id as string | null,
      null,
      participantByUser,
    );
    const targetLabel = labelForUser(
      r.target_user_id as string | null,
      targetEmail,
      participantByUser,
    );

    out.push({
      id: r.id as string,
      createdAt: r.created_at as string,
      action,
      actionLabel: humanActionLabel(action, meta),
      actorUserId: r.actor_user_id as string | null,
      actorLabel,
      targetUserId: r.target_user_id as string | null,
      targetEmail,
      targetLabel,
      metadata: meta,
      metadataSummary: summarizeMetadata(action, meta),
    });

    if (out.length >= limit) break;
  }

  return out;
}

export function parsePoolAdminAuditLogFilter(
  raw: string | undefined,
): PoolAdminAuditLogFilter {
  if (
    raw === "invites" ||
    raw === "membership" ||
    raw === "ownership"
  ) {
    return raw;
  }
  return "all";
}
