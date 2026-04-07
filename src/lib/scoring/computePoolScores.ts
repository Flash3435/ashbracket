import type { Prediction, Result } from "../../types/domain";
import type {
  ComputedLedgerLine,
  GroupStageScoringConfig,
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

/** Slot / bonus discriminator for matching predictions to results. */
function slotDiscriminatorForPrediction(p: Prediction): string | null {
  if (p.predictionKind === "bonus_pick") {
    return p.bonusKey ?? p.slotKey;
  }
  return p.slotKey;
}

function keyFromResult(r: Result): string {
  return slotMatchKey(r.kind, r.tournamentStageId, r.groupCode, r.slotKey);
}

function keyFromPrediction(p: Prediction): string {
  const disc = slotDiscriminatorForPrediction(p);
  return slotMatchKey(p.predictionKind, p.tournamentStageId, p.groupCode, disc);
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

type GroupOutcome = {
  winnerTeamId: string;
  runnerUpTeamId: string;
  winnerResultId: string;
  runnerUpResultId: string;
};

function buildGroupOutcomes(
  results: Result[],
  groupStageId: string,
): Map<string, GroupOutcome> {
  const map = new Map<string, GroupOutcome>();
  for (const r of results) {
    if (r.tournamentStageId !== groupStageId || !r.groupCode) continue;
    const g = r.groupCode.toUpperCase();
    let o = map.get(g);
    if (!o) {
      o = {
        winnerTeamId: "",
        runnerUpTeamId: "",
        winnerResultId: "",
        runnerUpResultId: "",
      };
      map.set(g, o);
    }
    if (r.kind === "group_winner") {
      o.winnerTeamId = r.teamId;
      o.winnerResultId = r.id;
    } else if (r.kind === "group_runner_up") {
      o.runnerUpTeamId = r.teamId;
      o.runnerUpResultId = r.id;
    }
  }
  for (const [g, o] of [...map.entries()]) {
    if (!o.winnerTeamId || !o.runnerUpTeamId) {
      map.delete(g);
    }
  }
  return map;
}

function ruleKeyFromScoringRule(
  predictionKind: string,
  bonusKey: string | null | undefined,
): string {
  if (predictionKind === "bonus_pick" && bonusKey) {
    return `bonus_pick:${bonusKey}`;
  }
  return predictionKind;
}

function buildRulesMap(
  poolId: string,
  rules: PoolScoringInput["scoringRules"],
  groupStageScoring: GroupStageScoringConfig | null | undefined,
): Map<string, number> {
  const m = new Map<string, number>();
  const skipGroupKinds =
    groupStageScoring != null &&
    Number.isFinite(groupStageScoring.exactPoints) &&
    Number.isFinite(groupStageScoring.wrongSlotPoints);

  for (const r of rules) {
    if (r.poolId !== poolId) continue;
    if (
      skipGroupKinds &&
      (r.predictionKind === "group_winner" || r.predictionKind === "group_runner_up")
    ) {
      continue;
    }
    m.set(ruleKeyFromScoringRule(r.predictionKind, r.bonusKey), r.points);
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

function lookupRulePoints(rulesMap: Map<string, number>, pred: Prediction): number | undefined {
  if (pred.predictionKind === "bonus_pick") {
    const specific = pred.bonusKey
      ? rulesMap.get(`bonus_pick:${pred.bonusKey}`)
      : undefined;
    return specific ?? rulesMap.get("bonus_pick");
  }
  return rulesMap.get(pred.predictionKind);
}

/** Official advancing third-place teams: slot order in `results` does not matter. */
function buildThirdPlaceOfficialByTeamId(
  results: Result[],
  stageId: string,
): Map<string, Result> {
  const m = new Map<string, Result>();
  for (const r of results) {
    if (
      r.kind !== "third_place_qualifier" ||
      r.tournamentStageId !== stageId ||
      !r.teamId
    ) {
      continue;
    }
    if (!m.has(r.teamId)) m.set(r.teamId, r);
  }
  return m;
}

function scoreGroupAdvancePick(
  pred: Prediction,
  outcomes: Map<string, GroupOutcome>,
  cfg: GroupStageScoringConfig,
): Omit<ComputedLedgerLine, "poolId"> | null {
  if (!pred.teamId || !pred.groupCode) return null;
  const g = pred.groupCode.toUpperCase();
  const o = outcomes.get(g);
  if (!o) return null;

  const tid = pred.teamId;
  const pickedFirstSlot = pred.predictionKind === "group_winner";
  const actuallyFirst = tid === o.winnerTeamId;
  const actuallySecond = tid === o.runnerUpTeamId;

  if (!actuallyFirst && !actuallySecond) return null;

  if (pickedFirstSlot && actuallyFirst) {
    return {
      participantId: pred.participantId,
      pointsDelta: cfg.exactPoints,
      predictionKind: pred.predictionKind,
      predictionId: pred.id,
      resultId: o.winnerResultId,
      note: `Group: exact 1st-place pick (${cfg.exactPoints} pts)`,
    };
  }
  if (!pickedFirstSlot && actuallySecond) {
    return {
      participantId: pred.participantId,
      pointsDelta: cfg.exactPoints,
      predictionKind: pred.predictionKind,
      predictionId: pred.id,
      resultId: o.runnerUpResultId,
      note: `Group: exact 2nd-place pick (${cfg.exactPoints} pts)`,
    };
  }
  if (pickedFirstSlot && actuallySecond) {
    return {
      participantId: pred.participantId,
      pointsDelta: cfg.wrongSlotPoints,
      predictionKind: pred.predictionKind,
      predictionId: pred.id,
      resultId: o.runnerUpResultId,
      note: `Group: team advanced as 2nd, picked as 1st (${cfg.wrongSlotPoints} pts)`,
    };
  }
  if (!pickedFirstSlot && actuallyFirst) {
    return {
      participantId: pred.participantId,
      pointsDelta: cfg.wrongSlotPoints,
      predictionKind: pred.predictionKind,
      predictionId: pred.id,
      resultId: o.winnerResultId,
      note: `Group: team advanced as 1st, picked as 2nd (${cfg.wrongSlotPoints} pts)`,
    };
  }
  return null;
}

/**
 * Deterministic pool scoring: match predictions to results by slot key, apply rules, emit ledger lines.
 * Safe to rerun from scratch — callers replace ledger from this output when syncing DB.
 */
export function computePoolScores(input: PoolScoringInput): ScoringOutcome {
  const { poolId, predictions, results, scoringRules, groupStageScoring } = input;

  const useGroupAdvance =
    groupStageScoring != null &&
    Number.isFinite(groupStageScoring.exactPoints) &&
    Number.isFinite(groupStageScoring.wrongSlotPoints);

  const groupOutcomes =
    useGroupAdvance && groupStageScoring
      ? buildGroupOutcomes(results, groupStageScoring.groupStageId)
      : new Map<string, GroupOutcome>();

  const rulesMap = buildRulesMap(poolId, scoringRules, groupStageScoring);
  const resultByKey = buildResultLookup(results);

  const ledgerLines: ComputedLedgerLine[] = [];
  const totals: Record<string, number> = {};

  const poolPreds = predictions.filter((p) => p.poolId === poolId);

  const thirdPlaceOfficialCache = new Map<string, Map<string, Result>>();

  for (const pred of poolPreds) {
    if (
      useGroupAdvance &&
      groupStageScoring &&
      (pred.predictionKind === "group_winner" || pred.predictionKind === "group_runner_up")
    ) {
      const gLine = scoreGroupAdvancePick(pred, groupOutcomes, groupStageScoring);
      if (gLine && gLine.pointsDelta > 0) {
        ledgerLines.push({ poolId, ...gLine });
        totals[gLine.participantId] =
          (totals[gLine.participantId] ?? 0) + gLine.pointsDelta;
      }
      continue;
    }

    if (pred.predictionKind === "third_place_qualifier" && pred.teamId) {
      const stageId = pred.tournamentStageId;
      if (!stageId) continue;
      let official = thirdPlaceOfficialCache.get(stageId);
      if (!official) {
        official = buildThirdPlaceOfficialByTeamId(results, stageId);
        thirdPlaceOfficialCache.set(stageId, official);
      }
      if (official.size === 0) continue;
      const res = official.get(pred.teamId);
      if (!res) continue;

      const points = lookupRulePoints(rulesMap, pred);
      if (points === undefined || points <= 0) continue;

      ledgerLines.push({
        poolId,
        participantId: pred.participantId,
        pointsDelta: points,
        predictionKind: pred.predictionKind,
        predictionId: pred.id,
        resultId: res.id,
        note: `Match: third_place_qualifier (set; ${points} pts)`,
      });
      totals[pred.participantId] = (totals[pred.participantId] ?? 0) + points;
      continue;
    }

    const key = keyFromPrediction(pred);
    const res = resultByKey.get(key);
    if (!res) continue;
    if (!pickMatchesPrediction(pred, res)) continue;

    const points = lookupRulePoints(rulesMap, pred);
    if (points === undefined || points <= 0) continue;

    ledgerLines.push({
      poolId,
      participantId: pred.participantId,
      pointsDelta: points,
      predictionKind: pred.predictionKind,
      predictionId: pred.id,
      resultId: res.id,
      note: `Match: ${pred.predictionKind}${pred.bonusKey ? ` (${pred.bonusKey})` : ""} (${points} pts)`,
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
