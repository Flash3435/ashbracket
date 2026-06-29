import { buildLiveDailyUpdateSuccessMessage } from "../liveDailyUpdateStatus";
import type { SyncOfficialTournamentSummary } from "../syncOfficialTournament";
import type { LiveScoresApplySummary } from "./types";

export function isCardOnlyLiveScoresApply(applySummary: LiveScoresApplySummary): boolean {
  return applySummary.planned === 0 && applySummary.cardsPlanned > 0;
}

function cardSummaryLine(applySummary: LiveScoresApplySummary): string {
  return `Cards — planned: ${applySummary.cardsPlanned}; written: ${applySummary.cardsWritten}; skipped: ${applySummary.cardsSkipped}; manual conflicts: ${applySummary.cardsManualConflict}; failed verification: ${applySummary.cardsFailedVerification}.`;
}

function scoreSummaryLines(input: {
  matchesUpdated: number;
  applySummary: LiveScoresApplySummary;
}): string[] {
  if (input.applySummary.planned === 0) return [];

  return [
    `Applied ${input.matchesUpdated} of ${input.applySummary.planned} planned match score update${input.applySummary.planned === 1 ? "" : "s"} from the live-scores provider.`,
    `Scores — written: ${input.applySummary.written}; skipped: ${input.applySummary.skipped}; failed verification: ${input.applySummary.failedVerification}.`,
    `Provider ids saved: ${input.applySummary.providerFixtureIdsSaved}; ledgers recomputed: ${input.applySummary.ledgersRecomputed}.`,
  ];
}

function buildCardOnlySuccessMessage(input: {
  editionName: string;
  editionCode: string;
  applySummary: LiveScoresApplySummary;
  warnings: string[];
}): string {
  const lines = [
    `Provider card totals saved for edition “${input.editionName}” (${input.editionCode}).`,
    cardSummaryLine(input.applySummary),
    "No score patches were applied — match scores and pool point ledgers were not recalculated.",
    "Bonus Watch and tournament stat leader pages were revalidated to pick up updated card totals.",
    `Revalidated: ${input.applySummary.revalidatedPaths.join(", ")}.`,
  ];

  if (input.warnings.length > 0) {
    lines.push(`Warnings: ${input.warnings.join(" ")}`);
  }

  return lines.join(" ");
}

export function buildLiveScoresScoresSavedMessage(input: {
  editionName: string;
  editionCode: string;
  lastUpdatedAt: string;
  matchesUpdated: number;
  summary: SyncOfficialTournamentSummary;
  applySummary: LiveScoresApplySummary;
  warnings: string[];
  pendingPoolCount: number;
}): string {
  const lines = [
    ...scoreSummaryLines({
      matchesUpdated: input.matchesUpdated,
      applySummary: input.applySummary,
    }),
    `Official match scores and derived knockout results were saved for edition “${input.editionName}” (${input.editionCode}).`,
    `${input.summary.derivedResultsInserted} derived result row(s) rebuilt; bracket propagation applied.`,
    `Live pool standings were not recalculated yet — ${input.pendingPoolCount} live pool(s) still need Step B.`,
    `Last scores update recorded at ${input.lastUpdatedAt}.`,
  ];

  if (input.applySummary.cardsPlanned > 0) {
    lines.splice(2, 0, cardSummaryLine(input.applySummary));
  }

  if (input.warnings.length > 0) {
    lines.push(`Warnings: ${input.warnings.join(" ")}`);
  }

  return lines.join(" ");
}

export function buildLiveScoresApplySuccessMessage(input: {
  editionName: string;
  editionCode: string;
  lastUpdatedAt: string;
  matchesUpdated: number;
  summary: SyncOfficialTournamentSummary;
  applySummary: LiveScoresApplySummary;
  warnings: string[];
}): string {
  if (isCardOnlyLiveScoresApply(input.applySummary)) {
    return buildCardOnlySuccessMessage({
      editionName: input.editionName,
      editionCode: input.editionCode,
      applySummary: input.applySummary,
      warnings: input.warnings,
    });
  }

  const lines = [
    ...scoreSummaryLines({
      matchesUpdated: input.matchesUpdated,
      applySummary: input.applySummary,
    }),
  ];

  if (input.applySummary.cardsPlanned > 0) {
    lines.push(cardSummaryLine(input.applySummary));
  }

  lines.push(`Revalidated: ${input.applySummary.revalidatedPaths.join(", ")}.`);

  lines.push(
    buildLiveDailyUpdateSuccessMessage({
      summary: input.summary,
      editionName: input.editionName,
      editionCode: input.editionCode,
      lastUpdatedAt: input.lastUpdatedAt,
    }),
  );

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
