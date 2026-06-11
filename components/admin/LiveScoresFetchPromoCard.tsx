import Link from "next/link";

type Props = {
  className?: string;
};

export function LiveScoresFetchPromoCard({ className = "" }: Props) {
  return (
    <section
      className={`ash-surface flex flex-col gap-4 border border-sky-500/30 bg-gradient-to-br from-sky-500/10 to-ash-body/40 p-5 ring-1 ring-sky-500/15 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-ash-text">Fetch latest scores</h2>
        <p className="mt-2 text-sm leading-relaxed text-ash-muted">
          Download final scores from the configured provider, preview changes, then
          apply scores and update standings.
        </p>
      </div>
      <Link
        href="/admin/tournament/live-scores"
        className="btn-primary inline-flex shrink-0 text-sm"
      >
        Open live score fetch
      </Link>
    </section>
  );
}
