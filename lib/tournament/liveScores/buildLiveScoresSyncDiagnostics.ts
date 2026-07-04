import type {
  ProviderFixtureScore,
  ScoreChangePreview,
  ScoreChangePreviewRow,
  ScoreChangeRowReason,
  TournamentMatchForLiveScores,
} from "./types";

export type LiveScoresSyncDiagnostics = {
  totalDbMatchesEligible: number;
  matchesCheckedInPreview: number;
  dbMatchCountByStage: Record<string, number>;
  skippedByReason: Partial<Record<ScoreChangeRowReason, number>>;
  knockoutMissingProviderFixtureId: Array<{
    matchCode: string;
    stageCode: string;
    homeTeamName: string;
    awayTeamName: string;
    status: string;
  }>;
  unmappedProviderFixtures: Array<{
    providerFixtureId: string;
    label: string;
    kickoffAt: string;
    status: string;
  }>;
};

const KNOCKOUT_STAGE_CODES = new Set([
  "round_of_32",
  "round_of_16",
  "quarterfinal",
  "semifinal",
  "third_place",
  "final",
]);

function isKnockoutStage(stageCode: string): boolean {
  return KNOCKOUT_STAGE_CODES.has(stageCode);
}

export function buildLiveScoresSyncDiagnostics(input: {
  matches: TournamentMatchForLiveScores[];
  preview: ScoreChangePreview;
  fixtures: ProviderFixtureScore[];
  mappedProviderFixtureIds: Set<string>;
}): LiveScoresSyncDiagnostics {
  const dbMatchCountByStage: Record<string, number> = {};
  for (const match of input.matches) {
    dbMatchCountByStage[match.stageCode] = (dbMatchCountByStage[match.stageCode] ?? 0) + 1;
  }

  const skippedByReason: Partial<Record<ScoreChangeRowReason, number>> = {};
  for (const row of input.preview.rows) {
    if (row.willUpdate || row.reason === "unchanged") continue;
    skippedByReason[row.reason] = (skippedByReason[row.reason] ?? 0) + 1;
  }

  const knockoutMissingProviderFixtureId = input.matches
    .filter(
      (m) =>
        isKnockoutStage(m.stageCode) &&
        m.matchCode.startsWith("M") &&
        !m.providerFixtureId,
    )
    .map((m) => ({
      matchCode: m.matchCode,
      stageCode: m.stageCode,
      homeTeamName: m.homeTeamName,
      awayTeamName: m.awayTeamName,
      status: m.status,
    }))
    .sort((a, b) => a.matchCode.localeCompare(b.matchCode, undefined, { numeric: true }));

  const unmappedProviderFixtures = input.fixtures
    .filter((f) => !input.mappedProviderFixtureIds.has(f.providerFixtureId))
    .map((f) => ({
      providerFixtureId: f.providerFixtureId,
      label: `${f.homeTeamName || "?"} vs ${f.awayTeamName || "?"}`,
      kickoffAt: f.kickoffAt,
      status: f.status,
    }))
    .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));

  return {
    totalDbMatchesEligible: input.matches.length,
    matchesCheckedInPreview: input.preview.summary.matchesChecked,
    dbMatchCountByStage,
    skippedByReason,
    knockoutMissingProviderFixtureId,
    unmappedProviderFixtures,
  };
}

export function mappedProviderFixtureIdsFromPreviewRows(
  rows: ScoreChangePreviewRow[],
): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.providerFixtureId) ids.add(row.providerFixtureId);
  }
  return ids;
}

export function formatLiveScoresSyncDiagnosticsSummary(
  diagnostics: LiveScoresSyncDiagnostics,
): string[] {
  const lines: string[] = [
    `DB matches eligible for sync: ${diagnostics.totalDbMatchesEligible}`,
    `Preview rows (matches checked): ${diagnostics.matchesCheckedInPreview}`,
  ];

  const stageParts = Object.entries(diagnostics.dbMatchCountByStage)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([stage, count]) => `${stage}=${count}`);
  if (stageParts.length > 0) {
    lines.push(`By stage: ${stageParts.join(", ")}`);
  }

  const skipParts = Object.entries(diagnostics.skippedByReason)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([reason, count]) => `${reason}=${count}`);
  if (skipParts.length > 0) {
    lines.push(`Excluded from score updates: ${skipParts.join(", ")}`);
  }

  if (diagnostics.knockoutMissingProviderFixtureId.length > 0) {
    lines.push(
      `Knockout rows missing provider_fixture_id: ${diagnostics.knockoutMissingProviderFixtureId.length}`,
    );
  }

  if (diagnostics.unmappedProviderFixtures.length > 0) {
    lines.push(
      `Provider fixtures not matched to DB: ${diagnostics.unmappedProviderFixtures.length}`,
    );
  }

  return lines;
}
