"use client";

import { useMemo, useState, useTransition } from "react";
import {
  formatBackfillCurrentDbStateLabel,
  type MediumCandidateReviewReport,
} from "@/lib/admin/knockoutOutPickBackfillPlanner";
import type { KnockoutOutBackfillReviewSummary } from "@/lib/admin/knockoutOutPickBackfillPlanner";
import type { KnockoutOutBackfillHighConfidenceRow } from "@/lib/admin/loadKnockoutOutPickBackfillReview";
import {
  restoreKnockoutOutBackfillCandidateAction,
  restoreSelectedKnockoutOutBackfillCandidatesAction,
} from "../../app/(worldcup)/admin/knockout-out-backfill/actions";

type Props = {
  summary: KnockoutOutBackfillReviewSummary;
  mediumReports: MediumCandidateReviewReport[];
  highConfidenceRows: KnockoutOutBackfillHighConfidenceRow[];
  manualAuditGaps: string[];
  generatedAt: string;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function formatKind(kind: string, slotKey: string | null): string {
  const label = kind.replaceAll("_", " ");
  return slotKey ? `${label} · slot ${slotKey}` : label;
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warn" | "ok";
}) {
  const toneClass =
    tone === "warn"
      ? "border-amber-800/60 bg-amber-950/30 text-amber-100"
      : tone === "ok"
        ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-100"
        : "border-ash-border/70 bg-ash-body/30 text-ash-text";
  return (
    <div className={`rounded-lg border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export function KnockoutOutBackfillReviewPanel({
  summary,
  mediumReports,
  highConfidenceRows,
  manualAuditGaps,
  generatedAt,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [skippedUiIds, setSkippedUiIds] = useState<Set<string>>(new Set());
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [bulkNote, setBulkNote] = useState("");
  const [status, setStatus] = useState<{ tone: "ok" | "err"; message: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const visibleReports = useMemo(
    () => mediumReports.filter((r) => !skippedUiIds.has(r.candidateId)),
    [mediumReports, skippedUiIds],
  );

  const selectableIds = useMemo(
    () =>
      visibleReports
        .filter((r) => r.suggestedAction === "manual_review")
        .map((r) => r.candidateId),
    [visibleReports],
  );

  function toggleSelected(candidateId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  }

  function restoreOne(candidateId: string) {
    startTransition(async () => {
      setStatus(null);
      const result = await restoreKnockoutOutBackfillCandidateAction({
        candidateId,
        note: notesById[candidateId]?.trim() || undefined,
      });
      if (result.ok) {
        setStatus({ tone: "ok", message: result.message });
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(candidateId);
          return next;
        });
      } else {
        setStatus({ tone: "err", message: result.error });
      }
    });
  }

  function restoreSelected() {
    startTransition(async () => {
      setStatus(null);
      const ids = [...selectedIds];
      const result = await restoreSelectedKnockoutOutBackfillCandidatesAction({
        candidateIds: ids,
        note: bulkNote.trim() || undefined,
      });
      if (!result.ok) {
        setStatus({ tone: "err", message: result.error });
        return;
      }
      const skippedMsg =
        result.skipped.length > 0
          ? ` Skipped ${result.skipped.length}: ${result.skipped.map((s) => s.error).join(" · ")}`
          : "";
      setStatus({
        tone: result.restoredCount > 0 ? "ok" : "err",
        message: `Restored ${result.restoredCount} pick(s).${skippedMsg}`,
      });
      if (result.restoredCount > 0) {
        setSelectedIds(new Set());
      }
    });
  }

  return (
    <div className="space-y-8">
      <section className="ash-surface p-4">
        <h2 className="text-base font-bold text-ash-text">Summary</h2>
        <p className="mt-1 text-sm text-ash-muted">
          Read-only discovery from correction audit logs. Generated{" "}
          {formatWhen(generatedAt)}.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <SummaryCard label="Medium review" value={summary.mediumCandidates} tone="warn" />
          <SummaryCard
            label="High confidence"
            value={summary.highConfidenceCandidates}
          />
          <SummaryCard label="Conflicts" value={summary.conflicts} tone="warn" />
          <SummaryCard label="Already out" value={summary.alreadyOut} />
          <SummaryCard label="Missing team ID" value={summary.missingTeamId} />
          <SummaryCard label="Audit gaps" value={summary.auditGaps} tone="warn" />
        </div>
        <p className="mt-4 rounded-md border border-amber-800/60 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
          Restore only if you are confident this was a historical locked pick that
          should remain visible as out. Parsed audit text can misidentify team or
          slot — verify participant picks and correction context first.
        </p>
      </section>

      {status ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            status.tone === "ok"
              ? "border-emerald-800/70 bg-emerald-950/35 text-emerald-100"
              : "border-red-800/70 bg-red-950/35 text-red-200"
          }`}
          role="status"
        >
          {status.message}
        </p>
      ) : null}

      <section className="ash-surface p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-ash-text">
              Medium-confidence candidates
            </h2>
            <p className="mt-1 text-sm text-ash-muted">
              {summary.restorableMedium} appear restorable after review. Conflicts
              and already-out rows cannot be restored from here.
            </p>
          </div>
          {selectableIds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-ash-muted">
                Bulk note (optional)
                <input
                  type="text"
                  value={bulkNote}
                  onChange={(e) => setBulkNote(e.target.value)}
                  className="mt-1 block w-56 rounded border border-ash-border bg-ash-body px-2 py-1 text-sm text-ash-text"
                  placeholder="Verified in admin UI"
                  disabled={pending}
                />
              </label>
              <button
                type="button"
                className="rounded-md border border-emerald-700/70 bg-emerald-950/40 px-3 py-2 text-sm font-semibold text-emerald-100 disabled:opacity-50"
                disabled={pending || selectedIds.size === 0}
                onClick={restoreSelected}
              >
                Restore selected ({selectedIds.size})
              </button>
            </div>
          ) : null}
        </div>

        {visibleReports.length === 0 ? (
          <p className="mt-4 text-sm text-ash-muted">
            No medium-confidence candidates need review.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-ash-border text-xs uppercase tracking-wide text-ash-muted">
                <tr>
                  <th className="px-2 py-2">Select</th>
                  <th className="px-2 py-2">Participant</th>
                  <th className="px-2 py-2">Pool</th>
                  <th className="px-2 py-2">Audit</th>
                  <th className="px-2 py-2">Pick</th>
                  <th className="px-2 py-2">Team</th>
                  <th className="px-2 py-2">Current DB</th>
                  <th className="px-2 py-2">Audit line</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleReports.map((report) => {
                  const canRestore = report.suggestedAction === "manual_review";
                  const canSelect = canRestore;
                  return (
                    <tr
                      key={report.candidateId}
                      className="border-b border-ash-border/50 align-top"
                    >
                      <td className="px-2 py-3">
                        {canSelect ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(report.candidateId)}
                            onChange={() => toggleSelected(report.candidateId)}
                            disabled={pending}
                            aria-label={`Select ${report.participantName}`}
                          />
                        ) : (
                          <span className="text-ash-muted">—</span>
                        )}
                      </td>
                      <td className="px-2 py-3 font-medium text-ash-text">
                        {report.participantName}
                      </td>
                      <td className="px-2 py-3 text-ash-muted">{report.poolName}</td>
                      <td className="px-2 py-3 text-ash-muted">
                        <div>{formatWhen(report.auditTimestamp)}</div>
                        <div className="text-xs">
                          {report.matchCode}
                          {report.auditActor ? ` · ${report.auditActor}` : ""}
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <div>{formatKind(report.predictionKind, report.slotKey)}</div>
                        <div className="text-xs text-ash-muted">
                          {report.invalidReason}
                        </div>
                      </td>
                      <td className="px-2 py-3">{report.teamName}</td>
                      <td className="px-2 py-3">
                        <div>{formatBackfillCurrentDbStateLabel(report.currentDbState)}</div>
                        <div className="text-xs text-ash-muted">
                          Suggested: {report.suggestedAction.replaceAll("_", " ")}
                        </div>
                      </td>
                      <td className="max-w-xs px-2 py-3 text-xs text-ash-muted">
                        {report.clearedSummaryLine ?? "—"}
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[11px] text-ash-muted">
                            Details
                          </summary>
                          <p className="mt-1 text-[11px]">{report.confidenceExplanation}</p>
                          <p className="mt-1 break-all text-[11px] opacity-70">
                            ID: {report.candidateId}
                          </p>
                        </details>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex min-w-[10rem] flex-col gap-2">
                          <input
                            type="text"
                            value={notesById[report.candidateId] ?? ""}
                            onChange={(e) =>
                              setNotesById((prev) => ({
                                ...prev,
                                [report.candidateId]: e.target.value,
                              }))
                            }
                            className="rounded border border-ash-border bg-ash-body px-2 py-1 text-xs text-ash-text"
                            placeholder="Review note (optional)"
                            disabled={pending || !canRestore}
                          />
                          <button
                            type="button"
                            className="rounded border border-emerald-700/70 bg-emerald-950/40 px-2 py-1 text-xs font-semibold text-emerald-100 disabled:opacity-50"
                            disabled={pending || !canRestore}
                            onClick={() => restoreOne(report.candidateId)}
                          >
                            Restore as out
                          </button>
                          <button
                            type="button"
                            className="rounded border border-ash-border px-2 py-1 text-xs text-ash-muted disabled:opacity-50"
                            disabled={pending}
                            onClick={() =>
                              setSkippedUiIds((prev) => new Set(prev).add(report.candidateId))
                            }
                          >
                            Skip / hide
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ash-surface p-4">
        <h2 className="text-base font-bold text-ash-text">High-confidence candidates</h2>
        <p className="mt-1 text-sm text-ash-muted">
          Structured `markedOutPicks` audit metadata. Use CLI{" "}
          <code className="text-xs">--apply</code> for batch restore, or restore from
          admin picks if needed. Not mixed into medium review actions above.
        </p>
        {highConfidenceRows.length === 0 ? (
          <p className="mt-3 text-sm text-ash-muted">None found in current audit logs.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {highConfidenceRows.map((row) => (
              <li
                key={row.candidateId}
                className="rounded-md border border-ash-border/60 bg-ash-body/20 px-3 py-2"
              >
                <span className="font-medium text-ash-text">{row.participantName}</span>
                <span className="text-ash-muted"> · {row.poolName}</span>
                <span className="text-ash-muted"> · {row.matchCode}</span>
                <div className="mt-1 text-ash-muted">
                  {formatKind(row.predictionKind, row.slotKey)} · {row.teamName} ·{" "}
                  planned {row.plannedAction.replaceAll("_", " ")}
                  {row.detail ? ` — ${row.detail}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {manualAuditGaps.length > 0 ? (
        <section className="ash-surface p-4">
          <h2 className="text-base font-bold text-ash-text">Manual audit gaps</h2>
          <p className="mt-1 text-sm text-ash-muted">
            Likely old repair deletions without enough audit metadata to reconstruct.
          </p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-amber-100">
            {manualAuditGaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
