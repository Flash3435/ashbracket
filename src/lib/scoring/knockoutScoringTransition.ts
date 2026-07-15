/**
 * Knockout scoring transition for FIFA WC 2026 live editions.
 *
 * Product cutover: preserve all knockout awards through the end of M100 under the
 * historical uncapped once-per-team carry-forward model. Starting with M101,
 * additional progression uses prediction-depth caps only.
 *
 * Do not scatter M101 match-code checks through the scorer — resolve policy here.
 */
import { OFFICIAL_EDITION_CODE } from "../../../lib/config/officialTournament";
import {
  betterKnockoutKind,
  cappedKnockoutAwardKind,
  knockoutProgressionRank,
} from "./knockoutOncePerTeamDepth";
import { isKnockoutProgressionKind } from "../../../lib/predictions/knockoutProgressionKinds";

/** Absolute once-per-team award (legacy / pre-cutoff behaviour). */
export type KnockoutScoringMode =
  | "uncapped_once_per_team"
  | "prediction_depth_capped"
  | "grandfathered_cutoff_then_capped_increment";

export type KnockoutScoringTransitionPolicy = {
  mode: KnockoutScoringMode;
  /**
   * Deepest official progression kind included in the grandfathered cutoff baseline.
   * For WC 2026: end of QF (M100) → furthest official stage is `semifinalist`.
   */
  cutoffMaxOfficialKind: "semifinalist";
  /** Ops label: last match included in the grandfathered baseline. */
  cutoffAfterMatchCode: "M100";
  /** Ops label: first match scored under the new incremental cap. */
  progressionStartsWithMatchCode: "M101";
  editionCode: typeof OFFICIAL_EDITION_CODE;
};

/** WC 2026 live cutover: grandfather through M100; depth-cap increments from M101. */
export const FIFA_WC_2026_M101_KNOCKOUT_TRANSITION: KnockoutScoringTransitionPolicy =
  {
    mode: "grandfathered_cutoff_then_capped_increment",
    cutoffMaxOfficialKind: "semifinalist",
    cutoffAfterMatchCode: "M100",
    progressionStartsWithMatchCode: "M101",
    editionCode: OFFICIAL_EDITION_CODE,
  };

/**
 * Resolve knockout scoring mode for an edition.
 * Simulation editions are unaffected (pure prediction-depth cap, no grandfathering).
 */
export function resolveKnockoutScoringTransition(input: {
  editionCode: string | null | undefined;
  isSimulation: boolean;
}): KnockoutScoringTransitionPolicy | null {
  if (input.isSimulation) return null;
  if (input.editionCode === OFFICIAL_EDITION_CODE) {
    return FIFA_WC_2026_M101_KNOCKOUT_TRANSITION;
  }
  return null;
}

export type KnockoutScoringConfig =
  | { mode: "uncapped_once_per_team" }
  | { mode: "prediction_depth_capped" }
  | {
      mode: "grandfathered_cutoff_then_capped_increment";
      cutoffMaxOfficialKind: string;
    };

export function knockoutScoringConfigFromTransition(
  policy: KnockoutScoringTransitionPolicy | null,
): KnockoutScoringConfig {
  if (!policy) return { mode: "prediction_depth_capped" };
  if (policy.mode === "grandfathered_cutoff_then_capped_increment") {
    return {
      mode: "grandfathered_cutoff_then_capped_increment",
      cutoffMaxOfficialKind: policy.cutoffMaxOfficialKind,
    };
  }
  return { mode: policy.mode };
}

/** Official furthest depth using only results at or before the cutoff stage. */
export function buildCutoffOfficialTeamFurthestKnockoutKind(
  results: readonly { kind: string; teamId: string | null | undefined }[],
  cutoffMaxOfficialKind: string,
): Map<string, string> {
  const maxRank = knockoutProgressionRank(cutoffMaxOfficialKind);
  const m = new Map<string, string>();
  for (const r of results) {
    if (!r.teamId) continue;
    const rank = knockoutProgressionRank(r.kind);
    if (rank < 0 || rank > maxRank) continue;
    const prev = m.get(r.teamId);
    m.set(r.teamId, betterKnockoutKind(prev ?? null, r.kind));
  }
  return m;
}

