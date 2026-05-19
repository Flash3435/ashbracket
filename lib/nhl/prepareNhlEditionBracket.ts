import { createServiceRoleClient } from "@/lib/supabase/service";
import { maybeSyncNhlBracketToDatabase } from "./syncNhlSeriesFromNhleBracket";
import { syncNhlR2SlotsFromR1 } from "./syncNhlEditionBracketSlots";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Persists official R1/R2 results and aligns Round 2 matchup FKs before standings or picks scoring.
 * Uses the service role when available so writes are not blocked by RLS.
 */
export async function prepareNhlEditionBracketForScoring(
  editionId: string,
  userClient?: SupabaseClient,
): Promise<void> {
  await maybeSyncNhlBracketToDatabase();

  try {
    const service = createServiceRoleClient();
    await syncNhlR2SlotsFromR1(service, editionId);
  } catch {
    if (userClient) {
      await syncNhlR2SlotsFromR1(userClient, editionId);
    }
  }
}
