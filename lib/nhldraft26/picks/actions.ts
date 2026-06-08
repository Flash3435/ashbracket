"use server";

import { isNhlDraft26PicksLocked } from "@/lib/nhldraft26/config";
import { validateNhlDraft26DisplayName } from "@/lib/nhldraft26/validateDisplayName";
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
  if (m.includes("invalid display name length")) {
    return "Public leaderboard name must be 3–24 characters.";
  }
  if (m.includes("invalid display name characters")) {
    return "Use only letters, numbers, spaces, underscores, and hyphens in your public name.";
  }
  if (m.includes("schema cache") || m.includes("does not exist") || m.includes("not find")) {
    return "Saved picks are temporarily unavailable. Try again later.";
  }
  return raw.length > 160 ? "Could not save your picks. Try again." : raw;
}

export async function saveNhlDraft26PicksAction(
  rawProspectIds: unknown,
  rawDisplayName: unknown,
): Promise<SaveNhlDraft26PicksResult> {
  if (isNhlDraft26PicksLocked()) {
    return { ok: false, error: "Pick entry is closed — the deadline has passed." };
  }

  const validatedName = validateNhlDraft26DisplayName(rawDisplayName);
  if (!validatedName.ok) {
    return { ok: false, error: validatedName.error };
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
    p_display_name: validatedName.displayName,
  });

  if (error) {
    return { ok: false, error: friendlySaveError(error.message) };
  }

  const entryId = typeof data === "string" ? data : null;
  if (!entryId) {
    return { ok: false, error: "Could not save your picks. Try again." };
  }

  revalidatePath("/nhldraft26/picks");
  revalidatePath("/nhldraft26/leaderboard");
  revalidatePath(`/nhldraft26/entry/${entryId}`);

  return { ok: true, entryId };
}
