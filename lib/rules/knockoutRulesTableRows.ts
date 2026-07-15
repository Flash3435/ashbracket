import type { PublicScoringRuleRow } from "../../types/publicScoringRules";
import { comparePublicScoringRuleRows } from "./comparePublicScoringRules";
import { PUBLIC_RULES_KNOCKOUT_ROWS } from "./publicRulesDisplayDefaults";
import { formatPoolPoints } from "@/lib/format/poolPoints";

export type KnockoutRulesTableRow = {
  key: string;
  label: string;
  /** Absolute once-per-team value for this furthest round (scoring truth). */
  points: number;
};

export type KnockoutRulesProgressionDisplayRow = KnockoutRulesTableRow & {
  /** Presentation only: additional pts this round, with team total in parentheses. */
  pointsDisplay: string;
};

/** Rows for the public rules knockout table: DB rules when present, else static fallback. */
export function knockoutRulesTableRowsFromPublicRules(
  knockoutRules: PublicScoringRuleRow[],
): KnockoutRulesTableRow[] {
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

/**
 * Present absolute knockout depths as the additional points earned when a team
 * first reaches that round, with the team’s total value in parentheses.
 * Does not change scoring — display only.
 */
export function formatKnockoutRulesProgressionDisplay(
  rows: readonly KnockoutRulesTableRow[],
): KnockoutRulesProgressionDisplayRow[] {
  return rows.map((row, index) => {
    const previousTotal = index === 0 ? 0 : rows[index - 1]!.points;
    const additional = row.points - previousTotal;
    const additionalLabel = `+${formatPoolPoints(additional)}`;
    const pointsDisplay =
      index === 0
        ? additionalLabel
        : `${additionalLabel} (${formatPoolPoints(row.points)} total)`;
    return { ...row, pointsDisplay };
  });
}
