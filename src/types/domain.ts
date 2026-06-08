/**
 * AshBracket domain types — camelCase fields map from Supabase `snake_case` columns.
 */

/** World Cup phase (`tournament_stages.code`). */
export type TournamentStageCode =
  | "group"
  | "round_of_32"
  | "round_of_16"
  | "quarterfinal"
  | "semifinal"
  | "third_place"
  | "final";

/** `predictions.prediction_kind` / `scoring_rules.prediction_kind` / ledger. */
export type PredictionKind =
  | "group_winner"
  | "group_runner_up"
  | "round_of_32"
  | "round_of_16"
  | "quarterfinalist"
  | "semifinalist"
  | "finalist"
  | "champion"
  | "third_place_qualifier"
  | "bonus_pick";

/** Contest group (`pools`). */
export interface Pool {
  id: string;
  name: string;
  /** When picks close for this pool; null if not using a single deadline. */
  lockAt: string | null;
  /** Included in `leaderboard_public` when true. */
  isPublic: boolean;
  /** Auth user who created the pool (`pools.created_by_user_id`); null if unknown or legacy. */
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Pool-scoped admin membership (`pool_admins`). */
export interface PoolAdminMembership {
  id: string;
  poolId: string;
  userId: string;
  role: "owner" | "admin";
  createdAt: string;
  updatedAt: string;
}

/** Pool member (`participants`). */
export interface Participant {
  id: string;
  poolId: string;
  userId: string | null;
  displayName: string;
  email: string | null;
  isPaid: boolean;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** National team (`teams`). */
export interface Team {
  id: string;
  name: string;
  /** FIFA 3-letter code (e.g. USA, ENG); stored uppercase in DB. */
  countryCode: string;
  fifaCode: string | null;
  /** Men's FIFA/Coca-Cola world ranking at `fifaRankAsOf`, if seeded. */
  fifaRank: number | null;
  /** ISO date (YYYY-MM-DD) for the ranking snapshot. */
  fifaRankAsOf: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Tournament phase row (`tournament_stages`). */
export interface TournamentStage {
  id: string;
  code: TournamentStageCode;
  label: string;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * One pick (`predictions`). Stage + slot: `tournamentStageId`, `groupCode`, `slotKey`.
 * `valueText` holds freeform / bonus answers; `teamId` optional for text-only picks.
 */
export interface Prediction {
  id: string;
  poolId: string;
  participantId: string;
  predictionKind: PredictionKind;
  teamId: string | null;
  tournamentStageId: string | null;
  groupCode: string | null;
  slotKey: string | null;
  bonusKey: string | null;
  valueText: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Official slot outcome (`results`); `kind` matches DB column name. */
export interface Result {
  id: string;
  tournamentStageId: string;
  kind: PredictionKind;
  teamId: string;
  groupCode: string | null;
  slotKey: string | null;
  valueText: string | null;
  resolvedAt: string;
  createdAt: string;
  /** `manual` = admin UI; `sync` = derived from `tournament_matches`. */
  source?: "manual" | "sync";
  /** When true, tournament sync will not replace this row. */
  locked?: boolean;
}

/** Points per pick type within a pool (`scoring_rules`). */
export interface ScoringRule {
  id: string;
  poolId: string;
  predictionKind: PredictionKind;
  /** For `bonus_pick`, matches `predictions.bonus_key` / results slot category. */
  bonusKey: string | null;
  points: number;
  createdAt: string;
  updatedAt: string;
}

/** Score change audit row (`points_ledger`). */
export interface PointsLedgerEntry {
  id: string;
  poolId: string;
  participantId: string;
  pointsDelta: number;
  predictionKind: PredictionKind | null;
  predictionId: string | null;
  resultId: string | null;
  note: string | null;
  createdAt: string;
}

/** Aggregated standing (view or materialized; not a base table). */
export interface LeaderboardEntry {
  poolId: string;
  participantId: string;
  displayName: string;
  totalPoints: number;
  rank: number;
  updatedAt: string;
}

export type { LeaderboardPublicRow } from "../../types/leaderboard";
