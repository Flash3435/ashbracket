import type { PoolActivityFeedRow } from "./poolActivityTypes";

export type RecapFacts = {
  participantCount: number;
  submittedCount: number;
  topChampionTeamName: string | null;
  topChampionPickCount: number;
};

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
  const topPk = jsonFiniteNumber(metadata.top_champion_pick_count);
  return {
    participantCount: pc,
    submittedCount: sc,
    topChampionTeamName:
      typeof topTeam === "string" && topTeam.trim() ? topTeam.trim() : null,
    topChampionPickCount: topPk ?? 0,
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
  let line = `Ash's daily recap: ${submittedCount} of ${participantCount} participant${participantCount === 1 ? "" : "s"} ha${submittedCount === 1 ? "s" : "ve"} completed their bracket`;
  if (topChampionTeamName && topChampionPickCount > 0) {
    line += `. Among them, ${topChampionTeamName} is the top champion pick (${topChampionPickCount} pick${topChampionPickCount === 1 ? "" : "s"})`;
  }
  line += ".";
  return line;
}
