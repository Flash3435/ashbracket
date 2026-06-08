/**
 * Knockout bracket picks that open only after the official Round of 32 lineup exists
 * (participants are not asked to guess third-place FIFA slot mapping pre-tournament).
 */
export const KNOCKOUT_PROGRESSION_PREDICTION_KINDS = [
  "round_of_32",
  "round_of_16",
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "champion",
] as const;

export type KnockoutProgressionPredictionKind =
  (typeof KNOCKOUT_PROGRESSION_PREDICTION_KINDS)[number];

export function isKnockoutProgressionKind(
  kind: string,
): kind is KnockoutProgressionPredictionKind {
  return (KNOCKOUT_PROGRESSION_PREDICTION_KINDS as readonly string[]).includes(
    kind,
  );
}