function pointsForKind(
  kind: string | null | undefined,
  rulesMap: ReadonlyMap<string, number>,
): number {
  if (!kind || !isKnockoutProgressionKind(kind)) return 0;
  const pts = rulesMap.get(kind);
  return pts != null && pts > 0 ? pts : 0;
}

export type KnockoutTeamAwardComputation = {
  points: number;
  /** Kind written on the ledger row (for result linkage + audit). */
  ledgerKind: string | null;
  grandfatheredPoints: number;
  incrementalPoints: number;
  cutoffOfficialKind: string | null;
  currentOfficialKind: string | null;
  maxPredictedKind: string | null;
  cappedCutoffKind: string | null;
  cappedCurrentKind: string | null;
  note: string;
};

/**
 * Points for one (participant, team) under the configured knockout scoring mode.
 *
 * Transitional formula:
 *   grandfatheredPointsAtCutoff  // uncapped official depth at cutoff
 *   + max(0, points(min(current, predicted)) - points(min(cutoff, predicted)))
 */
export function computeKnockoutTeamAward(input: {
  currentOfficialKind: string | null;
  cutoffOfficialKind: string | null;
  maxPredictedKind: string | null;
  rulesMap: ReadonlyMap<string, number>;
  config: KnockoutScoringConfig;
}): KnockoutTeamAwardComputation {
  const {
    currentOfficialKind,
    cutoffOfficialKind,
    maxPredictedKind,
    rulesMap,
    config,
  } = input;

  const empty = (note: string): KnockoutTeamAwardComputation => ({
    points: 0,
    ledgerKind: null,
    grandfatheredPoints: 0,
    incrementalPoints: 0,
    cutoffOfficialKind,
    currentOfficialKind,
    maxPredictedKind,
    cappedCutoffKind: null,
    cappedCurrentKind: null,
    note,
  });

  if (!maxPredictedKind) {
    return empty("No predicted depth for team");
  }

  if (config.mode === "uncapped_once_per_team") {
    const kind = currentOfficialKind;
    const points = pointsForKind(kind, rulesMap);
    return {
      points,
      ledgerKind: points > 0 ? kind : null,
      grandfatheredPoints: points,
      incrementalPoints: 0,
      cutoffOfficialKind,
      currentOfficialKind,
      maxPredictedKind,
      cappedCutoffKind: null,
      cappedCurrentKind: null,
      note:
        points > 0
          ? `Knockout: ${kind} once per team uncapped (${points} pts)`
          : "Uncapped award is zero",
    };
  }

  if (config.mode === "prediction_depth_capped") {
    const awarded = cappedKnockoutAwardKind(
      currentOfficialKind,
      maxPredictedKind,
    );
    const points = pointsForKind(awarded, rulesMap);
    return {
      points,
      ledgerKind: points > 0 ? awarded : null,
      grandfatheredPoints: 0,
      incrementalPoints: points,
      cutoffOfficialKind,
      currentOfficialKind,
      maxPredictedKind,
      cappedCutoffKind: cappedKnockoutAwardKind(
        cutoffOfficialKind,
        maxPredictedKind,
      ),
      cappedCurrentKind: awarded,
      note:
        points > 0
          ? `Knockout: ${awarded} once per team (${points} pts)`
          : "Capped award is zero",
    };
  }

  // grandfathered_cutoff_then_capped_increment
  const grandfatheredPoints = pointsForKind(cutoffOfficialKind, rulesMap);
  const cappedCutoffKind = cappedKnockoutAwardKind(
    cutoffOfficialKind,
    maxPredictedKind,
  );
  const cappedCurrentKind = cappedKnockoutAwardKind(
    currentOfficialKind,
    maxPredictedKind,
  );
  const cappedCutoffPts = pointsForKind(cappedCutoffKind, rulesMap);
  const cappedCurrentPts = pointsForKind(cappedCurrentKind, rulesMap);
  const incrementalPoints = Math.max(0, cappedCurrentPts - cappedCutoffPts);
  const points = grandfatheredPoints + incrementalPoints;

  let ledgerKind: string | null = null;
  if (points > 0) {
    if (incrementalPoints > 0 && cappedCurrentKind) {
      ledgerKind = cappedCurrentKind;
    } else if (cutoffOfficialKind) {
      ledgerKind = cutoffOfficialKind;
    } else if (cappedCurrentKind) {
      ledgerKind = cappedCurrentKind;
    }
  }

  const note =
    points > 0
      ? incrementalPoints > 0
        ? `Knockout: grandfathered ${grandfatheredPoints} + post-${FIFA_WC_2026_M101_KNOCKOUT_TRANSITION.progressionStartsWithMatchCode} capped +${incrementalPoints} (${ledgerKind}; ${points} pts)`
        : `Knockout: grandfathered through ${FIFA_WC_2026_M101_KNOCKOUT_TRANSITION.cutoffAfterMatchCode} (${ledgerKind}; ${points} pts)`
      : "Transitional award is zero";

  return {
    points,
    ledgerKind,
    grandfatheredPoints,
    incrementalPoints,
    cutoffOfficialKind,
    currentOfficialKind,
    maxPredictedKind,
    cappedCutoffKind,
    cappedCurrentKind,
    note,
  };
}

