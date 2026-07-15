import type { LeaderboardMomentumRow } from "./buildLeaderboardMomentum";
import type { LeaderboardLatestScoreEventContext } from "./parseLatestScoreEventContext";
import type { ScoringCorrectionKind } from "./scoringCorrectionDisplay";
import {
  KNOCKOUT_PROGRESSION_PREDICTION_KINDS,
  isKnockoutProgressionKind,
} from "@/lib/predictions/knockoutProgressionKinds";
import {
  cappedKnockoutAwardKind,
  participantMaximumPredictedDepthForTeam,
} from "@/lib/scoring/knockoutOncePerTeamDepth";

export type TournamentMatchForPointsAttribution = {
  matchCode: string;
  stageCode: string | null;
  groupCode: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  winnerTeamId: string | null;
  scoringResultKind: string | null;
  scoringSlotKey: string | null;
};

export type ParticipantPredictionForPointsAttribution = {
  participantId: string;
  predictionKind: string;
  teamId: string | null;
  slotKey: string | null;
};

export type LeaderboardLatestPointsBreakdown = {
  participantId: string;
  latestTotalDelta: number;
  /** Points from the displayed match(es) only; null when match attribution is unavailable. */
  latestMatchPointsDelta: number | null;
  /** Identified delayed third-place advancer scoring in this update. */
  thirdPlaceQualifierDelta: number | null;
  /**
   * Points change from knockout prediction-depth cap correction metadata.
   * May be negative when over-awards are removed.
   */
  knockoutPredictionDepthCapDelta: number | null;
  /**
   * Points change from the M101 cutover adjustment only (not full-history).
   * Typically −8 when an incorrect Spain finalist increment is removed.
   */
  m101KnockoutDepthTransitionDelta: number | null;
  /** Residual non-match scoring when source is unknown. */
  otherScoringDelta: number | null;
  /** Known correction kinds included in this breakdown (for diagnostics). */
  knownCorrectionKinds: readonly ScoringCorrectionKind[];
  /** Match points plus any named correction differ from the total standings delta. */
  isMixedUpdate: boolean;
};

const KO_PROGRESSION_RANK = new Map(
  KNOCKOUT_PROGRESSION_PREDICTION_KINDS.map((kind, index) => [kind, index]),
);

function knockoutProgressionPredecessor(kind: string): string | null {
  if (!isKnockoutProgressionKind(kind)) return null;
  const rank = KO_PROGRESSION_RANK.get(kind);
  if (rank == null || rank <= 0) return null;
  return KNOCKOUT_PROGRESSION_PREDICTION_KINDS[rank - 1] ?? null;
}

function predictionsForParticipant(
  predictions: readonly ParticipantPredictionForPointsAttribution[],
  participantId: string,
): ParticipantPredictionForPointsAttribution[] {
  return predictions.filter((p) => p.participantId === participantId);
}

function participantHasKnockoutTeam(
  predictions: readonly ParticipantPredictionForPointsAttribution[],
  teamId: string,
): boolean {
  return predictions.some(
    (p) =>
      isKnockoutProgressionKind(p.predictionKind) &&
      p.teamId != null &&
      p.teamId === teamId,
  );
}

/**
 * Slot-based knockout pick award (legacy helper for tests / diagnostics).
 * Live scoring uses once-per-team progression; prefer
 * {@link computeKnockoutOncePerTeamProgressionDelta} for leaderboard attribution.
 */
export function computeKnockoutMatchPickPointsDelta(
  predictions: readonly ParticipantPredictionForPointsAttribution[],
  match: TournamentMatchForPointsAttribution,
  rulesByKind: ReadonlyMap<string, number>,
): number {
  if (!match.winnerTeamId || !match.scoringResultKind || !match.scoringSlotKey) {
    return 0;
  }

  const pick = predictions.find(
    (p) =>
      p.predictionKind === match.scoringResultKind &&
      p.slotKey === match.scoringSlotKey,
  );
  if (!pick?.teamId || pick.teamId !== match.winnerTeamId) {
    return 0;
  }

  const points = rulesByKind.get(match.scoringResultKind);
  return points != null && points > 0 ? points : 0;
}

