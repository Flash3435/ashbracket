import type { RecapFacts } from "./buildDeterministicRecapBody";
import { recapFactsFromActivityMetadata } from "./buildDeterministicRecapBody";

/**
 * Stable, versioned material snapshot for Ash daily recap dedupe.
 * Compares pool-level stats only (not calendar date or copy).
 */
export function buildChampionDistributionKey(
  countsByTeamId: Map<string, number>,
): string {
  if (countsByTeamId.size === 0) return "";
  return [...countsByTeamId.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, n]) => `${id}:${n}`)
    .join(",");
}

export function recapMaterialKeyV1(
  participantCount: number,
  submittedCount: number,
  championDistributionKey: string,
): string {
  return JSON.stringify({
    v: 1,
    pc: participantCount,
    sc: submittedCount,
    dist: championDistributionKey,
  });
}

function championLeaderComparable(a: RecapFacts, b: RecapFacts): boolean {
  if (a.topChampionPickCount !== b.topChampionPickCount) return false;
  const idA = a.topChampionTeamId?.trim();
  const idB = b.topChampionTeamId?.trim();
  if (idA && idB) return idA === idB;
  const nameA = (a.topChampionTeamName ?? "").trim().toLowerCase();
  const nameB = (b.topChampionTeamName ?? "").trim().toLowerCase();
  return nameA === nameB;
}

/**
 * True when the latest stored recap’s pool snapshot matches the current one.
 * Uses `recap_material_key_v1` when present; otherwise compares counts + champion
 * leader fields from legacy `metadata_json` (best-effort vs full distribution).
 */
export function recapMaterialUnchangedSincePrevious(
  prevMetadata: Record<string, unknown> | undefined,
  currentMaterialKeyV1: string,
  currentFacts: RecapFacts,
): boolean {
  if (!prevMetadata) return false;
  const prevStoredKey = prevMetadata.recap_material_key_v1;
  if (typeof prevStoredKey === "string" && prevStoredKey === currentMaterialKeyV1) {
    return true;
  }
  const prevFacts = recapFactsFromActivityMetadata(prevMetadata);
  if (!prevFacts) return false;
  if (
    prevFacts.participantCount !== currentFacts.participantCount ||
    prevFacts.submittedCount !== currentFacts.submittedCount
  ) {
    return false;
  }
  if (prevFacts.championUniqueLeader === true && currentFacts.championUniqueLeader === false) {
    return false;
  }
  if (prevFacts.championUniqueLeader === false && currentFacts.championUniqueLeader === true) {
    return false;
  }
  return championLeaderComparable(prevFacts, currentFacts);
}
