import { buildLiveDailyUpdateSuccessMessage } from "../liveDailyUpdateStatus";
import type { SyncOfficialTournamentSummary } from "../syncOfficialTournament";

export function buildLiveScoresApplySuccessMessage(input: {
  editionName: string;
  editionCode: string;
  lastUpdatedAt: string;
  matchesUpdated: number;
  summary: SyncOfficialTournamentSummary;
  warnings: string[];
}): string {
  const base = buildLiveDailyUpdateSuccessMessage({
    summary: input.summary,
    editionName: input.editionName,
    editionCode: input.editionCode,
    lastUpdatedAt: input.lastUpdatedAt,
  });

  const lines = [
    `Applied ${input.matchesUpdated} match score update${input.matchesUpdated === 1 ? "" : "s"} from the live-scores provider.`,
    base,
  ];

  if (input.warnings.length > 0) {
    lines.push(`Warnings: ${input.warnings.join(" ")}`);
  }

  return lines.join(" ");
}