export type LedgerRowLike = {
  participant_id: string;
  points_delta: number;
  prediction_kind: string;
  prediction_id: string;
  result_id: string;
  note: string | null;
};

export type ExcludedKnockoutOrphan = {
  participant_id: string;
  prediction_id: string;
  prediction_kind: string;
  points_delta: number;
  reason: string;
};

export type MergePreservedPreCutoffKnockoutLedgerResult = {
  rows: LedgerRowLike[];
  excludedOrphans: ExcludedKnockoutOrphan[];
};

/**
 * Resolve the team that owns a knockout ledger row.
 * Prefer a live, resolvable `result_id`; fall back to the prediction's team.
 */
export function resolveKnockoutLedgerTeamId(
  row: Pick<LedgerRowLike, "result_id" | "prediction_id">,
  resultTeamIdById: ReadonlyMap<string, string | null>,
  predictionTeamIdByPredictionId?: ReadonlyMap<string, string | null>,
): string | null {
  const rid = row.result_id?.trim() ? row.result_id : "";
  if (rid) {
    const fromResult = resultTeamIdById.get(rid) ?? null;
    if (fromResult) return fromResult;
  }
  if (predictionTeamIdByPredictionId) {
    return predictionTeamIdByPredictionId.get(row.prediction_id) ?? null;
  }
  return null;
}

function ownershipKey(participantId: string, teamId: string): string {
  return `${participantId}::${teamId}`;
}

/**
 * For grandfathered editions: keep live KO rows for teams that have not progressed
 * past the cutoff (preserves historical / orphan awards). Replace KO rows for teams
 * that progressed past the cutoff with transitional computed awards. Keep all non-KO.
 *
 * Invariant: at most one knockout progression award per (participant_id, team_id).
 *
 * Rows with null/unresolvable result_id are not blindly preserved. Team ownership is
 * resolved via `prediction_id` when possible. Unresolvable rows are excluded and reported.
 * When a live row only resolves via prediction (nulled FK) and computed already covers
 * the same (participant, team), the computed row wins so result linkage stays fresh.
 */
