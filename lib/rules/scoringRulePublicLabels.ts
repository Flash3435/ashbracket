import { labelPredictionKind } from "../participant/predictionKindLabels";

const BONUS_LABELS: Record<string, string> = {
  most_goals: "Bonus: team with the most goals",
  most_yellow_cards: "Bonus: team with the most yellow cards",
  most_red_cards: "Bonus: team with the most red cards",
};

/**
 * Human-readable label for a public scoring rule row (never raw `prediction_kind` alone for bonuses).
 */
export function labelPublicScoringRule(
  predictionKind: string,
  bonusKey: string | null | undefined,
): string {
  if (predictionKind === "bonus_pick" && bonusKey) {
    return BONUS_LABELS[bonusKey] ?? `Bonus: ${bonusKey.replace(/_/g, " ")}`;
  }
  return labelPredictionKind(predictionKind);
}
