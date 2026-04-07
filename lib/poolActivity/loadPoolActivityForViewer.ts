import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureDailyAshRecapForPool } from "./ensureDailyAshRecap";
import { fetchPoolActivityForPool } from "./fetchPoolActivity";

/**
 * Loads feed rows with optional lazy daily recap (idempotent per pool/day).
 * Use from server components after the viewer is known to be a pool member.
 */
export async function loadPoolActivityForViewer(
  supabase: SupabaseClient,
  poolId: string,
  options: { ensureDailyRecap: boolean; limit: number },
): Promise<Awaited<ReturnType<typeof fetchPoolActivityForPool>>> {
  if (options.ensureDailyRecap) {
    await ensureDailyAshRecapForPool(poolId);
  }
  return fetchPoolActivityForPool(supabase, poolId, options.limit);
}
