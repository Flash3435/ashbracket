import { sortKeyForPredictionKind } from "./scoringRulesOrder";

const BONUS_KEY_ORDER: readonly string[] = [
  "most_goals",
  "most_yellow_cards",
  "most_red_cards",
];

function bonusKeySortIndex(key: string | null | undefined): number {
  if (key == null || key === "") return -1;
  const i = BONUS_KEY_ORDER.indexOf(key);
  return i === -1 ? 99 : i;
}

/** Stable ordering for the public rules table: knockout progression, then bonuses. */
export function comparePublicScoringRuleRows(
  a: { predictionKind: string; bonusKey: string | null },
  b: { predictionKind: string; bonusKey: string | null },
): number {
  const ka = sortKeyForPredictionKind(a.predictionKind);
  const kb = sortKeyForPredictionKind(b.predictionKind);
  if (ka !== kb) return ka - kb;
  if (a.predictionKind === "bonus_pick" && b.predictionKind === "bonus_pick") {
    return bonusKeySortIndex(a.bonusKey) - bonusKeySortIndex(b.bonusKey);
  }
  return (a.bonusKey ?? "").localeCompare(b.bonusKey ?? "");
}
