import type { LeaderboardMomentumRow } from "./buildLeaderboardMomentum";
import type { LeaderboardLatestScoreEventContext } from "./parseLatestScoreEventContext";

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
  /** Non-match scoring movement when total differs from match-specific (e.g. backfill). */
  otherScoringDelta: number | null;
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

export function buildLatestPointsBreakdownForParticipant(input: {
  participantId: string;
  momentum: LeaderboardMomentumRow | null | undefined;
  event: LeaderboardLatestScoreEventContext | null | undefined;
  predictions: readonly ParticipantPredictionForPointsAttribution[];
  matches: readonly TournamentMatchForPointsAttribution[];
  rulesByKind: ReadonlyMap<string, number>;
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

  const isMixedUpdate =
    latestMatchPointsDelta != null && latestMatchPointsDelta !== latestTotalDelta;

  const otherScoringDelta = isMixedUpdate
    ? Math.max(0, latestTotalDelta - latestMatchPointsDelta)
    : null;

  return {
    participantId: input.participantId,
    latestTotalDelta,
    latestMatchPointsDelta,
    otherScoringDelta: otherScoringDelta && otherScoringDelta > 0 ? otherScoringDelta : null,
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
    });
    if (breakdown) map.set(participantId, breakdown);
  }

  return map;
}
