/** Prize tier for /rules (from `pools.prize_distribution_json` or app defaults). */
export type PoolPrizeTier = {
  place: number;
  label: string;
  /** Percent of the pot, when fixed (e.g. 50 = 50%). */
  percent?: number;
  /** When true, this place receives whatever remains after other tiers. */
  remainder?: boolean;
};

/** One row from `scoring_rules_public` after mapping (sample pool page). */
export type PublicScoringRuleRow = {
  predictionKind: string;
  bonusKey: string | null;
  points: number;
  label: string;
};

export type SamplePoolScoringRulesPayload = {
  poolName: string;
  lockAt: string | null;
  entryFeeCents: number | null;
  prizeTiers: PoolPrizeTier[];
  /** When set, group picks use exact vs wrong-slot points from the pool (not per-row rules). */
  groupAdvance: {
    exactPoints: number;
    wrongSlotPoints: number;
  } | null;
  /** Prize-split tie copy for tied totals; null uses `PUBLIC_RULES_DEFAULT_TIE_BREAK` on /rules. */
  tieBreakNote: string | null;
  rules: PublicScoringRuleRow[];
};
