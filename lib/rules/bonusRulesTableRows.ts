import type { PublicScoringRuleRow } from "../../types/publicScoringRules";
import { comparePublicScoringRuleRows } from "./comparePublicScoringRules";
import { PUBLIC_RULES_BONUS_ROWS } from "./publicRulesDisplayDefaults";

/** Rows for the public rules bonus table: DB rules when present, else static fallback. */
export function bonusRulesTableRowsFromPublicRules(
  bonusRules: PublicScoringRuleRow[],
): { key: string; label: string; points: number }[] {
  const sorted = [...bonusRules].sort(comparePublicScoringRuleRows);
  if (sorted.length > 0) {
    return sorted.map((r) => ({
      key: `${r.predictionKind}:${r.bonusKey ?? ""}`,
      label: r.label,
      points: r.points,
    }));
  }
  return PUBLIC_RULES_BONUS_ROWS.map((r) => ({
    key: r.label,
    label: r.label,
    points: r.points,
  }));
}
