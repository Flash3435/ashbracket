export type LiveScoreProviderStatus =
  | "scheduled"
  | "live"
  | "finished"
  | "postponed"
  | "cancelled";

export type ProviderFixtureScore = {
  providerFixtureId: string;
  kickoffAt: string;
  homeTeamName: string;
  awayTeamName: string;
  homeFifaCode: string | null;
  awayFifaCode: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
  homePenalties: number | null;
  awayPenalties: number | null;
  status: LiveScoreProviderStatus;
};

export type LiveScoresProviderConfig = {
  provider: string;
  configured: boolean;
  configWarning: string | null;
  apiFootballKey?: string;
  apiFootballLeagueId?: string;
  apiFootballSeason?: string;
};

export type LiveScoresFetchResult =
  | { ok: true; provider: string; fixtures: ProviderFixtureScore[] }
  | { ok: false; provider: string; error: string; configWarning?: string | null };

export type ScoreChangeRowReason =
  | "will_update"
  | "unchanged"
  | "sync_locked"
  | "not_finished"
  | "in_progress"
  | "unmapped"
  | "ambiguous"
  | "postponed"
  | "cancelled"
  | "no_score";

export type CardChangeRowReason =
  | "will_update"
  | "unchanged"
  | "no_event_data"
  | "manual_conflict"
  | "skipped"
  | "unmapped";

export type MatchCardSideTotals = {
  yellowCards: number | null;
  redCards: number | null;
};

export type MatchCardStatsSnapshot = {
  manual: { home: MatchCardSideTotals; away: MatchCardSideTotals } | null;
  provider: { home: MatchCardSideTotals; away: MatchCardSideTotals } | null;
};

export type TournamentMatchForLiveScores = {
  id: string;
  matchCode: string;
  kickoffAt: string;
  providerFixtureId: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeFifaCode: string | null;
  awayFifaCode: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
  homePenalties: number | null;
  awayPenalties: number | null;
  status: string;
  syncLocked: boolean;
};

export type ScoreChangePreviewRow = {
  matchId: string;
  matchCode: string;
  providerFixtureId: string | null;
  homeTeamName: string;
  awayTeamName: string;
  currentHomeGoals: number | null;
  currentAwayGoals: number | null;
  currentHomePenalties: number | null;
  currentAwayPenalties: number | null;
  fetchedHomeGoals: number | null;
  fetchedAwayGoals: number | null;
  fetchedHomePenalties: number | null;
  fetchedAwayPenalties: number | null;
  currentStatus: string;
  fetchedStatus: LiveScoreProviderStatus | null;
  willUpdate: boolean;
  reason: ScoreChangeRowReason;
  currentHomeYellowCards: number | null;
  currentAwayYellowCards: number | null;
  currentHomeRedCards: number | null;
  currentAwayRedCards: number | null;
  fetchedHomeYellowCards: number | null;
  fetchedAwayYellowCards: number | null;
  fetchedHomeRedCards: number | null;
  fetchedAwayRedCards: number | null;
  cardWillUpdate: boolean;
  cardReason: CardChangeRowReason;
  warnings: string[];
};

export type ScoreChangePreview = {
  previewId: string;
  provider: string;
  providerConfigured: boolean;
  configWarning: string | null;
  fetchedAt: string;
  rows: ScoreChangePreviewRow[];
  summary: {
    matchesChecked: number;
    willUpdate: number;
    unchanged: number;
    skipped: number;
    warnings: number;
    unmappedProviderFixtures: number;
    fixturesMissingIdentity: number;
    cardsWillUpdate: number;
    cardsUnchanged: number;
    cardsManualConflict: number;
    cardsNoEventData: number;
  };
  /** Provider fixtures excluded from mapping because team/kickoff identity was incomplete. */
  fixtureIdentityWarnings: string[];
  message: string | null;
};

export type OfficialMatchScorePatchInput = {
  matchCode: string;
  homeGoals: number;
  awayGoals: number;
  homePenalties?: number | null;
  awayPenalties?: number | null;
  status?: "scheduled" | "live" | "finished" | "postponed" | "cancelled";
  providerFixtureId?: string | null;
};

export type ProviderCardPatchInput = {
  matchId: string;
  matchCode: string;
  editionId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeYellowCards: number;
  awayYellowCards: number;
  homeRedCards: number;
  awayRedCards: number;
};

export type LiveScoresApplyCardDetail = {
  matchCode: string;
  matchId: string;
  planned: boolean;
  written: boolean;
  verified: boolean;
  reason: string | null;
  expectedCards: string | null;
  actualCards: string | null;
};

export type LiveScoresApplyMatchDetail = {
  matchCode: string;
  matchId: string | null;
  planned: boolean;
  written: boolean;
  verified: boolean;
  reason: string | null;
  expectedScore: string | null;
  actualScore: string | null;
  expectedStatus: string | null;
  actualStatus: string | null;
  expectedWinnerTeamId: string | null;
  actualWinnerTeamId: string | null;
};

export type LiveScoresApplySummary = {
  planned: number;
  written: number;
  skipped: number;
  failedVerification: number;
  providerFixtureIdsSaved: number;
  ledgersRecomputed: number;
  cardsPlanned: number;
  cardsWritten: number;
  cardsSkipped: number;
  cardsManualConflict: number;
  cardsFailedVerification: number;
  revalidatedPaths: string[];
  details: LiveScoresApplyMatchDetail[];
  cardDetails: LiveScoresApplyCardDetail[];
};
