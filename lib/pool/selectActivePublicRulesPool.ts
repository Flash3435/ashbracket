import type { SupabaseClient } from "@supabase/supabase-js";
import { FIFA_WC_2026_EDITION_CODE } from "../pools/wc2026PoolLockDeadline";

export type PublicRulesPoolCandidate = {
  poolId: string;
  poolName: string;
};

export type ActivePublicRulesPoolPick =
  | { poolId: string; source: "configured_sample" }
  | { poolId: string; source: "active_live_wc2026" };

/**
 * Prefer the configured sample pool when it is an eligible live WC 2026 candidate;
 * otherwise pick the first active candidate by pool name (stable across runs).
 */
export function pickActivePublicRulesPoolId(
  configuredSampleId: string,
  candidates: readonly PublicRulesPoolCandidate[],
): ActivePublicRulesPoolPick | null {
  if (candidates.length === 0) return null;

  const normalizedSample = configuredSampleId.trim().toLowerCase();
  const sampleMatch = candidates.find(
    (c) => c.poolId.trim().toLowerCase() === normalizedSample,
  );
  if (sampleMatch) {
    return { poolId: sampleMatch.poolId, source: "configured_sample" };
  }

  const sorted = [...candidates].sort((a, b) =>
    a.poolName.localeCompare(b.poolName, "en"),
  );
  return { poolId: sorted[0]!.poolId, source: "active_live_wc2026" };
}

type LivePublicRulesPoolRow = {
  id: string;
  name: string;
  is_simulation: boolean;
  archived_at: string | null;
  show_public_rules: boolean;
  tournament_editions: {
    code: string;
    is_simulation: boolean;
  } | null;
};

function isEligibleLivePublicRulesPool(row: LivePublicRulesPoolRow): boolean {
  const edition = row.tournament_editions;
  if (!edition) return false;
  if (edition.code !== FIFA_WC_2026_EDITION_CODE) return false;
  if (edition.is_simulation) return false;
  if (row.is_simulation) return false;
  if (row.archived_at != null && row.archived_at.trim() !== "") return false;
  if (!row.show_public_rules) return false;
  return true;
}

/**
 * Active live World Cup 2026 pools that publish public rules and have scoring rows.
 */
export async function loadActiveLiveWc2026PublicRulesPoolCandidates(
  supabase: SupabaseClient,
): Promise<PublicRulesPoolCandidate[]> {
  const { data, error } = await supabase
    .from("pools")
    .select(
      "id, name, is_simulation, archived_at, show_public_rules, tournament_editions!inner(code, is_simulation)",
    )
    .eq("tournament_editions.code", FIFA_WC_2026_EDITION_CODE)
    .eq("tournament_editions.is_simulation", false)
    .eq("is_simulation", false)
    .eq("show_public_rules", true)
    .is("archived_at", null)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  const eligible = ((data ?? []) as unknown as LivePublicRulesPoolRow[]).filter(
    isEligibleLivePublicRulesPool,
  );
  if (eligible.length === 0) return [];

  const poolIds = eligible.map((row) => row.id);
  const { data: ruleRows, error: rulesError } = await supabase
    .from("scoring_rules")
    .select("pool_id")
    .in("pool_id", poolIds);

  if (rulesError) throw new Error(rulesError.message);

  const poolsWithRules = new Set(
    (ruleRows ?? []).map((row) => row.pool_id as string),
  );

  return eligible
    .filter((row) => poolsWithRules.has(row.id))
    .map((row) => ({ poolId: row.id, poolName: row.name }));
}
