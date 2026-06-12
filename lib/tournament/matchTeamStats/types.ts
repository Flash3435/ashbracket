export type MatchTeamStatRecord = {
  id: string;
  editionId: string;
  matchId: string;
  teamId: string;
  yellowCards: number | null;
  redCards: number | null;
  source: string;
};

export type MatchForTeamStatAggregation = {
  id: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
};

export type MatchTeamStatsAdminMatch = {
  id: string;
  matchCode: string;
  stageCode: string;
  groupCode: string | null;
  kickoffAt: string | null;
  status: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeGoals: number | null;
  awayGoals: number | null;
  syncLocked: boolean;
};

export type TeamStatSide = {
  yellowCards: number | null;
  redCards: number | null;
};

export type TeamStatLeaderRow = {
  teamId: string;
  total: number;
};
