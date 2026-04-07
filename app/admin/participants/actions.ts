"use server";

import { createClient } from "@/lib/supabase/server";
import { joinInviteUrl } from "@/lib/site-url";
import { generateInviteToken } from "../../../lib/invites/generateInviteToken";
import { sendParticipantInviteEmail } from "../../../lib/invites/sendParticipantInviteEmail";
import { revalidatePath } from "next/cache";
import { SAMPLE_POOL_ID } from "../../../lib/config/sample-pool";
import {
  mapParticipantRow,
  paidAtForInsert,
  type ParticipantRow,
} from "../../../lib/participants/participantsDb";
import type { Participant } from "../../../types/participant";

export type ParticipantActionResult =
  | {
      ok: true;
      participant?: Participant;
      inviteUrl?: string;
      emailSent?: boolean;
      emailMessage?: string;
    }
  | { ok: false; error: string };

function messageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

async function poolNameForSamplePool(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  const { data } = await supabase
    .from("pools")
    .select("name")
    .eq("id", SAMPLE_POOL_ID)
    .maybeSingle();
  return (data?.name as string | undefined)?.trim() || "your pool";
}

export async function createParticipantAction(input: {
  displayName: string;
  email: string;
  paid: boolean;
}): Promise<ParticipantActionResult> {
  try {
    const supabase = await createClient();
    const paidAt = paidAtForInsert(input.paid);
    const { data, error } = await supabase
      .from("participants")
      .insert({
        pool_id: SAMPLE_POOL_ID,
        display_name: input.displayName.trim(),
        email: input.email.trim(),
        is_paid: input.paid,
        paid_at: paidAt,
      })
      .select(
        "id, pool_id, display_name, email, is_paid, paid_at, user_id, invite_pending, invite_last_sent_at",
      )
      .single();

    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/participants");
    revalidatePath("/admin/payments");
    revalidatePath("/");
    return {
      ok: true,
      participant: mapParticipantRow(data as ParticipantRow),
    };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

/**
 * Create a participant row with an active invite link and send the invite email when configured.
 */
export async function inviteParticipantAction(input: {
  displayName: string;
  email: string;
  paid: boolean;
}): Promise<ParticipantActionResult> {
  try {
    const supabase = await createClient();
    const paidAt = paidAtForInsert(input.paid);
    const token = generateInviteToken();
    const sentAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("participants")
      .insert({
        pool_id: SAMPLE_POOL_ID,
        display_name: input.displayName.trim(),
        email: input.email.trim(),
        is_paid: input.paid,
        paid_at: paidAt,
        invite_token: token,
        invite_last_sent_at: sentAt,
      })
      .select(
        "id, pool_id, display_name, email, is_paid, paid_at, user_id, invite_pending, invite_last_sent_at",
      )
      .single();

    if (error) return { ok: false, error: error.message };

    const poolName = await poolNameForSamplePool(supabase);
    const inviteUrl = joinInviteUrl(token);
    const mail = await sendParticipantInviteEmail({
      to: input.email.trim(),
      poolName,
      displayName: input.displayName.trim(),
      inviteUrl,
    });

    revalidatePath("/admin/participants");
    revalidatePath("/admin/payments");
    revalidatePath("/");

    let emailMessage: string | undefined;
    if (!mail.ok) {
      emailMessage = mail.skipped
        ? "Invite link is ready — email is not configured, so copy the link below."
        : mail.error;
    }

    return {
      ok: true,
      participant: mapParticipantRow(data as ParticipantRow),
      inviteUrl,
      emailSent: mail.ok,
      emailMessage,
    };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

/**
 * Send or resend the invite for an unclaimed row. Creates a token if this was a manual entry.
 */
export async function sendParticipantInviteAction(
  participantId: string,
): Promise<ParticipantActionResult> {
  try {
    const supabase = await createClient();
    const { data: row, error: fetchErr } = await supabase
      .from("participants")
      .select(
        "id, pool_id, display_name, email, user_id, invite_token, invite_last_sent_at",
      )
      .eq("id", participantId)
      .eq("pool_id", SAMPLE_POOL_ID)
      .maybeSingle();

    if (fetchErr) return { ok: false, error: fetchErr.message };
    if (!row) return { ok: false, error: "Participant not found." };

    const userId = row.user_id as string | null;
    if (userId) {
      return { ok: false, error: "This person has already joined." };
    }

    const email = (row.email as string | null)?.trim() ?? "";
    if (!email) {
      return {
        ok: false,
        error: "Add an email address before sending an invite.",
      };
    }

    let token = row.invite_token as string | null;
    const now = new Date().toISOString();
    if (!token) {
      token = generateInviteToken();
      const { error: upErr } = await supabase
        .from("participants")
        .update({
          invite_token: token,
          invite_last_sent_at: now,
        })
        .eq("id", participantId)
        .eq("pool_id", SAMPLE_POOL_ID);
      if (upErr) return { ok: false, error: upErr.message };
    } else {
      const { error: upErr } = await supabase
        .from("participants")
        .update({ invite_last_sent_at: now })
        .eq("id", participantId)
        .eq("pool_id", SAMPLE_POOL_ID);
      if (upErr) return { ok: false, error: upErr.message };
    }

    const poolName = await poolNameForSamplePool(supabase);
    const inviteUrl = joinInviteUrl(token);
    const displayName = String(row.display_name ?? "").trim();
    const mail = await sendParticipantInviteEmail({
      to: email,
      poolName,
      displayName,
      inviteUrl,
    });

    revalidatePath("/admin/participants");
    revalidatePath("/admin/payments");
    revalidatePath("/");

    const { data: fresh, error: freshErr } = await supabase
      .from("participants")
      .select(
        "id, pool_id, display_name, email, is_paid, paid_at, user_id, invite_pending, invite_last_sent_at",
      )
      .eq("id", participantId)
      .eq("pool_id", SAMPLE_POOL_ID)
      .single();

    if (freshErr) return { ok: false, error: freshErr.message };

    let emailMessage: string | undefined;
    if (!mail.ok) {
      emailMessage = mail.skipped
        ? "Invite link is ready — email is not configured, so copy the link below."
        : mail.error;
    }

    return {
      ok: true,
      participant: mapParticipantRow(fresh as ParticipantRow),
      inviteUrl,
      emailSent: mail.ok,
      emailMessage,
    };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

export async function updateParticipantAction(input: {
  id: string;
  displayName: string;
  email: string;
  paid: boolean;
}): Promise<ParticipantActionResult> {
  try {
    const supabase = await createClient();
    const { data: existing, error: fetchErr } = await supabase
      .from("participants")
      .select("is_paid, paid_at")
      .eq("id", input.id)
      .eq("pool_id", SAMPLE_POOL_ID)
      .maybeSingle();

    if (fetchErr) return { ok: false, error: fetchErr.message };
    if (!existing) return { ok: false, error: "Participant not found." };

    const wasPaid = existing.is_paid;
    let paidAt: string | null;
    if (!input.paid) {
      paidAt = null;
    } else if (!wasPaid) {
      paidAt = paidAtForInsert(true);
    } else {
      paidAt = existing.paid_at;
    }

    const { data, error } = await supabase
      .from("participants")
      .update({
        display_name: input.displayName.trim(),
        email: input.email.trim(),
        is_paid: input.paid,
        paid_at: paidAt,
      })
      .eq("id", input.id)
      .eq("pool_id", SAMPLE_POOL_ID)
      .select(
        "id, pool_id, display_name, email, is_paid, paid_at, user_id, invite_pending, invite_last_sent_at",
      )
      .single();

    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/participants");
    revalidatePath("/admin/payments");
    revalidatePath("/");
    return {
      ok: true,
      participant: mapParticipantRow(data as ParticipantRow),
    };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

export async function deleteParticipantAction(
  id: string,
): Promise<ParticipantActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("participants")
      .delete()
      .eq("id", id)
      .eq("pool_id", SAMPLE_POOL_ID);

    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/participants");
    revalidatePath("/admin/payments");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}
