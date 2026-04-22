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
