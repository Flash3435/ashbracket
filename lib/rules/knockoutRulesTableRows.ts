import type { PublicScoringRuleRow } from "../../types/publicScoringRules";
import { comparePublicScoringRuleRows } from "./comparePublicScoringRules";
import { PUBLIC_RULES_KNOCKOUT_ROWS } from "./publicRulesDisplayDefaults";

/** Rows for the public rules knockout table: DB rules when present, else static fallback. */
export function knockoutRulesTableRowsFromPublicRules(
  knockoutRules: PublicScoringRuleRow[],
): { key: string; label: string; points: number }[] {
  const sorted = [...knockoutRules]
    .filter((r) => r.points > 0)
    .sort(comparePublicScoringRuleRows);
  if (sorted.length > 0) {
    return sorted.map((r) => ({
      key: `${r.predictionKind}:${r.bonusKey ?? ""}`,
      label: r.label,
      points: r.points,
    }));
  }
  return PUBLIC_RULES_KNOCKOUT_ROWS.map((r) => ({
    key: r.label,
    label: r.label,
    points: r.points,
  }));
}
