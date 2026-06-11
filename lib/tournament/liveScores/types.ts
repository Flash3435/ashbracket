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
  };
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
