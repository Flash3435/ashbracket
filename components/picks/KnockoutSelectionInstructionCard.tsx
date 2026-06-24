import Link from "next/link";
import type { KnockoutSelectionInstructionCardModel } from "@/lib/picks/knockoutSelectionWindow";
import { KnockoutSelectionCountdown } from "./KnockoutSelectionCountdown";

type Props = {
  model: KnockoutSelectionInstructionCardModel;
  className?: string;
};

const TONE_STYLES: Record<
  KnockoutSelectionInstructionCardModel["tone"],
  { shell: string; badge: string; title: string; body: string; meta: string }
> = {
  upcoming: {
    shell: "border-sky-800/45 bg-gradient-to-br from-sky-950/35 to-ash-body/20",
    badge: "bg-sky-900/50 text-sky-200",
    title: "text-sky-50",
    body: "text-sky-100/95",
    meta: "text-sky-200/90",
  },
  open: {
    shell: "border-emerald-800/45 bg-gradient-to-br from-emerald-950/30 to-ash-body/20",
    badge: "bg-emerald-900/50 text-emerald-200",
    title: "text-emerald-50",
    body: "text-emerald-100/95",
    meta: "text-emerald-200/90",
  },
  locking: {
    shell: "border-amber-800/45 bg-gradient-to-br from-amber-950/30 to-ash-body/20",
    badge: "bg-amber-900/50 text-amber-200",
    title: "text-amber-50",
    body: "text-amber-100/95",
    meta: "text-amber-200/90",
  },
};

const BADGE_LABEL: Record<KnockoutSelectionInstructionCardModel["tone"], string> = {
  upcoming: "Upcoming",
  open: "Open now",
  locking: "Locking",
};

export function KnockoutSelectionInstructionCard({ model, className = "" }: Props) {
  const styles = TONE_STYLES[model.tone];

  return (
    <div
      className={`rounded-lg border px-4 py-3.5 ${styles.shell} ${className}`}
      role="status"
      data-knockout-selection-phase={model.phase}
    >
      <div className="flex flex-wrap items-start gap-2">
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles.badge}`}
        >
          {BADGE_LABEL[model.tone]}
        </span>
        <p className={`text-sm font-semibold ${styles.title}`}>{model.title}</p>
      </div>

      <p className={`mt-2 text-sm leading-relaxed ${styles.body}`}>{model.body}</p>

      {(model.expectedUnlockLine ||
        model.countdown ||
        model.upcomingFallbackLine) && (
        <dl className={`mt-3 space-y-1.5 text-xs ${styles.meta}`}>
          {model.expectedUnlockLine ? (
            <div>
              <dt className="sr-only">Expected unlock</dt>
              <dd>{model.expectedUnlockLine}</dd>
            </div>
          ) : null}
          {model.countdown ? (
            <div className="flex flex-wrap items-baseline gap-x-1.5">
              <dt className="font-medium">{model.countdown.label}:</dt>
              <dd className="font-semibold tabular-nums text-ash-text">
                <KnockoutSelectionCountdown targetIso={model.countdown.targetIso} />
              </dd>
            </div>
          ) : null}
          {model.upcomingFallbackLine ? (
            <div>
              <dt className="sr-only">Timing note</dt>
              <dd className="italic">{model.upcomingFallbackLine}</dd>
            </div>
          ) : null}
        </dl>
      )}

      {model.cta ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link
            href={model.cta.href}
            className={
              model.tone === "open"
                ? "btn-primary inline-flex py-1.5 text-xs"
                : "rounded-lg border border-amber-600/50 bg-amber-900/40 px-3 py-1.5 text-xs font-semibold text-amber-50 transition hover:bg-amber-900/60"
            }
          >
            {model.cta.label}
          </Link>
        </div>
      ) : null}

      {model.helperText ? (
        <p className={`mt-2 text-xs ${styles.meta}`}>{model.helperText}</p>
      ) : null}
    </div>
  );
}
