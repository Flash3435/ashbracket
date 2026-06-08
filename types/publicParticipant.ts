/** Mapped pick from `predictions_public`. */
export type PublicParticipantPick = {
  predictionId: string;
  predictionKind: string;
  groupCode: string | null;
  slotKey: string | null;
  bonusKey: string | null;
  stageCode: string | null;
  stageLabel: string;
  stageSortOrder: number;
  teamName: string | null;
  teamCountryCode: string | null;
};

/** Mapped row from `points_ledger_public` (no note field). */
export type PublicParticipantLedgerRow = {
  id: string;
  pointsDelta: number;
  predictionKind: string | null;
  createdAt: string;
  predictionId: string | null;
  resultId: string | null;
};

export type PublicParticipantDetail = {
  displayName: string;
  poolName: string;
  poolId: string;
  participantId: string;
  totalPoints: number;
  rank: number;
  picks: PublicParticipantPick[];
  ledger: PublicParticipantLedgerRow[];
};
