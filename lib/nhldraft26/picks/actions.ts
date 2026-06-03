"use server";

import { isNhlDraft26PicksLocked } from "@/lib/nhldraft26/config";
import { validateNhlDraft26PickList } from "@/lib/nhldraft26/validatePicks";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type SaveNhlDraft26PicksResult =
  | { ok: true; entryId: string }
  | { ok: false; error: string };

function friendlySaveError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("not authenticated") || m.includes("jwt")) {
    return "You must be signed in to save picks.";
  }
  if (m.includes("exactly 10 picks")) {
    return "Submit exactly 10 ranked picks before saving.";
  }
  if (m.includes("duplicate prospect")) {
    return "Each prospect can only appear once in your top 10.";
  }
  if (m.includes("invalid prospect")) {
    return "One or more picks are not in the current prospect pool.";
  }
  if (m.includes("schema cache") || m.includes("does not exist") || m.includes("not find")) {
    return "Saved picks are temporarily unavailable. Try again later.";
  }
  return raw.length > 160 ? "Could not save your picks. Try again." : raw;
}

export async function saveNhlDraft26PicksAction(
  rawProspectIds: unknown,
): Promise<SaveNhlDraft26PicksResult> {
  if (isNhlDraft26PicksLocked()) {
    return { ok: false, error: "Pick entry is closed — the deadline has passed." };
  }

  const validated = validateNhlDraft26PickList(rawProspectIds);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in to save picks." };
  }

  const { data, error } = await supabase.rpc("nhl_draft26_save_picks", {
    p_pick_prospect_ids: validated.prospectIds,
  });

  if (error) {
    return { ok: false, error: friendlySaveError(error.message) };
  }

  const entryId = typeof data === "string" ? data : null;
  if (!entryId) {
    return { ok: false, error: "Could not save your picks. Try again." };
  }

  // TODO: populate display_name from a dedicated profile editor when available.
  revalidatePath("/nhldraft26/picks");

  return { ok: true, entryId };
}
