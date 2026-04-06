"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { SAMPLE_POOL_ID } from "../../../lib/config/sample-pool";
import {
  mapParticipantRow,
  paidAtForInsert,
  type ParticipantRow,
} from "../../../lib/participants/participantsDb";
import type { Participant } from "../../../types/participant";

export type ParticipantActionResult =
  | { ok: true; participant?: Participant }
  | { ok: false; error: string };

function messageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
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
      .select("id, pool_id, display_name, email, is_paid, paid_at")
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
      .select("id, pool_id, display_name, email, is_paid, paid_at")
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
