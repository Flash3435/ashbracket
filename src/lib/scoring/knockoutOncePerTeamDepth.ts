/**
 * Once-per-team knockout scoring: award depth is capped by the deepest stage
 * the participant actually predicted for that team.
 *
 * ```
 * awardedDepth = min(officialFurthestDepth, participantMaximumPredictedDepthForTeam)
 * ```
 *
 * ## Genuine prediction-only depth
 *
 * {@link participantMaximumPredictedDepthForTeam} / {@link maxPredictedKnockoutDepthForTeam}
 * read **only** saved participant `predictions` rows (kind + teamId). Callers must
 * pass that table’s mapped rows — never:
 * - official `results` / match winner rows
 * - tournament match home/away feeder sides
 * - bracket display / promotion / auto-carry UI placeholders
 * - topology repair replacements that were never persisted
 *
 * Included sources and why they count as participant picks:
 * - Active knockout progression rows in `predictions` with a non-empty `team_id`
 *   → the participant saved that team at that stage.
 * - Locked-out rows (`value_text` with `ab_pick_status:out`) that still have the
 *   original `team_id` → locked original-pick policy; out is presentation/path
 *   state, not deletion of the saved prediction.
 *
 * Duplicate saved rows for the same team only raise depth via `betterKnockoutKind`;
 * they do not invent stages. Empty teamId rows are ignored.
 *
 * "Once per team" only deduplicates ledger ownership; it does not unlock later
 * official stages from an earlier pick.
 */
import {
  KNOCKOUT_PROGRESSION_PREDICTION_KINDS,
  isKnockoutProgressionKind,
  type KnockoutProgressionPredictionKind,
} from "../../../lib/predictions/knockoutProgressionKinds";

const KO_PROGRESSION_RANK: Map<string, number> = new Map(
  KNOCKOUT_PROGRESSION_PREDICTION_KINDS.map((k, i) => [k, i]),
);

/** Scored-stage depth labels used in audits (R32 is in the order but unscored by default). */
export const KNOCKOUT_SCORED_DEPTH_BUCKETS = [
  "round_of_32",
  "round_of_16",
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "champion",
] as const;

export type KnockoutDepthBucket = (typeof KNOCKOUT_SCORED_DEPTH_BUCKETS)[number];

export function knockoutProgressionRank(kind: string): number {
  return KO_PROGRESSION_RANK.get(kind) ?? -1;
}

/** Prefer the deeper of two knockout progression kinds. */
export function betterKnockoutKind(
  current: string | null,
  candidate: string,
): string {
  if (current == null) return candidate;
  return knockoutProgressionRank(candidate) >= knockoutProgressionRank(current)
    ? candidate
    : current;
}

/**
 * Minimal shape for a genuine saved participant knockout pick.
 * Intentionally omits result / match / UI fields so those cannot be passed by mistake.
 */
export type ParticipantKnockoutDepthPick = {
  predictionKind: string;
  teamId: string | null | undefined;
};

/**
 * Deepest knockout kind the participant predicted for `teamId`.
 *
 * Uses saved participant prediction kinds only — not ledger ownership, official
 * results, match sides, or display placeholders.
 */
export function participantMaximumPredictedDepthForTeam(
  predictions: readonly ParticipantKnockoutDepthPick[],
  teamId: string,
): KnockoutProgressionPredictionKind | null {
  const tid = teamId.trim();
  if (!tid) return null;
  let max: string | null = null;
  for (const p of predictions) {
    const predTeam = p.teamId?.trim();
    if (!predTeam || predTeam !== tid) continue;
    if (!isKnockoutProgressionKind(p.predictionKind)) continue;
    max = betterKnockoutKind(max, p.predictionKind);
  }
  return max as KnockoutProgressionPredictionKind | null;
}

/** @deprecated Prefer {@link participantMaximumPredictedDepthForTeam}. */
export const maxPredictedKnockoutDepthForTeam =
  participantMaximumPredictedDepthForTeam;

/**
 * Award depth = min(official furthest, max predicted). Null when either side
 * is missing.
 */
export function cappedKnockoutAwardKind(
  officialFurthest: string | null | undefined,
  maxPredicted: string | null | undefined,
): KnockoutProgressionPredictionKind | null {
  if (!officialFurthest || !isKnockoutProgressionKind(officialFurthest)) {
    return null;
  }
  if (!maxPredicted || !isKnockoutProgressionKind(maxPredicted)) {
    return null;
  }
  return (
    knockoutProgressionRank(officialFurthest) <=
    knockoutProgressionRank(maxPredicted)
      ? officialFurthest
      : maxPredicted
  ) as KnockoutProgressionPredictionKind;
}

export function knockoutDepthBucketLabel(kind: string | null | undefined): string {
  switch (kind) {
    case "round_of_32":
      return "R32-only";
    case "round_of_16":
      return "R16";
    case "quarterfinalist":
      return "QF";
    case "semifinalist":
      return "SF";
    case "finalist":
      return "Final";
    case "champion":
      return "Champion";
    default:
      return "unknown";
  }
}
