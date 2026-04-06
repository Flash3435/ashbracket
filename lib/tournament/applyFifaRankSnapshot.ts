import type { SupabaseClient } from "@supabase/supabase-js";
import snapshot from "./fifaRankSnapshot.json";

type SnapshotFile = {
  asOf: string;
  ranks: Record<string, number>;
};

const data = snapshot as SnapshotFile;

/**
 * Writes `fifa_rank` / `fifa_rank_as_of` on `teams` from the bundled JSON snapshot.
 * Idempotent; safe after `seedOfficialWc2026` (matches on `country_code`).
 */
export async function applyFifaRankSnapshot(
  supabase: SupabaseClient,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const asOf = data.asOf;

  for (const [countryCode, rank] of Object.entries(data.ranks)) {
    const { error } = await supabase
      .from("teams")
      .update({
        fifa_rank: rank,
        fifa_rank_as_of: asOf,
      })
      .eq("country_code", countryCode.toUpperCase());

    if (error) {
      return { ok: false, error: `${countryCode}: ${error.message}` };
    }
  }

  return { ok: true };
}