/**
 * Ledger knockout scoring is once-per-team at
 * min(official furthest, max predicted depth for that team).
 * When a match advances a team to `scoringResultKind`, the attributed delta is
 * the change in that capped award (not an uncapped official upgrade).
 */
export function computeKnockoutOncePerTeamProgressionDelta(
  predictions: readonly ParticipantPredictionForPointsAttribution[],
  match: TournamentMatchForPointsAttribution,
  rulesByKind: ReadonlyMap<string, number>,
): number {
  const winnerId = match.winnerTeamId;
  const newKind = match.scoringResultKind;
  if (!winnerId || !newKind || !isKnockoutProgressionKind(newKind)) {
    return 0;
  }
  if (!participantHasKnockoutTeam(predictions, winnerId)) {
    return 0;
  }

  const maxPredicted = participantMaximumPredictedDepthForTeam(predictions, winnerId);
  if (!maxPredicted) return 0;

  const prevKind = knockoutProgressionPredecessor(newKind);
  const prevAwarded = cappedKnockoutAwardKind(prevKind, maxPredicted);
  const newAwarded = cappedKnockoutAwardKind(newKind, maxPredicted);

  const pointsFor = (kind: string | null): number => {
    if (!kind) return 0;
    const pts = rulesByKind.get(kind) ?? 0;
    return pts > 0 ? pts : 0;
  };

  return Math.max(0, pointsFor(newAwarded) - pointsFor(prevAwarded));
}

export function computeMatchPointsDeltaForParticipant(input: {
  participantId: string;
  predictions: readonly ParticipantPredictionForPointsAttribution[];
  matches: readonly TournamentMatchForPointsAttribution[];
  rulesByKind: ReadonlyMap<string, number>;
}): number | null {
  if (input.matches.length === 0) return null;

  const participantPreds = predictionsForParticipant(
    input.predictions,
    input.participantId,
  );
  let total = 0;
  let attributed = false;
  const awardedWinnerIds = new Set<string>();

  for (const match of input.matches) {
    if (match.scoringResultKind && match.winnerTeamId) {
      if (awardedWinnerIds.has(match.winnerTeamId)) {
        attributed = true;
        continue;
      }
      const delta = computeKnockoutOncePerTeamProgressionDelta(
        participantPreds,
        match,
        input.rulesByKind,
      );
      awardedWinnerIds.add(match.winnerTeamId);
      total += delta;
      attributed = true;
      continue;
    }

    if (match.groupCode && match.stageCode === "group" && match.winnerTeamId) {
      // Group-match attribution is ledger-driven elsewhere; skip pick inference here.
      continue;
    }
  }

  return attributed ? total : null;
}

/** Total third-place advancer points from saved picks vs official advancers (not event delta). */
export function computeThirdPlaceQualifierPointsFromPredictions(input: {
  participantId: string;
  predictions: readonly ParticipantPredictionForPointsAttribution[];
  officialAdvancerTeamIds: ReadonlySet<string>;
  pointsPerPick: number;
}): number {
  if (input.pointsPerPick <= 0 || input.officialAdvancerTeamIds.size === 0) return 0;

  let total = 0;
  for (const pred of predictionsForParticipant(
    input.predictions,
    input.participantId,
  )) {
    if (pred.predictionKind !== "third_place_qualifier" || !pred.teamId) continue;
    if (input.officialAdvancerTeamIds.has(pred.teamId)) {
      total += input.pointsPerPick;
    }
  }
  return total;
}

/**
 * Attribute named scoring corrections from score-impact metadata.
 * Knockout depth-cap / M101 cutover corrections may be negative (points removed).
 * Third-place corrections remain positive-only and never claim a depth-cap residual.
 */
