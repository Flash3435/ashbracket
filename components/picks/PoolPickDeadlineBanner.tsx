import type { PoolPickDeadlineStatus } from "../../lib/picks/poolPickDeadlineDisplay";

type Props = {
  status: PoolPickDeadlineStatus;
  className?: string;
};

function toneClasses(tone: PoolPickDeadlineStatus["tone"]): string {
  switch (tone) {
    case "open":
      return "border-sky-800/45 bg-sky-950/20 text-sky-100";
    case "soon":
      return "border-amber-700/45 bg-amber-950/25 text-amber-100";
    case "locked":
      return "border-amber-700/50 bg-amber-950/30 text-amber-100";
    case "neutral":
      return "border-ash-border/80 bg-ash-surface/60 text-ash-muted";
  }
}

function chipClasses(tone: PoolPickDeadlineStatus["tone"]): string {
  switch (tone) {
    case "open":
      return "border-sky-700/40 bg-sky-950/35 text-sky-100";
    case "soon":
      return "border-amber-600/40 bg-amber-950/40 text-amber-50";
    case "locked":
      return "border-amber-600/45 bg-amber-950/45 text-amber-50";
    case "neutral":
      return "border-ash-border bg-ash-body/40 text-ash-muted";
  }
}

export function PoolPickDeadlineBanner({ status, className = "" }: Props) {
  const chipText = status.preKnockoutLocked
    ? "Locked"
    : status.chipLabel === "open"
      ? "Open"
      : status.chipLabel;

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${toneClasses(status.tone)} ${className}`}
      role="status"
      aria-label="Pick deadline"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-snug text-ash-text">
          {status.headline}
        </p>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${chipClasses(status.tone)}`}
        >
          {chipText}
        </span>
      </div>
      {status.deadlineLabel && !status.preKnockoutLocked ? (
        <p className="mt-1.5 text-xs text-ash-muted">
          Deadline:{" "}
          <span className="font-medium text-ash-text">{status.deadlineLabel}</span>
        </p>
      ) : null}
      {status.detail ? (
        <p className="mt-1.5 text-sm leading-relaxed opacity-95">{status.detail}</p>
      ) : null}
    </div>
  );
}
