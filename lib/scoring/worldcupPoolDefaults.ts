export const DEFAULT_WORLD_CUP_GROUP_ADVANCE_EXACT_POINTS = 3;
export const DEFAULT_WORLD_CUP_GROUP_ADVANCE_WRONG_SLOT_POINTS = 1;

export const DEFAULT_WORLD_CUP_SCORING_RULE_ROWS = [
  { predictionKind: "third_place_qualifier", bonusKey: null, points: 2 },
  { predictionKind: "round_of_16", bonusKey: null, points: 4 },
  { predictionKind: "quarterfinalist", bonusKey: null, points: 8 },
  { predictionKind: "semifinalist", bonusKey: null, points: 16 },
  { predictionKind: "finalist", bonusKey: null, points: 24 },
  { predictionKind: "champion", bonusKey: null, points: 32 },
  { predictionKind: "bonus_pick", bonusKey: "most_goals", points: 50 },
  { predictionKind: "bonus_pick", bonusKey: "most_yellow_cards", points: 10 },
  { predictionKind: "bonus_pick", bonusKey: "most_red_cards", points: 10 },
] as const;

export function simulationPoolNeedsDefaultScoringConfig(input: {
  isSimulation: boolean;
  groupAdvanceExactPoints: number | string | null | undefined;
  groupAdvanceWrongSlotPoints: number | string | null | undefined;
  scoringRuleCount: number;
}): boolean {
  return (
    input.isSimulation &&
    input.groupAdvanceExactPoints == null &&
    input.groupAdvanceWrongSlotPoints == null &&
    input.scoringRuleCount === 0
  );
}
