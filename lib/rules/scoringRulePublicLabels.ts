import { labelPredictionKind } from "../participant/predictionKindLabels";

const BONUS_LABELS: Record<string, string> = {
  most_goals: "Team with the most goals in the tournament",
  most_yellow_cards: "Team with the most yellow cards in the tournament",
  most_red_cards: "Team with the most red cards in the tournament",
};

/**
 * Human-readable label for a public scoring rule row (never raw `prediction_kind` alone for bonuses).
 */
export function labelPublicScoringRule(
  predictionKind: string,
  bonusKey: string | null | undefined,
): string {
  if (predictionKind === "bonus_pick" && bonusKey) {
    return (
      BONUS_LABELS[bonusKey] ??
      `Bonus pick: ${bonusKey.replace(/_/g, " ")}`
    );
  }
  return labelPredictionKind(predictionKind);
}
