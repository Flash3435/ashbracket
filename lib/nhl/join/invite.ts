import type { PoolJoinMutationResult } from "@/lib/join/actions";
import type { SupabaseClient } from "@supabase/supabase-js";

export type NhlPeekInviteResult =
  | {
      ok: true;
      editionId: string;
      editionName: string;
      seasonLabel: string;
      invitedEmail: string | null;
      alreadyClaimed: boolean;
    }
  | { ok: false; message: string };

export async function peekNhlParticipationInviteWithClient(
  supabase: SupabaseClient,
  token: string,
): Promise<NhlPeekInviteResult> {
  const t = token.trim();
  if (t.length < 16) {
    return { ok: false, message: "This invite link is not valid." };
  }

  const { data, error } = await supabase.rpc("peek_nhl_participation_invite", {
    p_token: t,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const editionId = row?.edition_id as string | undefined;
  const editionName = row?.edition_name as string | undefined;
  const seasonLabel = row?.season_label as string | undefined;
  const invitedEmail = (row?.invited_email as string | null | undefined) ?? null;
  const alreadyClaimed = Boolean(row?.already_claimed);

  if (!editionId || !editionName || !seasonLabel) {
    return {
      ok: false,
      message:
        "This NHL invite is not valid anymore. It may have expired, been replaced, or already been used by someone else.",
    };
  }

  return {
    ok: true,
    editionId,
    editionName,
    seasonLabel,
    invitedEmail,
    alreadyClaimed,
  };
}

export async function claimNhlParticipationInviteWithClient(
  supabase: SupabaseClient,
  token: string,
): Promise<PoolJoinMutationResult> {
  const t = token.trim();
  if (t.length < 16) {
    return { ok: false, message: "This invite link is not valid." };
  }

  const { data, error } = await supabase.rpc("claim_nhl_participation_invite", {
    p_token: t,
  });

  if (error) {
    const msg = error.message ?? "";
    const lower = msg.toLowerCase();
    if (lower.includes("sign in with the email")) {
      return {
        ok: false,
        message:
          "This invite was sent to a different email address. Sign in with the invited email, or ask for a new invite.",
      };
    }
    if (lower.includes("invite already used")) {
      return {
        ok: false,
        message: "This invite was already used. If you need access again, ask your organizer for a new link.",
      };
    }
    if (lower.includes("invalid or expired")) {
      return {
        ok: false,
        message: "This invite is invalid or no longer active.",
      };
    }
    return { ok: false, message: msg || "Could not accept this NHL invite." };
  }

  const membershipId = data as string | null;
  if (!membershipId) {
    return { ok: false, message: "Could not complete NHL competition entry." };
  }

  return { ok: true, participantId: membershipId };
}
