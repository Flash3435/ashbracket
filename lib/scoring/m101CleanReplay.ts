/**
 * Clean M101 rollback-and-replay helpers (presentation + standings math).
 *
 * Product intent: restore exact pre-M101 totals, then re-award only legitimate
 * Spain finalist/champion +8 under the prediction-depth transition — never as a
 * visible −8 correction overlay.
 */
import {
  knockoutProgressionRank,
  participantMaximumPredictedDepthForTeam,
} from "../../src/lib/scoring/knockoutOncePerTeamDepth";
import type { Prediction } from "../../src/types/domain";

export const M101_CLEAN_REPLAY_CONFIRM =
  "APPLY_M101_CLEAN_ROLLBACK_REPLAY" as const;

export const M101_MATCH_CODE = "M101" as const;

/** Minimum predicted depth that earns the M101 finalist increment (+8). */
export const M101_ELIGIBLE_MIN_KIND = "finalist" as const;

export type PreM101StandingRow = {
  participantId: string;
  displayName: string;
  totalPoints: number;
};

export type CleanM101ParticipantPlan = {
  participantId: string;
  displayName: string;
  preM101Points: number;
  maxPredictedSpainDepth: string | null;
  eligibleForFinalistIncrement: boolean;
  m101Delta: number;
  postReplayPoints: number;
};

export type CleanM101ReplayPlan = {
  participants: CleanM101ParticipantPlan[];
  plus8Recipients: CleanM101ParticipantPlan[];
  zeroRecipients: CleanM101ParticipantPlan[];
  anomalous: Array<{ participantId: string; displayName: string; reason: string }>;
  preTop: Array<{
    participantId: string;
    displayName: string;
    totalPoints: number;
    rank: number;
  }>;
  postTop: Array<{
    participantId: string;
    displayName: string;
    preM101Points: number;
    m101Delta: number;
    postReplayPoints: number;
    preRank: number;
    postRank: number;
    rankDelta: number;
  }>;
};

export function isEligibleForM101FinalistIncrement(
  maxPredictedSpainDepth: string | null,
): boolean {
  if (!maxPredictedSpainDepth) return false;
  return (
    knockoutProgressionRank(maxPredictedSpainDepth) >=
    knockoutProgressionRank(M101_ELIGIBLE_MIN_KIND)
  );
}

export function m101DeltaForPredictedDepth(
  maxPredictedSpainDepth: string | null,
): number {
  return isEligibleForM101FinalistIncrement(maxPredictedSpainDepth) ? 8 : 0;
}

/** Competition ranks (1, 1, 3 …) from highest total. */
export function competitionRanksFromTotals(
  rows: ReadonlyArray<{ participantId: string; totalPoints: number }>,
): Map<string, number> {
  const sorted = [...rows].sort(
    (a, b) =>
      b.totalPoints - a.totalPoints ||
      a.participantId.localeCompare(b.participantId),
  );
  const ranks = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]!;
    const rank =
      i === 0 || row.totalPoints !== sorted[i - 1]!.totalPoints
        ? i + 1
        : ranks.get(sorted[i - 1]!.participantId)!;
    ranks.set(row.participantId, rank);
  }
  return ranks;
}

/**
 * Prefer the original M101 score-impact `previous_standings` snapshot.
 * Falls back to reconstructing from a clean live board when keepers already
 * include +8 and losers do not (pre = live − 8 for keepers, live otherwise).
 */
