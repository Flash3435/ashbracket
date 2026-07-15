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

/**
 * For grandfathered editions: keep live KO rows for teams that have not progressed
 * past the cutoff (preserves historical / orphan awards). Replace KO rows for teams
 * that progressed past the cutoff with transitional computed awards. Keep all non-KO.
 */
export function mergePreservedPreCutoffKnockoutLedger(input: {
  computedRows: LedgerRowLike[];
  liveRows: LedgerRowLike[];
  resultTeamIdById: ReadonlyMap<string, string | null>;
  postCutoffTeamIds: ReadonlySet<string>;
}): LedgerRowLike[] {
  const preservedPreCutoffKo: LedgerRowLike[] = [];

  for (const row of input.liveRows) {
    const teamId = input.resultTeamIdById.get(row.result_id) ?? null;
    const isKo = isKnockoutProgressionKind(row.prediction_kind);
    if (!isKo) continue;
    if (teamId && input.postCutoffTeamIds.has(teamId)) continue;
    preservedPreCutoffKo.push(row);
  }

  const computedPostCutoffKo: LedgerRowLike[] = [];
  const computedNewPreCutoffKo: LedgerRowLike[] = [];

  for (const row of input.computedRows) {
    if (!isKnockoutProgressionKind(row.prediction_kind)) continue;
    const teamId = input.resultTeamIdById.get(row.result_id) ?? null;
    if (teamId && input.postCutoffTeamIds.has(teamId)) {
      computedPostCutoffKo.push(row);
      continue;
    }
    const alreadyPreserved = preservedPreCutoffKo.some(
      (r) =>
        r.participant_id === row.participant_id &&
        (input.resultTeamIdById.get(r.result_id) ?? null) === teamId,
    );
    if (!alreadyPreserved) computedNewPreCutoffKo.push(row);
  }

  const nonKoComputed = input.computedRows.filter(
    (r) => !isKnockoutProgressionKind(r.prediction_kind),
  );

  return [
    ...nonKoComputed,
    ...preservedPreCutoffKo,
    ...computedNewPreCutoffKo,
    ...computedPostCutoffKo,
  ];
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
