import { createHash } from "crypto";
import type { WcLedgerRecomputeTrigger } from "@/lib/scoring/recomputePoolLedger";

export function buildScoreImpactDedupKey(input: {
  poolId: string;
  trigger: WcLedgerRecomputeTrigger;
  afterStandingsHash: string;
  scoreSignature: string;
}): string {
  const raw = [
    input.poolId,
    input.trigger,
    input.afterStandingsHash,
    input.scoreSignature,
  ].join("|");
  const digest = createHash("sha256").update(raw).digest("hex").slice(0, 20);
  return `score_impact:v1:${digest}`;
}

export function buildScoreSignatureFromMatches(
  matchResults: ReadonlyArray<{ matchCode: string; label: string }>,
): string {
  if (matchResults.length === 0) return "no-match-change";
  const normalized = [...matchResults]
    .map((m) => `${m.matchCode}:${m.label}`)
    .sort()
    .join(";");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}
