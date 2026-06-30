"use client";

import type {
  PicksPageStatusCtaAction,
  PicksPageStatusModel,
} from "@/lib/picks/buildPicksPageStatus";

type Props = {
  model: PicksPageStatusModel;
  onCta?: (action: PicksPageStatusCtaAction) => void;
  saveDisabled?: boolean;
  className?: string;
};

function shellClass(tone: PicksPageStatusModel["tone"]): string {
  switch (tone) {
    case "warning":
      return "border-amber-700/50 bg-amber-950/25";
    case "action":
      return "border-amber-700/50 bg-amber-950/25";
    case "complete":
      return "border-emerald-700/40 bg-emerald-950/20";
  }
}

export function PicksPageStatusCard({
  model,
  onCta,
  saveDisabled = false,
  className = "",
}: Props) {
  const showCta = model.ctaLabel && model.ctaAction && onCta;

  return (
    <section
      className={`rounded-xl border p-4 ${shellClass(model.tone)} ${className}`}
      role="status"
      data-picks-page-status={model.kind}
    >
      <h2 className="text-base font-bold text-ash-text">{model.headline}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ash-muted">{model.detail}</p>
      {showCta ? (
        model.ctaAction === "save" ? (
          <button
            type="button"
            disabled={saveDisabled}
            onClick={() => onCta!(model.ctaAction!)}
            className="btn-primary mt-3 inline-flex text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {model.ctaLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onCta!(model.ctaAction!)}
            className="btn-primary mt-3 inline-flex text-sm"
          >
            {model.ctaLabel}
          </button>
        )
      ) : null}
    </section>
  );
}
