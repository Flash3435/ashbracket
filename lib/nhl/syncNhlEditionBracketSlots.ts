import type { SupabaseClient } from "@supabase/supabase-js";

/** Align persisted Round 2 matchup FKs after Round 1 winners change (active edition only). */
export async function syncNhlR2SlotsFromR1(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("sync_nhl_r2_slots_from_r1", {
    p_edition_id: editionId,
  });
  return { error: error?.message ?? null };
}
