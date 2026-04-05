/**
 * Display order for prediction kinds on the public rules page.
 * Matches typical tournament progression + bonus last.
 */
export const PREDICTION_KIND_DISPLAY_ORDER: readonly string[] = [
  "group_winner",
  "group_runner_up",
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "champion",
  "bonus_pick",
];

export function sortKeyForPredictionKind(kind: string): number {
  const i = PREDICTION_KIND_DISPLAY_ORDER.indexOf(kind);
  return i === -1 ? PREDICTION_KIND_DISPLAY_ORDER.length + 1 : i;
}
