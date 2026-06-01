import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parsePoolPotParticipantRpc,
  type PoolPotParticipantSummary,
} from "./computePoolPotSummary";

export async function fetchPoolPotForMember(
  supabase: SupabaseClient,
  poolId: string,
): Promise<PoolPotParticipantSummary | null> {
  const { data, error } = await supabase.rpc(
    "ashbracket_pool_pot_summary_for_member",
    { p_pool_id: poolId },
  );
  if (error) return null;
  return parsePoolPotParticipantRpc(data);
}