function attributeScoringCorrections(input: {
  residualAfterMatch: number;
  thirdPlacePointsPerPick: number;
  thirdPlaceSettled: boolean;
  totalThirdPlacePointsFromPredictions: number;
  thirdPlaceCorrectionInEvent: boolean;
  knockoutDepthCapCorrectionInEvent: boolean;
  m101KnockoutDepthTransitionInEvent: boolean;
}): {
  thirdPlaceQualifierDelta: number | null;
  knockoutPredictionDepthCapDelta: number | null;
  m101KnockoutDepthTransitionDelta: number | null;
  otherScoringDelta: number | null;
  knownCorrectionKinds: ScoringCorrectionKind[];
} {
  const knownCorrectionKinds: ScoringCorrectionKind[] = [];

  if (input.m101KnockoutDepthTransitionInEvent) {
    knownCorrectionKinds.push("m101_knockout_depth_transition");
    const delta =
      input.residualAfterMatch !== 0 ? input.residualAfterMatch : null;
    return {
      thirdPlaceQualifierDelta: null,
      knockoutPredictionDepthCapDelta: null,
      m101KnockoutDepthTransitionDelta: delta,
      otherScoringDelta: null,
      knownCorrectionKinds,
    };
  }

  if (input.knockoutDepthCapCorrectionInEvent) {
    knownCorrectionKinds.push("knockout_prediction_depth_cap");
    const depthCapDelta =
      input.residualAfterMatch !== 0 ? input.residualAfterMatch : null;
    return {
      thirdPlaceQualifierDelta: null,
      knockoutPredictionDepthCapDelta: depthCapDelta,
      m101KnockoutDepthTransitionDelta: null,
      otherScoringDelta: null,
      knownCorrectionKinds,
    };
  }

  if (input.residualAfterMatch <= 0) {
    return {
      thirdPlaceQualifierDelta: null,
      knockoutPredictionDepthCapDelta: null,
      m101KnockoutDepthTransitionDelta: null,
      otherScoringDelta: null,
      knownCorrectionKinds: [],
    };
  }

  let thirdPlaceQualifierDelta: number | null = null;

  if (
    input.thirdPlaceCorrectionInEvent &&
    input.thirdPlaceSettled &&
    input.thirdPlacePointsPerPick > 0 &&
    input.totalThirdPlacePointsFromPredictions > 0
  ) {
    const perPick = input.thirdPlacePointsPerPick;
    const candidate = input.totalThirdPlacePointsFromPredictions;
    const unexplained = input.residualAfterMatch;

    if (unexplained <= candidate && unexplained % perPick === 0) {
      thirdPlaceQualifierDelta = unexplained;
    } else if (candidate < unexplained && candidate % perPick === 0) {
      thirdPlaceQualifierDelta = candidate;
    }
  }

  if (thirdPlaceQualifierDelta != null && thirdPlaceQualifierDelta > 0) {
    knownCorrectionKinds.push("third_place_qualifier");
  }

  const residual = input.residualAfterMatch - (thirdPlaceQualifierDelta ?? 0);
  return {
    thirdPlaceQualifierDelta:
      thirdPlaceQualifierDelta != null && thirdPlaceQualifierDelta > 0
        ? thirdPlaceQualifierDelta
        : null,
    knockoutPredictionDepthCapDelta: null,
    m101KnockoutDepthTransitionDelta: null,
    otherScoringDelta: residual > 0 ? residual : null,
    knownCorrectionKinds,
  };
}

