export type MatchGoalRecord = {
  id: string;
  editionId: string;
  matchId: string;
  teamId: string | null;
  playerName: string;
  minute: number | null;
  stoppageMinute: number | null;
  isOwnGoal: boolean;
};

export type MatchGoalInput = {
  playerName: string;
  teamId: string | null;
  minute: number | null;
  stoppageMinute: number | null;
  isOwnGoal: boolean;
};

export type PlayerGoalTotal = {
  /** Display name from the most recently seen goal row. */
  playerName: string;
  normalizedName: string;
  goals: number;
  teamIds: string[];
};
