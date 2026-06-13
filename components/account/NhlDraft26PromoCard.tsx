import Link from "next/link";

type Props = {
  className?: string;
};

export function NhlDraft26PromoCard({ className = "" }: Props) {
  return (
    <section
      className={`rounded-xl border border-ash-border bg-ash-surface p-4 ${className}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <span className="inline-flex rounded-full border border-ash-border bg-ash-body/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ash-muted">
            Draft &apos;26
          </span>
          <h2 className="mt-2 text-base font-bold text-ash-text">Hockey fan?</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-ash-muted">
            Try the NHL Draft 2026 Pick&apos;em. Predict the top 10 picks, compare
            your board with the community, and use your existing AshBracket login to
            save your entry.
          </p>
          <p className="mt-2 text-[11px] text-ash-muted">
            This is separate from your World Cup pool.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <Link
            href="/nhldraft26/picks"
            className="btn-primary inline-flex text-sm"
          >
            Make my NHL Draft picks
          </Link>
          <Link href="/nhldraft26/leaderboard" className="ash-link text-xs">
            View community board
          </Link>
        </div>
      </div>
    </section>
  );
}
