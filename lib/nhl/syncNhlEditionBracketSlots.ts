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

/** Align Conference Finals matchup FKs after Round 2 winners change (active edition only). */
export async function syncNhlCfSlotsFromR2(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("sync_nhl_cf_slots_from_r2", {
    p_edition_id: editionId,
  });
  return { error: error?.message ?? null };
}

/** Align Stanley Cup Final matchup FKs after Conference Finals winners change (active edition only). */
export async function syncNhlScfSlotsFromCf(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("sync_nhl_scf_slots_from_cf", {
    p_edition_id: editionId,
  });
  return { error: error?.message ?? null };
}

/** Sync R2, CF, and SCF bracket slots from prior-round DB winners (active edition only). */
export async function syncNhlLateRoundSlots(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{ error: string | null }> {
  await syncNhlR2SlotsFromR1(supabase, editionId);
  const cf = await syncNhlCfSlotsFromR2(supabase, editionId);
  if (cf.error) return cf;
  return syncNhlScfSlotsFromCf(supabase, editionId);
}
