import type { SupabaseClient } from "@supabase/supabase-js";

type NhlDraft26EntryRow = {
  id: string;
  user_id: string;
  display_name: string | null;
};

type NhlDraft26PickRow = {
  pick_number: number;
  prospect_id: string;
};

export type NhlDraft26SavedPicks = {
  entryId: string | null;
  prospectIds: string[];
};

export async function fetchNhlDraft26SavedPicksForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ data: NhlDraft26SavedPicks; error: string | null }> {
  const { data: entry, error: entryError } = await supabase
    .from("nhl_draft26_entries")
    .select("id, user_id, display_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (entryError) {
    return {
      data: { entryId: null, prospectIds: [] },
      error: entryError.message,
    };
  }

  if (!entry) {
    return { data: { entryId: null, prospectIds: [] }, error: null };
  }

  const entryRow = entry as NhlDraft26EntryRow;

  const { data: pickRows, error: picksError } = await supabase
    .from("nhl_draft26_picks")
    .select("pick_number, prospect_id")
    .eq("entry_id", entryRow.id)
    .order("pick_number", { ascending: true });

  if (picksError) {
    return {
      data: { entryId: entryRow.id, prospectIds: [] },
      error: picksError.message,
    };
  }

  const rows = (pickRows ?? []) as NhlDraft26PickRow[];
  const prospectIds = rows.map((r) => r.prospect_id);

  return {
    data: { entryId: entryRow.id, prospectIds },
    error: null,
  };
}
