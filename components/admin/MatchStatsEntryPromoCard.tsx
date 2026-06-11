import Link from "next/link";

type Props = {
  className?: string;
};

export function MatchStatsEntryPromoCard({ className = "" }: Props) {
  return (
    <section
      className={`ash-surface flex flex-col gap-4 border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-ash-body/40 p-5 ring-1 ring-amber-500/15 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ash-muted">
          Option B — manual entry
        </p>
        <h2 className="mt-1 text-lg font-bold text-ash-text">Enter match scores and cards</h2>
        <p className="mt-2 text-sm leading-relaxed text-ash-muted">
          Manually enter final scores, yellow cards, and red cards for each match. Then
          recompute standings from stored scores.
        </p>
      </div>
      <Link
        href="/admin/tournament/match-stats"
        className="btn-primary inline-flex shrink-0 text-sm"
      >
        Open match stats
      </Link>
    </section>
  );
}
