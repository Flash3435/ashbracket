/** One row from `scoring_rules_public` after mapping (sample pool page). */
export type PublicScoringRuleRow = {
  predictionKind: string;
  points: number;
  label: string;
};

export type SamplePoolScoringRulesPayload = {
  poolName: string;
  lockAt: string | null;
  rules: PublicScoringRuleRow[];
};