export function mergePreservedPreCutoffKnockoutLedger(input: {
  computedRows: LedgerRowLike[];
  liveRows: LedgerRowLike[];
  resultTeamIdById: ReadonlyMap<string, string | null>;
  postCutoffTeamIds: ReadonlySet<string>;
  /** prediction_id → team_id; used when result_id was nulled by sync delete. */
  predictionTeamIdByPredictionId?: ReadonlyMap<string, string | null>;
}): MergePreservedPreCutoffKnockoutLedgerResult {
  const predTeam = input.predictionTeamIdByPredictionId;
  const excludedOrphans: ExcludedKnockoutOrphan[] = [];

  const computedKoByKey = new Map<string, LedgerRowLike>();
  for (const row of input.computedRows) {
    if (!isKnockoutProgressionKind(row.prediction_kind)) continue;
    const teamId = resolveKnockoutLedgerTeamId(
      row,
      input.resultTeamIdById,
      predTeam,
    );
    if (!teamId) continue;
    computedKoByKey.set(ownershipKey(row.participant_id, teamId), row);
  }

  const preservedPreCutoffKo: LedgerRowLike[] = [];
  const preservedKeys = new Set<string>();

  for (const row of input.liveRows) {
    if (!isKnockoutProgressionKind(row.prediction_kind)) continue;

    const teamId = resolveKnockoutLedgerTeamId(
      row,
      input.resultTeamIdById,
      predTeam,
    );
    if (!teamId) {
      excludedOrphans.push({
        participant_id: row.participant_id,
        prediction_id: row.prediction_id,
        prediction_kind: row.prediction_kind,
        points_delta: row.points_delta,
        reason: "unresolvable_team",
      });
      continue;
    }

    const key = ownershipKey(row.participant_id, teamId);
    if (input.postCutoffTeamIds.has(teamId)) {
      // Post-cutoff: always take transitional computed (do not preserve live).
      continue;
    }

    const resultResolvable = Boolean(
      row.result_id?.trim() && input.resultTeamIdById.get(row.result_id),
    );

    // Nulled/stale result_id with a computed replacement for the same team:
    // drop the live orphan so we do not double-award.
    if (!resultResolvable && computedKoByKey.has(key)) {
      excludedOrphans.push({
        participant_id: row.participant_id,
        prediction_id: row.prediction_id,
        prediction_kind: row.prediction_kind,
        points_delta: row.points_delta,
        reason: "nulled_result_superseded_by_computed",
      });
      continue;
    }

    if (preservedKeys.has(key)) {
      excludedOrphans.push({
        participant_id: row.participant_id,
        prediction_id: row.prediction_id,
        prediction_kind: row.prediction_kind,
        points_delta: row.points_delta,
        reason: "duplicate_live_ownership",
      });
      continue;
    }

    preservedKeys.add(key);
    preservedPreCutoffKo.push(row);
  }

  const computedPostCutoffKo: LedgerRowLike[] = [];
  const computedNewPreCutoffKo: LedgerRowLike[] = [];
  const emittedComputedKeys = new Set<string>();

  for (const row of input.computedRows) {
    if (!isKnockoutProgressionKind(row.prediction_kind)) continue;
    const teamId = resolveKnockoutLedgerTeamId(
      row,
      input.resultTeamIdById,
      predTeam,
    );
    if (!teamId) {
      excludedOrphans.push({
        participant_id: row.participant_id,
        prediction_id: row.prediction_id,
        prediction_kind: row.prediction_kind,
        points_delta: row.points_delta,
        reason: "computed_unresolvable_team",
      });
      continue;
    }
    const key = ownershipKey(row.participant_id, teamId);
    if (emittedComputedKeys.has(key)) {
      excludedOrphans.push({
        participant_id: row.participant_id,
        prediction_id: row.prediction_id,
        prediction_kind: row.prediction_kind,
        points_delta: row.points_delta,
        reason: "duplicate_computed_ownership",
      });
      continue;
    }
    if (input.postCutoffTeamIds.has(teamId)) {
      emittedComputedKeys.add(key);
      computedPostCutoffKo.push(row);
      continue;
    }
    if (preservedKeys.has(key)) {
      // Live grandfathered row already owns this (participant, team).
      continue;
    }
    emittedComputedKeys.add(key);
    computedNewPreCutoffKo.push(row);
  }

  const nonKoComputed = input.computedRows.filter(
    (r) => !isKnockoutProgressionKind(r.prediction_kind),
  );

  return {
    rows: [
      ...nonKoComputed,
      ...preservedPreCutoffKo,
      ...computedNewPreCutoffKo,
      ...computedPostCutoffKo,
    ],
    excludedOrphans,
  };
}

export function postCutoffTeamIdsFromResults(
  results: readonly { kind: string; teamId: string | null | undefined }[],
  cutoffMaxOfficialKind: string,
): Set<string> {
  const current = new Map<string, string>();
  for (const r of results) {
    if (!r.teamId || knockoutProgressionRank(r.kind) < 0) continue;
    current.set(
      r.teamId,
      betterKnockoutKind(current.get(r.teamId) ?? null, r.kind),
    );
  }
  const cutoff = buildCutoffOfficialTeamFurthestKnockoutKind(
    results,
    cutoffMaxOfficialKind,
  );
  const out = new Set<string>();
  for (const [teamId, cur] of current) {
    const cut = cutoff.get(teamId) ?? null;
    if (knockoutProgressionRank(cur) > knockoutProgressionRank(cut ?? "")) {
      out.add(teamId);
    }
  }
  return out;
}
