import {
  DEFAULT_WORLD_CUP_GROUP_ADVANCE_EXACT_POINTS,
  DEFAULT_WORLD_CUP_GROUP_ADVANCE_WRONG_SLOT_POINTS,
  DEFAULT_WORLD_CUP_SCORING_RULE_ROWS,
} from "./worldcupPoolDefaults";

export type GroupAdvancePoints = {
  exactPoints: number;
  wrongSlotPoints: number;
};

export type ScoringRulePointsRow = {
  predictionKind: string;
  bonusKey?: string | null;
  points: number;
};

export type ResolvedPoolScoringConfig = {
  poolId: string;
  groupAdvance: GroupAdvancePoints | null;
  thirdPlaceQualifierPoints: number | null;
  knockoutPointsByKind: Record<string, number>;
  bonusPointsByKey: Record<string, number>;
};

export function resolveGroupAdvanceFromPoolColumns(
  exact: number | string | null | undefined,
  wrong: number | string | null | undefined,
): GroupAdvancePoints | null {
  if (exact == null || wrong == null) return null;
  const exactPoints = Number(exact);
  const wrongSlotPoints = Number(wrong);
  if (!Number.isFinite(exactPoints) || !Number.isFinite(wrongSlotPoints)) {
    return null;
  }
  return { exactPoints, wrongSlotPoints };
}

export function thirdPlaceQualifierPointsFromRules(
  rules: readonly ScoringRulePointsRow[],
): number | null {
  const rows = rules.filter((r) => r.predictionKind === "third_place_qualifier");
  if (rows.length === 0) return null;
  return Math.max(...rows.map((r) => r.points));
}

export function defaultWorldCupGroupAdvance(): GroupAdvancePoints {
  return {
    exactPoints: DEFAULT_WORLD_CUP_GROUP_ADVANCE_EXACT_POINTS,
    wrongSlotPoints: DEFAULT_WORLD_CUP_GROUP_ADVANCE_WRONG_SLOT_POINTS,
  };
}

export function defaultWorldCupThirdPlaceQualifierPoints(): number {
  const row = DEFAULT_WORLD_CUP_SCORING_RULE_ROWS.find(
    (r) => r.predictionKind === "third_place_qualifier",
  );
  return row?.points ?? 2;
}

/**
 * Canonical scoring values for a pool — same inputs `recomputePoolLedger` and the
 * public rules page should use (pool group columns + `scoring_rules` rows).
 */
export function resolvePoolScoringConfig(input: {
  poolId: string;
  groupAdvanceExactPoints?: number | string | null;
  groupAdvanceWrongSlotPoints?: number | string | null;
  scoringRules: readonly ScoringRulePointsRow[];
}): ResolvedPoolScoringConfig {
  const groupAdvance = resolveGroupAdvanceFromPoolColumns(
    input.groupAdvanceExactPoints,
    input.groupAdvanceWrongSlotPoints,
  );

  const knockoutPointsByKind: Record<string, number> = {};
  const bonusPointsByKey: Record<string, number> = {};

  for (const rule of input.scoringRules) {
    if (rule.predictionKind === "bonus_pick" && rule.bonusKey) {
      bonusPointsByKey[rule.bonusKey] = rule.points;
      continue;
    }
    if (rule.predictionKind === "third_place_qualifier") continue;
    if (
      rule.predictionKind === "group_winner" ||
      rule.predictionKind === "group_runner_up"
    ) {
      continue;
    }
    knockoutPointsByKind[rule.predictionKind] = rule.points;
  }

  return {
    poolId: input.poolId,
    groupAdvance,
    thirdPlaceQualifierPoints: thirdPlaceQualifierPointsFromRules(input.scoringRules),
    knockoutPointsByKind,
    bonusPointsByKey,
  };
}

/**
 * Stage 2 copy on /rules: always prefer the pool's `third_place_qualifier` rule;
 * optional World Cup defaults only when the fetcher applies sample-pool display defaults.
 */
export function resolveStage2PointsForRulesPage(input: {
  rules: readonly ScoringRulePointsRow[];
  applyWorldCupDisplayDefaults: boolean;
}): number | null {
  const fromRules = thirdPlaceQualifierPointsFromRules(input.rules);
  if (fromRules != null) return fromRules;
  if (input.applyWorldCupDisplayDefaults) {
    return defaultWorldCupThirdPlaceQualifierPoints();
  }
  return null;
}
