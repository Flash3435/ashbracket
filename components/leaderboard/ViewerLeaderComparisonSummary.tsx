import type { ViewerLeaderComparison } from "@/lib/leaderboard/buildViewerLeaderComparison";

type Props = {
  comparison: ViewerLeaderComparison;
};

/** Compact viewer-vs-leader note for public pool and participant pages. */
export function ViewerLeaderComparisonSummary({ comparison }: Props) {
  return (
    <aside
      className="rounded-xl border border-sky-500/25 bg-gradient-to-r from-sky-950/35 to-sky-950/10 px-4 py-3.5 sm:px-5"
      aria-label="Your standing compared to the leader"
    >
      <p className="text-sm font-semibold text-sky-100">{comparison.headline}</p>
      <p className="mt-1 text-sm leading-relaxed text-ash-muted">{comparison.detail}</p>
      <dl className="mt-3 flex flex-wrap gap-2">
        {comparison.chips.map((chip) => (
          <div
            key={chip.label}
            className="rounded-lg border border-ash-border/60 bg-ash-body/35 px-3 py-2"
          >
            <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ash-muted">
              {chip.label}
            </dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ash-text">
              {chip.value}
            </dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