export function buildLatestPointsBreakdownForParticipant(input: {
  participantId: string;
  momentum: LeaderboardMomentumRow | null | undefined;
  event: LeaderboardLatestScoreEventContext | null | undefined;
  predictions: readonly ParticipantPredictionForPointsAttribution[];
  matches: readonly TournamentMatchForPointsAttribution[];
  rulesByKind: ReadonlyMap<string, number>;
  officialThirdPlaceAdvancerTeamIds?: ReadonlySet<string>;
  thirdPlaceQualifiersSettled?: boolean;
  /** When true, this event newly applied third-place scoring (from score-impact metadata). */
  thirdPlaceCorrectionInEvent?: boolean;
}): LeaderboardLatestPointsBreakdown | null {
  if (!input.momentum || !input.event?.hasValidSnapshot) return null;

  const latestTotalDelta = input.momentum.recentPointsGained;
  const canAttributeMatch =
    input.event.eventKind === "single_match" || input.event.eventKind === "multi_match";

  const latestMatchPointsDelta = canAttributeMatch
    ? computeMatchPointsDeltaForParticipant({
        participantId: input.participantId,
        predictions: input.predictions,
        matches: input.matches,
        rulesByKind: input.rulesByKind,
      })
    : null;

  const residualAfterMatch =
    latestTotalDelta - (latestMatchPointsDelta ?? 0);

  const thirdPlacePointsPerPick =
    input.rulesByKind.get("third_place_qualifier") ?? 0;
  const totalThirdPlacePointsFromPredictions =
    computeThirdPlaceQualifierPointsFromPredictions({
      participantId: input.participantId,
      predictions: input.predictions,
      officialAdvancerTeamIds: input.officialThirdPlaceAdvancerTeamIds ?? new Set(),
      pointsPerPick: thirdPlacePointsPerPick,
    });

  const thirdPlaceCorrectionInEvent =
    input.thirdPlaceCorrectionInEvent === true ||
    (input.event.scoringCorrectionKinds?.includes("third_place_qualifier") ??
      false);
  const knockoutDepthCapCorrectionInEvent =
    input.event.scoringCorrectionKinds?.includes(
      "knockout_prediction_depth_cap",
    ) ?? false;
  const m101KnockoutDepthTransitionInEvent =
    input.event.scoringCorrectionKinds?.includes(
      "m101_knockout_depth_transition",
    ) ?? false;

  const corrections = attributeScoringCorrections({
    residualAfterMatch,
    thirdPlacePointsPerPick,
    thirdPlaceSettled: input.thirdPlaceQualifiersSettled === true,
    totalThirdPlacePointsFromPredictions,
    thirdPlaceCorrectionInEvent,
    knockoutDepthCapCorrectionInEvent,
    m101KnockoutDepthTransitionInEvent,
  });

  const isMixedUpdate =
    (latestMatchPointsDelta != null &&
      latestMatchPointsDelta !== latestTotalDelta) ||
    corrections.thirdPlaceQualifierDelta != null ||
    corrections.knockoutPredictionDepthCapDelta != null ||
    corrections.m101KnockoutDepthTransitionDelta != null ||
    corrections.otherScoringDelta != null;

  return {
    participantId: input.participantId,
    latestTotalDelta,
    latestMatchPointsDelta,
    thirdPlaceQualifierDelta: corrections.thirdPlaceQualifierDelta,
    knockoutPredictionDepthCapDelta: corrections.knockoutPredictionDepthCapDelta,
    m101KnockoutDepthTransitionDelta: corrections.m101KnockoutDepthTransitionDelta,
    otherScoringDelta: corrections.otherScoringDelta,
    knownCorrectionKinds: corrections.knownCorrectionKinds,
    isMixedUpdate,
  };
}

export function buildLatestPointsBreakdownByParticipantId(input: {
  participantIds: readonly string[];
  momentumByParticipantId: ReadonlyMap<string, LeaderboardMomentumRow>;
  event: LeaderboardLatestScoreEventContext | null | undefined;
  predictions: readonly ParticipantPredictionForPointsAttribution[];
  matches: readonly TournamentMatchForPointsAttribution[];
  rulesByKind: ReadonlyMap<string, number>;
  officialThirdPlaceAdvancerTeamIds?: ReadonlySet<string>;
  thirdPlaceQualifiersSettled?: boolean;
  thirdPlaceCorrectionInEvent?: boolean;
}): Map<string, LeaderboardLatestPointsBreakdown> {
  const map = new Map<string, LeaderboardLatestPointsBreakdown>();
  if (!input.event?.hasValidSnapshot) return map;

  for (const participantId of input.participantIds) {
    const breakdown = buildLatestPointsBreakdownForParticipant({
      participantId,
      momentum: input.momentumByParticipantId.get(participantId) ?? null,
      event: input.event,
      predictions: input.predictions,
      matches: input.matches,
      rulesByKind: input.rulesByKind,
      officialThirdPlaceAdvancerTeamIds: input.officialThirdPlaceAdvancerTeamIds,
      thirdPlaceQualifiersSettled: input.thirdPlaceQualifiersSettled,
      thirdPlaceCorrectionInEvent: input.thirdPlaceCorrectionInEvent,
    });
    if (breakdown) map.set(participantId, breakdown);
  }

  return map;
}