export function reconstructPreM101Standings(input: {
  previousStandingsFromM101Activity:
    | ReadonlyArray<{ participant_id: string; total_points: number }>
    | null
    | undefined;
  displayNameByParticipantId: ReadonlyMap<string, string>;
  liveTotalsByParticipantId: ReadonlyMap<string, number>;
  predictionsByParticipantId: ReadonlyMap<string, readonly Prediction[]>;
  spainTeamId: string;
}): {
  rows: PreM101StandingRow[];
  source: "m101_previous_standings" | "reconstruct_live_minus_keeper_increment";
} {
  const prev = input.previousStandingsFromM101Activity;
  if (prev && prev.length > 0) {
    return {
      source: "m101_previous_standings",
      rows: prev.map((row) => ({
        participantId: row.participant_id,
        displayName:
          input.displayNameByParticipantId.get(row.participant_id) ?? "?",
        totalPoints: row.total_points,
      })),
    };
  }

  const rows: PreM101StandingRow[] = [];
  for (const [participantId, livePts] of input.liveTotalsByParticipantId) {
    const maxPred = participantMaximumPredictedDepthForTeam(
      input.predictionsByParticipantId.get(participantId) ?? [],
      input.spainTeamId,
    );
    const eligible = isEligibleForM101FinalistIncrement(maxPred);
    rows.push({
      participantId,
      displayName: input.displayNameByParticipantId.get(participantId) ?? "?",
      totalPoints: eligible ? livePts - 8 : livePts,
    });
  }
  return { source: "reconstruct_live_minus_keeper_increment", rows };
}

export function buildCleanM101ReplayPlan(input: {
  preM101Rows: readonly PreM101StandingRow[];
  predictionsByParticipantId: ReadonlyMap<string, readonly Prediction[]>;
  spainTeamId: string;
}): CleanM101ReplayPlan {
  const participants: CleanM101ParticipantPlan[] = input.preM101Rows.map(
    (row) => {
      const maxPred = participantMaximumPredictedDepthForTeam(
        input.predictionsByParticipantId.get(row.participantId) ?? [],
        input.spainTeamId,
      );
      const eligible = isEligibleForM101FinalistIncrement(maxPred);
      const delta = m101DeltaForPredictedDepth(maxPred);
      return {
        participantId: row.participantId,
        displayName: row.displayName,
        preM101Points: row.totalPoints,
        maxPredictedSpainDepth: maxPred,
        eligibleForFinalistIncrement: eligible,
        m101Delta: delta,
        postReplayPoints: row.totalPoints + delta,
      };
    },
  );

  const anomalous = participants
    .filter((p) => p.m101Delta < 0)
    .map((p) => ({
      participantId: p.participantId,
      displayName: p.displayName,
      reason: "negative M101 delta is forbidden in clean replay",
    }));

  const preRanks = competitionRanksFromTotals(
    participants.map((p) => ({
      participantId: p.participantId,
      totalPoints: p.preM101Points,
    })),
  );
  const postRanks = competitionRanksFromTotals(
    participants.map((p) => ({
      participantId: p.participantId,
      totalPoints: p.postReplayPoints,
    })),
  );

  const preTop = [...participants]
    .sort(
      (a, b) =>
        b.preM101Points - a.preM101Points ||
        a.displayName.localeCompare(b.displayName),
    )
    .map((p) => ({
      participantId: p.participantId,
      displayName: p.displayName,
      totalPoints: p.preM101Points,
      rank: preRanks.get(p.participantId) ?? 0,
    }));

  const postTop = [...participants]
    .sort(
      (a, b) =>
        b.postReplayPoints - a.postReplayPoints ||
        a.displayName.localeCompare(b.displayName),
    )
    .map((p) => {
      const preRank = preRanks.get(p.participantId) ?? 0;
      const postRank = postRanks.get(p.participantId) ?? 0;
      return {
        participantId: p.participantId,
        displayName: p.displayName,
        preM101Points: p.preM101Points,
        m101Delta: p.m101Delta,
        postReplayPoints: p.postReplayPoints,
        preRank,
        postRank,
        rankDelta: preRank - postRank,
      };
    });

  return {
    participants,
    plus8Recipients: participants.filter((p) => p.m101Delta === 8),
    zeroRecipients: participants.filter((p) => p.m101Delta === 0),
    anomalous,
    preTop,
    postTop,
  };
}

/**
 * Whether a participant should show an M101 points line after clean replay.
 * Eligible keepers: Spain def. France: +8. Ineligible: no points / refresh / correction line.
 */
export function shouldShowCleanM101PointsLine(m101Delta: number): boolean {
  return m101Delta > 0;
}
