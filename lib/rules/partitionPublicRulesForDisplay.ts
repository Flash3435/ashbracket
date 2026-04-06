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

function isThirdPlaceQualifierRow(r: PublicScoringRuleRow): boolean {
  return r.predictionKind === "third_place_qualifier";
}

/**
 * Splits public scoring rows for the rules page: group-stage table rows (when not using pool-level
 * exact/wrong-slot columns), knockout progression rows, third-place qualifier row, and bonus picks.
 */
export function partitionPublicRulesForDisplay(
  rules: PublicScoringRuleRow[],
): {
  groupKindRules: PublicScoringRuleRow[];
  knockoutRules: PublicScoringRuleRow[];
  thirdPlaceRules: PublicScoringRuleRow[];
  bonusRules: PublicScoringRuleRow[];
} {
  const groupKindRules = rules.filter(isGroupKindRow);
  const bonusRules = rules.filter(isBonusRow);
  const thirdPlaceRules = rules.filter(isThirdPlaceQualifierRow);
  const knockoutRules = rules.filter(
    (r) =>
      !isGroupKindRow(r) && !isBonusRow(r) && !isThirdPlaceQualifierRow(r),
  );
  return { groupKindRules, knockoutRules, thirdPlaceRules, bonusRules };
}
