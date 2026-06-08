import type { SupabaseClient } from "@supabase/supabase-js";
import {
  recomputePoolLedgerWithClient,
  type WcLedgerRecomputeTrigger,
} from "@/lib/scoring/recomputePoolLedger";
import { poolIdsForEdition } from "./editionScope";

/**
 * Recompute ledgers for every pool bound to the given tournament edition.
 */
export async function recomputePoolsForEdition(
  supabase: SupabaseClient,
  editionId: string,
  trigger: WcLedgerRecomputeTrigger,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const poolIds = await poolIdsForEdition(supabase, editionId);
  for (const poolId of poolIds) {
    const ledger = await recomputePoolLedgerWithClient(supabase, poolId, {
      ledgerTrigger: trigger,
    });
    if (ledger.error) {
      return { ok: false, error: ledger.error };
    }
  }
  return { ok: true };
}
