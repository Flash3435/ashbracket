import type { PoolActivityFeedRow } from "./poolActivityTypes";

export type RecapFacts = {
  participantCount: number;
  submittedCount: number;
  topChampionTeamName: string | null;
  /** Present when known (live facts + newer recap metadata). */
  topChampionTeamId?: string | null;
  topChampionPickCount: number;
  /**
   * True iff a single team strictly leads champion picks among complete brackets.
   * Omitted on legacy recap metadata rows.
   */
  championUniqueLeader?: boolean;
};

/** Champion “headline” line only when stats make it informative (not misleading). */
export function shouldShowChampionInsight(facts: RecapFacts): boolean {
  if (!facts.topChampionTeamName) return false;
  if (facts.submittedCount < 2 || facts.topChampionPickCount < 2) return false;
  if (facts.championUniqueLeader === false) return false;
  if (facts.championUniqueLeader === true) return true;
  // Legacy metadata without champion_unique_leader: keep counts-only guard (hides 1-pick noise).
  return facts.topChampionPickCount >= 2 && facts.submittedCount >= 2;
}

function jsonFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * When present on `pool_activity.metadata_json`, drives the authoritative recap counts
 * in the activity feed (so AI copy cannot contradict stored facts).
 */
export function recapFactsFromActivityMetadata(
  metadata: Record<string, unknown>,
): RecapFacts | null {
  const pc = jsonFiniteNumber(metadata.participant_count);
  const sc = jsonFiniteNumber(metadata.submitted_count);
  if (pc === null || sc === null) return null;
  const topTeam = metadata.top_champion_team;
  const topTeamId = metadata.top_champion_team_id;
  const topPk = jsonFiniteNumber(metadata.top_champion_pick_count);
  let championUniqueLeader: boolean | undefined;
  if (metadata.champion_unique_leader === true) championUniqueLeader = true;
  else if (metadata.champion_unique_leader === false) championUniqueLeader = false;
  return {
    participantCount: pc,
    submittedCount: sc,
    topChampionTeamName:
      typeof topTeam === "string" && topTeam.trim() ? topTeam.trim() : null,
    topChampionTeamId:
      typeof topTeamId === "string" && topTeamId.trim() ? topTeamId.trim() : null,
    topChampionPickCount: topPk ?? 0,
    championUniqueLeader,
  };
}

/**
 * Activity timeline copy: prefer facts from metadata; keep stored body only when the
 * first paragraph exactly matches the current deterministic baseline (so older rows
 * whose stored opening was a strict prefix of today’s baseline cannot keep stale
 * champion sentences in the same paragraph).
 */
export function recapActivityDisplayBody(
  bodyText: string,
  metadata: Record<string, unknown>,
): string {
  const facts = recapFactsFromActivityMetadata(metadata);
  if (!facts) return bodyText;
  const baseline = buildDeterministicRecapBody(facts);
  const raw = bodyText.trim();
  if (raw === baseline) return bodyText;

  const parts = raw.split(/\n\n+/);
  const firstPart = parts[0]?.trim() ?? "";
  const flavorBlocks = parts.length > 1 ? parts.slice(1).join("\n\n").trim() : "";

  if (firstPart === baseline) {
    return flavorBlocks ? `${baseline}\n\n${flavorBlocks}` : bodyText;
  }

  if (firstPart.startsWith(baseline)) {
    return flavorBlocks ? `${baseline}\n\n${flavorBlocks}` : baseline;
  }

  return flavorBlocks ? `${baseline}\n\n${flavorBlocks}` : baseline;
}

/**
 * Today’s Edmonton-dated recap uses **live** completion facts on read so a row
 * inserted with stale or buggy `metadata_json` cannot contradict the rest of the app.
 * Older recaps still use stored metadata + body reconciliation.
 */
export function ashDailyRecapDisplayBody(
  item: Pick<PoolActivityFeedRow, "type" | "body_text" | "metadata_json">,
  liveRecapFacts: RecapFacts | null,
  liveRecapDateYmd: string | null,
): string {
  if (item.type !== "ash_daily_recap") return item.body_text;
  const meta = item.metadata_json;
  const recapDate = meta.recap_date;
  if (
    liveRecapFacts &&
    liveRecapDateYmd &&
    typeof recapDate === "string" &&
    recapDate === liveRecapDateYmd
  ) {
    const liveBaseline = buildDeterministicRecapBody(liveRecapFacts);
    const raw = item.body_text.trim();
    const parts = raw.split(/\n\n+/);
    const flavor = parts.length > 1 ? parts.slice(1).join("\n\n").trim() : "";
    return flavor ? `${liveBaseline}\n\n${flavor}` : liveBaseline;
  }
  return recapActivityDisplayBody(item.body_text, meta);
}

export function buildDeterministicRecapBody(facts: RecapFacts): string {
  const { participantCount, submittedCount, topChampionTeamName, topChampionPickCount } =
    facts;
  if (participantCount <= 0) {
    return "Ash's daily recap: this pool is warming up - no participants yet, so the bracket gossip can wait.";
  }
  let line = `Ash's daily recap: ${submittedCount} of ${participantCount} brackets are complete`;
  if (shouldShowChampionInsight(facts)) {
    line += `. Among them, ${topChampionTeamName} is the most popular champion pick (${topChampionPickCount} pick${topChampionPickCount === 1 ? "" : "s"})`;
  }
  line += ".";
  return line;
}
