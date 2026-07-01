import type { PilotStandingsRow } from "@/lib/admin/pilotStandingsSnapshot";

export type ScoreImpactMatchResult = {
  matchCode: string;
  label: string;
  groupCode: string | null;
  /** Winning team id when the match has a decisive result. */
  winnerTeamId: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
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
  /** Standings rank after this scoring update (lower is better). */
  newRank: number;
};

export type ScoreImpactMover = {
  participantId: string;
  displayName: string;
  previousRank: number;
  newRank: number;
  rankDelta: number;
};

export type ScoreImpactReason =
  | "group_incomplete"
  | "group_complete"
  | "knockout_result"
  | "bonus_update"
  | "other";

export type ScoreImpactAnalysis = {
  standingsChanged: boolean;
  pointsChanged: boolean;
  pointGainers: ScoreImpactPointGainer[];
  movers: ScoreImpactMover[];
  bracketsScoredCount: number;
  perfectGroupPickers: string[];
  /** Short follow-up line when group stage points are still pending. */
  pendingPointsNote: string | null;
  bonusLeaderNotes: string[];
  primaryMatchLabel: string | null;
  primaryMatchCode: string | null;
  groupCode: string | null;
  stageCode: string | null;
  scoreline: string | null;
  reason: ScoreImpactReason;
};

/** Client-safe gainer row stored in activity metadata. */
export type ScoreImpactTopGainerMetadata = {
  display_name: string;
  delta: number;
};

/** Server-side gainer row (includes participant_id for recap lookups). */
export type ScoreImpactPointGainerMetadata = {
  participant_id: string;
  display_name: string;
  points_gained: number;
};

export type ScoreImpactLeaderboardMovementMetadata = {
  display_name: string;
  from_rank: number;
  to_rank: number;
};

export type ScoreImpactSoftImpactReason =
  | "winner_in_path"
  | "draw_watchlist"
  | "both_teams_in_path"
  | "unknown";

/** Bracket-path engagement hint when no pool points changed yet. */
export type ScoreImpactSoftImpactMetadata = {
  enabled: boolean;
  team_name?: string;
  /** Server-side only — stripped before client serialization. */
  team_id?: string;
  affected_count: number;
  sample_names: string[];
  reason: ScoreImpactSoftImpactReason;
};

export type ScoreImpactActivityMetadata = {
  source_key: string;
  score_impact_label: "SCORE IMPACT";
  icon: "⚽";
  trigger?: string;
  standings_hash?: string;
  score_signature?: string;
  match_id?: string;
  match_label?: string;
  match_codes?: string[];
  stage_label?: string;
  group_code?: string;
  scoreline?: string;
  points_changed: boolean;
  affected_count: number;
  top_gainers: ScoreImpactTopGainerMetadata[];
  /** Server-side only — used by participant recap; stripped from client display parse. */
  point_gainers?: ScoreImpactPointGainerMetadata[];
  leaderboard_movement?: ScoreImpactLeaderboardMovementMetadata[];
  /** Full per-participant momentum from the last scoring snapshot comparison. */
  has_previous_snapshot?: boolean;
  previous_standings?: Array<{
    participant_id: string;
    total_points: number;
  }>;
  leaderboard_momentum?: Array<{
    participant_id: string;
    previous_rank: number | null;
    previous_points: number | null;
    rank_change: number;
    points_gained: number;
    is_new_entry?: boolean;
  }>;
  reason: ScoreImpactReason;
  soft_impact?: ScoreImpactSoftImpactMetadata;
  /** >= 2 when before/after standings used paginated ledger capture. */
  standings_capture_version?: number;
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
