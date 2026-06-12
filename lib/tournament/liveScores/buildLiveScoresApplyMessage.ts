import { buildLiveDailyUpdateSuccessMessage } from "../liveDailyUpdateStatus";
import type { SyncOfficialTournamentSummary } from "../syncOfficialTournament";
import type { LiveScoresApplySummary } from "./types";

export function buildLiveScoresApplySuccessMessage(input: {
  editionName: string;
  editionCode: string;
  lastUpdatedAt: string;
  matchesUpdated: number;
  summary: SyncOfficialTournamentSummary;
  applySummary: LiveScoresApplySummary;
  warnings: string[];
}): string {
  const base = buildLiveDailyUpdateSuccessMessage({
    summary: input.summary,
    editionName: input.editionName,
    editionCode: input.editionCode,
    lastUpdatedAt: input.lastUpdatedAt,
  });

  const lines = [
    `Applied ${input.matchesUpdated} of ${input.applySummary.planned} planned match score update${input.applySummary.planned === 1 ? "" : "s"} from the live-scores provider.`,
    `Scores — written: ${input.applySummary.written}; skipped: ${input.applySummary.skipped}; failed verification: ${input.applySummary.failedVerification}.`,
    `Cards — planned: ${input.applySummary.cardsPlanned}; written: ${input.applySummary.cardsWritten}; skipped: ${input.applySummary.cardsSkipped}; manual conflicts: ${input.applySummary.cardsManualConflict}; failed verification: ${input.applySummary.cardsFailedVerification}.`,
    `Provider ids saved: ${input.applySummary.providerFixtureIdsSaved}; ledgers recomputed: ${input.applySummary.ledgersRecomputed}.`,
    `Revalidated: ${input.applySummary.revalidatedPaths.join(", ")}.`,
    base,
  ];

  const failed = input.applySummary.details.filter((d) => d.planned && !d.verified);
  if (failed.length > 0) {
    lines.push(
      `Failed matches: ${failed
        .map(
          (d) =>
            `${d.matchCode} (expected ${d.expectedScore ?? "—"} / ${d.expectedStatus ?? "finished"}, got ${d.actualScore ?? "—"} / ${d.actualStatus ?? "—"}${d.reason ? ` — ${d.reason}` : ""})`,
        )
        .join("; ")}`,
    );
  }

  if (input.warnings.length > 0) {
    lines.push(`Warnings: ${input.warnings.join(" ")}`);
  }

  return lines.join(" ");
}

export function buildLiveScoresApplyFailureMessage(input: {
  error: string;
  applySummary?: LiveScoresApplySummary;
}): string {
  if (!input.applySummary) return input.error;

  const lines = [
    input.error,
    `Scores — planned: ${input.applySummary.planned}; written: ${input.applySummary.written}; skipped: ${input.applySummary.skipped}; failed verification: ${input.applySummary.failedVerification}.`,
    `Cards — planned: ${input.applySummary.cardsPlanned}; written: ${input.applySummary.cardsWritten}; manual conflicts: ${input.applySummary.cardsManualConflict}; failed verification: ${input.applySummary.cardsFailedVerification}.`,
  ];

  const failed = input.applySummary.details.filter((d) => d.planned && !d.verified);
  if (failed.length > 0) {
    lines.push(
      failed
        .map(
          (d) =>
            `${d.matchCode}: expected ${d.expectedScore ?? "—"} (${d.expectedStatus ?? "finished"}), database has ${d.actualScore ?? "—"} (${d.actualStatus ?? "missing"})${d.reason ? ` — ${d.reason}` : ""}`,
        )
        .join(" "),
    );
  }

  return lines.join(" ");
}
