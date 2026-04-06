import type { PublicScoringRuleRow } from "../../types/publicScoringRules";

function isGroupKindRow(r: PublicScoringRuleRow): boolean {
  return (
    r.predictionKind === "group_winner" ||
    r.predictionKind === "group_runner_up"
  );
}

function isBonusRow(r: PublicScoringRuleRow): boolean {
  return r.predictionKind === "bonus_pick";
}

/**
 * Splits public scoring rows for the rules page: group-stage table rows (when not using pool-level
 * exact/wrong-slot columns), knockout progression rows, and bonus picks.
 */
export function partitionPublicRulesForDisplay(
  rules: PublicScoringRuleRow[],
): {
  groupKindRules: PublicScoringRuleRow[];
  knockoutRules: PublicScoringRuleRow[];
  bonusRules: PublicScoringRuleRow[];
} {
  const groupKindRules = rules.filter(isGroupKindRow);
  const bonusRules = rules.filter(isBonusRow);
  const knockoutRules = rules.filter(
    (r) => !isGroupKindRow(r) && !isBonusRow(r),
  );
  return { groupKindRules, knockoutRules, bonusRules };
}
