import type { SupabaseClient } from "@supabase/supabase-js";

type MatchSyncRow = {
  match_code: string;
  last_sync_at: string | null;
  updated_at: string | null;
  status: string;
};

const DEFAULT_LOOKBACK_MS = 30 * 60 * 1000;

function readIsoMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * When Step B runs without explicit appliedMatchCodes (page refresh, tooling),
 * infer match codes from tournament_matches synced just before the recalc.
 */
export async function inferRecentAppliedMatchCodes(
  supabase: SupabaseClient,
  editionId: string,
  options?: {
    referenceTime?: Date;
    lookbackMs?: number;
    /** Only include matches whose last_sync_at is at or before referenceTime. */
    maxMatchCount?: number;
  },
): Promise<string[]> {
  const referenceMs = (options?.referenceTime ?? new Date()).getTime();
  const lookbackMs = options?.lookbackMs ?? DEFAULT_LOOKBACK_MS;
  const cutoffMs = referenceMs - lookbackMs;

  const { data, error } = await supabase
    .from("tournament_matches")
    .select("match_code, last_sync_at, updated_at, status")
    .eq("edition_id", editionId)
    .eq("status", "finished")
    .order("last_sync_at", { ascending: false, nullsFirst: false });

  if (error) throw new Error(error.message);

  const candidates = ((data ?? []) as MatchSyncRow[])
    .map((row) => {
      const syncMs = readIsoMs(row.last_sync_at) ?? readIsoMs(row.updated_at);
      return { matchCode: row.match_code.trim(), syncMs };
    })
    .filter(
      (row): row is { matchCode: string; syncMs: number } =>
        Boolean(row.matchCode) && row.syncMs != null,
    )
    .filter((row) => row.syncMs >= cutoffMs && row.syncMs <= referenceMs + 60_000)
    .sort((a, b) => b.syncMs - a.syncMs);

  if (candidates.length === 0) return [];

  const newestSyncMs = candidates[0]!.syncMs;
  const syncWindowMs = 5 * 60 * 1000;
  const batch = candidates.filter((row) => newestSyncMs - row.syncMs <= syncWindowMs);
  const maxCount = options?.maxMatchCount ?? 8;

  return batch.slice(0, maxCount).map((row) => row.matchCode);
}
