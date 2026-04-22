export type RecapFacts = {
  participantCount: number;
  submittedCount: number;
  topChampionTeamName: string | null;
  topChampionPickCount: number;
};

/**
 * When present on `pool_activity.metadata_json`, drives the authoritative recap counts
 * in the activity feed (so AI copy cannot contradict stored facts).
 */
export function recapFactsFromActivityMetadata(
  metadata: Record<string, unknown>,
): RecapFacts | null {
  const pc = metadata.participant_count;
  const sc = metadata.submitted_count;
  if (typeof pc !== "number" || typeof sc !== "number") return null;
  const topTeam = metadata.top_champion_team;
  const topPk = metadata.top_champion_pick_count;
  return {
    participantCount: pc,
    submittedCount: sc,
    topChampionTeamName:
      typeof topTeam === "string" && topTeam.trim() ? topTeam.trim() : null,
    topChampionPickCount: typeof topPk === "number" ? topPk : 0,
  };
}

/**
 * Activity timeline copy: prefer facts from metadata; keep stored body only when it
 * extends the deterministic opening (baseline + Ash flavor) or matches baseline.
 */
export function recapActivityDisplayBody(
  bodyText: string,
  metadata: Record<string, unknown>,
): string {
  const facts = recapFactsFromActivityMetadata(metadata);
  if (!facts) return bodyText;
  const baseline = buildDeterministicRecapBody(facts);
  const raw = bodyText.trim();
  if (raw.startsWith(baseline)) return bodyText;
  return baseline;
}

export function buildDeterministicRecapBody(facts: RecapFacts): string {
  const { participantCount, submittedCount, topChampionTeamName, topChampionPickCount } =
    facts;
  if (participantCount <= 0) {
    return "Ash's daily recap: this pool is warming up - no participants yet, so the bracket gossip can wait.";
  }
  let line = `Ash's daily recap: ${submittedCount} of ${participantCount} participant${participantCount === 1 ? "" : "s"} ha${submittedCount === 1 ? "s" : "ve"} completed their bracket`;
  if (topChampionTeamName && topChampionPickCount > 0) {
    line += `. Among them, ${topChampionTeamName} is the top champion pick (${topChampionPickCount} pick${topChampionPickCount === 1 ? "" : "s"})`;
  }
  line += ".";
  return line;
}
