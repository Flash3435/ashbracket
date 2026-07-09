import type { LeaderboardMomentumRow } from "./buildLeaderboardMomentum";
import type { LeaderboardLatestScoreEventContext } from "./parseLatestScoreEventContext";
import type { ScoringCorrectionKind } from "./scoringCorrectionDisplay";

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
  /** Residual non-match scoring when source is unknown. */
  otherScoringDelta: number | null;
  /** Known correction kinds included in this breakdown (for diagnostics). */
  knownCorrectionKinds: readonly ScoringCorrectionKind[];
  /** Match points plus any named correction differ from the total standings delta. */
  isMixedUpdate: boolean;
};

function stageToPickPointsKind(stageCode: string | null | undefined): string | null {
  switch (stageCode) {
    case "round_of_32":
      return "round_of_32";
    case "round_of_16":
      return "round_of_16";
    case "quarterfinal":
      return "quarterfinalist";
    case "semifinal":
      return "semifinalist";
    case "final":
      return "finalist";
    default:
      return null;
  }
}

function predictionsForParticipant(
  predictions: readonly ParticipantPredictionForPointsAttribution[],
  participantId: string,
): ParticipantPredictionForPointsAttribution[] {
  return predictions.filter((p) => p.participantId === participantId);
}

/**
 * Knockout fixture: participant's saved winner for this match slot (scoring_result_kind + slot).
 * Awards stage pick points when the saved winner matches the official winner.
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

  const pointsKind = stageToPickPointsKind(match.stageCode);
  if (!pointsKind) return 0;
  const points = rulesByKind.get(pointsKind);
  return points != null && points > 0 ? points : 0;
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

  for (const match of input.matches) {
    if (match.scoringResultKind && match.scoringSlotKey) {
      total += computeKnockoutMatchPickPointsDelta(
        participantPreds,
        match,
        input.rulesByKind,
      );
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

function attributeScoringCorrections(input: {
  unexplainedDelta: number;
  thirdPlacePointsPerPick: number;
  thirdPlaceSettled: boolean;
  totalThirdPlacePointsFromPredictions: number;
}): {
  thirdPlaceQualifierDelta: number | null;
  otherScoringDelta: number | null;
  knownCorrectionKinds: ScoringCorrectionKind[];
} {
  if (input.unexplainedDelta <= 0) {
    return {
      thirdPlaceQualifierDelta: null,
      otherScoringDelta: null,
      knownCorrectionKinds: [],
    };
  }

  const knownCorrectionKinds: ScoringCorrectionKind[] = [];
  let thirdPlaceQualifierDelta: number | null = null;

  if (
    input.thirdPlaceSettled &&
    input.thirdPlacePointsPerPick > 0 &&
    input.totalThirdPlacePointsFromPredictions > 0
  ) {
    const perPick = input.thirdPlacePointsPerPick;
    const candidate = input.totalThirdPlacePointsFromPredictions;
    const unexplained = input.unexplainedDelta;

    if (unexplained <= candidate && unexplained % perPick === 0) {
      thirdPlaceQualifierDelta = unexplained;
    } else if (candidate < unexplained && candidate % perPick === 0) {
      thirdPlaceQualifierDelta = candidate;
    }
  }

  if (thirdPlaceQualifierDelta != null && thirdPlaceQualifierDelta > 0) {
    knownCorrectionKinds.push("third_place_qualifier");
  }

  const residual = input.unexplainedDelta - (thirdPlaceQualifierDelta ?? 0);
  return {
    thirdPlaceQualifierDelta:
      thirdPlaceQualifierDelta != null && thirdPlaceQualifierDelta > 0
        ? thirdPlaceQualifierDelta
        : null,
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

  const unexplainedDelta = Math.max(
    0,
    latestTotalDelta - (latestMatchPointsDelta ?? 0),
  );

  const thirdPlacePointsPerPick =
    input.rulesByKind.get("third_place_qualifier") ?? 0;
  const totalThirdPlacePointsFromPredictions =
    computeThirdPlaceQualifierPointsFromPredictions({
      participantId: input.participantId,
      predictions: input.predictions,
      officialAdvancerTeamIds: input.officialThirdPlaceAdvancerTeamIds ?? new Set(),
      pointsPerPick: thirdPlacePointsPerPick,
    });

  const corrections = attributeScoringCorrections({
    unexplainedDelta,
    thirdPlacePointsPerPick,
    thirdPlaceSettled: input.thirdPlaceQualifiersSettled === true,
    totalThirdPlacePointsFromPredictions,
  });

  const isMixedUpdate =
    (latestMatchPointsDelta != null &&
      latestMatchPointsDelta !== latestTotalDelta) ||
    corrections.thirdPlaceQualifierDelta != null ||
    corrections.otherScoringDelta != null;

  return {
    participantId: input.participantId,
    latestTotalDelta,
    latestMatchPointsDelta,
    thirdPlaceQualifierDelta: corrections.thirdPlaceQualifierDelta,
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
    });
    if (breakdown) map.set(participantId, breakdown);
  }

  return map;
}
