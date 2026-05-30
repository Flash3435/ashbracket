import type {
  PickSectionProgress,
  PickSectionStatus,
  PicksProgressSummary,
} from "../../lib/picks/picksProgressSummary";

type Props = {
  summary: PicksProgressSummary;
  /** When set, show a continue CTA (edit wizard). */
  onContinue?: () => void;
  /** Bracket view hint — suggest list view for editing. */
  showListViewHint?: boolean;
  onSwitchToListView?: () => void;
  className?: string;
};

const STATUS_LABEL: Record<PickSectionStatus, string> = {
  complete: "Complete",
  partial: "In progress",
  not_started: "Not started",
  locked: "Opens later",
};

function statusChipClass(status: PickSectionStatus): string {
  switch (status) {
    case "complete":
      return "border-ash-accent/40 bg-ash-accent/10 text-ash-accent";
    case "partial":
      return "border-amber-700/45 bg-amber-950/30 text-amber-100";
    case "not_started":
      return "border-ash-border bg-ash-body/30 text-ash-muted";
    case "locked":
      return "border-sky-800/45 bg-sky-950/25 text-sky-100";
  }
}

function SectionChip({ section }: { section: PickSectionProgress }) {
  return (
    <div
      className={`flex min-w-[8.5rem] flex-1 flex-col gap-1 rounded-lg border px-3 py-2 ${statusChipClass(section.status)}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ash-text">{section.shortLabel}</p>
        <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-90">
          {STATUS_LABEL[section.status]}
        </span>
      </div>
      <p className="text-[11px] leading-snug opacity-90">{section.detailLine}</p>
      {section.status === "partial" && section.missing > 0 ? (
        <p className="text-[10px] font-medium opacity-80">
          {section.missing} missing
        </p>
      ) : null}
    </div>
  );
}

export function PicksProgressSummaryPanel({
  summary,
  onContinue,
  showListViewHint = false,
  onSwitchToListView,
  className = "",
}: Props) {
  const { nextSection, picksComplete, waitingForR32 } = summary;
  const showContinue =
    onContinue != null && nextSection != null && !picksComplete && !waitingForR32;

  return (
    <div
      id="picks-progress-summary"
      className={`rounded-lg border border-ash-border/80 bg-gradient-to-br from-ash-surface to-ash-body/40 px-4 py-3.5 ${className}`}
      role="region"
      aria-label="Pick progress"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={`text-base font-semibold ${
              waitingForR32
                ? "text-sky-100"
                : picksComplete
                  ? "text-ash-accent"
                  : "text-ash-text"
            }`}
          >
            {summary.overallHeadline}
          </p>
          {summary.overallDetail ? (
            <p className="mt-1.5 text-sm leading-relaxed text-ash-muted">
              {summary.overallDetail}
            </p>
          ) : null}
        </div>
        {waitingForR32 ? (
          <span className="shrink-0 rounded-full border border-sky-700/45 bg-sky-950/35 px-2.5 py-1 text-xs font-semibold text-sky-100">
            Waiting
          </span>
        ) : picksComplete ? (
          <span className="shrink-0 rounded-full border border-ash-accent/40 bg-ash-accent/15 px-2.5 py-1 text-xs font-semibold text-ash-accent">
            Complete
          </span>
        ) : summary.actionableMissingCount > 0 ? (
          <span className="shrink-0 rounded-full border border-amber-700/45 bg-amber-950/30 px-2.5 py-1 text-xs font-semibold tabular-nums text-amber-100">
            {summary.actionableMissingCount} left
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {summary.sections.map((section) => (
          <SectionChip key={section.id} section={section} />
        ))}
      </div>

      {showContinue || (showListViewHint && onSwitchToListView) ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-ash-border/60 pt-3">
          {showContinue && nextSection ? (
            <button
              type="button"
              onClick={onContinue}
              className="rounded-lg bg-ash-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-ash-accent/90"
            >
              {nextSection.ctaLabel}
            </button>
          ) : null}
          {showListViewHint && onSwitchToListView ? (
            <button
              type="button"
              onClick={onSwitchToListView}
              className="rounded-lg border border-ash-border bg-ash-body px-3 py-1.5 text-xs font-semibold text-ash-text transition hover:bg-ash-surface"
            >
              Switch to List view to edit
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
