/** User-facing label for delayed best-third advancer scoring. */
export const THIRD_PLACE_SCORING_CORRECTION_LABEL =
  "Best third-place scoring correction";

/** One-time pool activity / leaderboard notice when third-place picks are first scored. */
export const THIRD_PLACE_SCORING_BACKFILL_NOTICE =
  "Best third-place advancer picks have now been scored. These were part of the original pool rules but were previously awaiting official qualifier results.";

export type ScoringCorrectionKind = "third_place_qualifier";

export type ScoringCorrectionAttribution = {
  kind: ScoringCorrectionKind;
  points: number;
};
