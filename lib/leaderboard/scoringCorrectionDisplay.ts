/** User-facing label for delayed best-third advancer scoring. */
export const THIRD_PLACE_SCORING_CORRECTION_LABEL =
  "Best third-place scoring correction";

/** User-facing label when knockout awards are capped to predicted depth (full-history). */
export const KNOCKOUT_DEPTH_CAP_SCORING_CORRECTION_LABEL =
  "Knockout scoring correction";

/** User-facing label for the M101 cutover adjustment only (not full-history). */
export const M101_KNOCKOUT_DEPTH_TRANSITION_LABEL = "M101 scoring adjustment";

/** One-time pool activity / leaderboard notice when third-place picks are first scored. */
export const THIRD_PLACE_SCORING_BACKFILL_NOTICE =
  "Best third-place advancer picks have now been scored. These were part of the original pool rules but were previously awaiting official qualifier results.";

/** One-time notice when once-per-team knockout awards are recalculated under prediction-depth caps. */
export const KNOCKOUT_DEPTH_CAP_SCORING_CORRECTION_NOTICE =
  "Points are now capped at the furthest stage each team was predicted to reach.";

/** Notice for the M101-only cutover that removes incorrectly granted finalist increments. */
export const M101_KNOCKOUT_DEPTH_TRANSITION_NOTICE =
  "Finalist points now require predicting the team to reach the final.";

export type ScoringCorrectionKind =
  | "third_place_qualifier"
  | "knockout_prediction_depth_cap"
  | "m101_knockout_depth_transition";

export type ScoringCorrectionAttribution = {
  kind: ScoringCorrectionKind;
  points: number;
};
