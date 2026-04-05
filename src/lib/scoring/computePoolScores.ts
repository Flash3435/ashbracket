import type { Prediction, Result } from "../../types/domain";
import type {
  ComputedLedgerLine,
  PoolScoringInput,
  ScoringOutcome,
} from "./types";

/**
 * Canonical slot identity shared by predictions and results (kind + stage + group + slot).
 * Null group/slot stringify to "" so NULLS line up with DB uniqueness.
 */
export function slotMatchKey(
  kind: string,
  tournamentStageId: string | null,
  groupCode: string | null,
  slotKey: string | null,
): string {
  return [kind, tournamentStageId ?? "", groupCode ?? "", slotKey ?? ""].join("\0");
}

function keyFromResult(r: Result): string {
  return slotMatchKey(r.kind, r.tournamentStageId, r.groupCode, r.slotKey);
}

function keyFromPrediction(p: Prediction): string {
  return slotMatchKey(
    p.predictionKind,
    p.tournamentStageId,
    p.groupCode,
    p.slotKey,
  );
}

/**
 * True when the pick matches the official outcome for scoring v1:
 * - Prefer `teamId` when the prediction has one.
 * - Otherwise `bonus_pick` compares trimmed case-insensitive `valueText`.
 */
export function pickMatchesPrediction(prediction: Prediction, result: Result): boolean {
  if (prediction.teamId) {
    return prediction.teamId === result.teamId;
  }
  if (prediction.predictionKind === "bonus_pick" && prediction.valueText && result.valueText) {
    return (
      prediction.valueText.trim().toLowerCase() ===
      result.valueText.trim().toLowerCase()
    );
  }
  return false;
}

function buildRulesMap(
  poolId: string,
  rules: PoolScoringInput["scoringRules"],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rules) {
    if (r.poolId !== poolId) continue;
    m.set(r.predictionKind, r.points);
  }
  return m;
}

function buildResultLookup(results: Result[]): Map<string, Result> {
  const map = new Map<string, Result>();
  for (const r of results) {
    map.set(keyFromResult(r), r);
  }
  return map;
}

/**
 * Deterministic pool scoring: match predictions to results by slot key, apply rules, emit ledger lines.
 * Safe to rerun from scratch — callers replace ledger from this output when syncing DB.
 */
export function computePoolScores(input: PoolScoringInput): ScoringOutcome {
  const { poolId, predictions, results, scoringRules } = input;
  const rulesMap = buildRulesMap(poolId, scoringRules);
  const resultByKey = buildResultLookup(results);

  const ledgerLines: ComputedLedgerLine[] = [];
  const totals: Record<string, number> = {};

  const poolPreds = predictions.filter((p) => p.poolId === poolId);

  for (const pred of poolPreds) {
    const key = keyFromPrediction(pred);
    const res = resultByKey.get(key);
    if (!res) continue;
    if (!pickMatchesPrediction(pred, res)) continue;

    const points = rulesMap.get(pred.predictionKind);
    if (points === undefined || points <= 0) continue;

    ledgerLines.push({
      poolId,
      participantId: pred.participantId,
      pointsDelta: points,
      predictionKind: pred.predictionKind,
      predictionId: pred.id,
      resultId: res.id,
      note: `Match: ${pred.predictionKind} (${points} pts)`,
    });
    totals[pred.participantId] = (totals[pred.participantId] ?? 0) + points;
  }

  ledgerLines.sort((a, b) => {
    const pa = a.participantId.localeCompare(b.participantId);
    if (pa !== 0) return pa;
    const pr = a.predictionId.localeCompare(b.predictionId);
    if (pr !== 0) return pr;
    return a.resultId.localeCompare(b.resultId);
  });

  return {
    poolId,
    totalsByParticipantId: totals,
    ledgerLines,
  };
}
