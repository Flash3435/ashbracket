import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * True when organizers have entered all 32 official Round of 32 bracket positions
 * (`results.kind = round_of_32` with `team_id` set). Uses SECURITY DEFINER RPC so
 * participants do not need SELECT on `results`.
 */
export async function fetchOfficialRoundOf32Complete(
  supabase: SupabaseClient,
  roundOf32StageId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("official_round_of_32_complete", {
    p_tournament_stage_id: roundOf32StageId,
  });
  if (error) return false;
  return Boolean(data);
}
