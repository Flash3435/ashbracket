import type { SupabaseClient } from "@supabase/supabase-js";

export type NhlDraft26PublicEntryPick = {
  pickNumber: number;
  prospectId: string;
};

export type NhlDraft26PublicEntryDetail = {
  entryId: string;
  displayName: string;
  updatedAt: string;
  picks: NhlDraft26PublicEntryPick[];
};

type PublicEntryRpcRow = {
  entry_id: string;
  display_name: string;
  updated_at: string;
  pick_number: number;
  prospect_id: string;
};

export type FetchNhlDraft26PublicEntryResult =
  | { ok: true; data: NhlDraft26PublicEntryDetail }
  | { ok: false; kind: "not_found" }
  | { ok: false; kind: "error"; message: string };

export async function fetchNhlDraft26PublicEntry(
  supabase: SupabaseClient,
  entryId: string,
): Promise<FetchNhlDraft26PublicEntryResult> {
  const { data, error } = await supabase.rpc("fetch_nhl_draft26_public_entry", {
    p_entry_id: entryId,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("does not exist") ||
      msg.includes("not find") ||
      msg.includes("schema cache")
    ) {
      return { ok: false, kind: "error", message: error.message };
    }
    return { ok: false, kind: "error", message: error.message };
  }

  const rows = (data ?? []) as PublicEntryRpcRow[];
  if (rows.length === 0) {
    return { ok: false, kind: "not_found" };
  }

  const first = rows[0]!;
  return {
    ok: true,
    data: {
      entryId: first.entry_id,
      displayName: first.display_name,
      updatedAt: first.updated_at,
      picks: rows.map((r) => ({
        pickNumber: r.pick_number,
        prospectId: r.prospect_id,
      })),
    },
  };
}
