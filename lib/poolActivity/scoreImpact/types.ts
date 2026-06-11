import type { PilotStandingsRow } from "@/lib/admin/pilotStandingsSnapshot";

export type ScoreImpactMatchResult = {
  matchCode: string;
  label: string;
  groupCode: string | null;
  /** Winning team id when the match has a decisive result. */
  winnerTeamId: string | null;
  stageCode: string | null;
};

export type BonusLeaderSnapshot = {
  mostGoalsTeamId: string | null;
  mostYellowCardsTeamId: string | null;
  mostRedCardsTeamId: string | null;
};

export type ScoreImpactPointGainer = {
  participantId: string;
  displayName: string;
  pointsGained: number;
  newTotalPoints: number;
};

export type ScoreImpactMover = {
  participantId: string;
  displayName: string;
  previousRank: number;
  newRank: number;
  rankDelta: number;
};

export type ScoreImpactAnalysis = {
  standingsChanged: boolean;
  pointsChanged: boolean;
  pointGainers: ScoreImpactPointGainer[];
  movers: ScoreImpactMover[];
  bracketsScoredCount: number;
  perfectGroupPickers: string[];
  incompleteGroupNote: string | null;
  pickSentimentNote: string | null;
  bonusLeaderNotes: string[];
  primaryMatchLabel: string | null;
};

export type ScoreImpactRunContext = {
  editionId?: string;
  matchResults?: ScoreImpactMatchResult[];
  /** Stable signature for the score/result inputs driving this recompute. */
  scoreSignature?: string;
};

export type ScoreImpactStandingsSnapshot = {
  rows: PilotStandingsRow[];
  summaryHash: string;
};
