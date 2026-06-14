import Link from "next/link";

type Props = {
  poolName: string;
  entryCount: number;
  revealHref?: string | null;
};

export function LeaderboardWaitingState({
  poolName,
  entryCount,
  revealHref = null,
}: Props) {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-amber-500/25 bg-amber-950/15 px-5 py-6 sm:px-6">
        <h2 className="text-lg font-bold text-ash-text sm:text-xl">
          Standings are waiting for the first awarded points
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ash-muted">
          Everyone is still at 0 because no official pool points have landed yet.
          Group-stage advancement points are awarded after each group is complete.
          Once points are awarded, this page will show the leaders, rank changes,
          and each participant&apos;s scoring breakdown.
        </p>
        {revealHref ? (
          <p className="mt-3 text-sm">
            <Link href={revealHref} className="ash-link font-medium">
              See everyone&apos;s picks
            </Link>
            <span className="text-ash-muted"> while you wait for scoring.</span>
          </p>
        ) : null}
      </section>

      <section className="grid max-w-md grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-ash-border/60 bg-ash-body/30 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ash-muted">
            Entries
          </p>
          <p className="mt-1 text-lg font-bold text-ash-text">{entryCount}</p>
        </div>
        <div className="rounded-lg border border-ash-border/60 bg-ash-body/30 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ash-muted">
            Points awarded
          </p>
          <p className="mt-1 text-lg font-bold text-ash-text">0</p>
        </div>
        <div className="col-span-2 rounded-lg border border-ash-border/60 bg-ash-body/30 px-3 py-2.5 sm:col-span-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ash-muted">
            Next
          </p>
          <p className="mt-1 text-sm font-medium text-ash-text">
            Group results need to complete
          </p>
        </div>
      </section>

      <p className="text-xs text-ash-muted">{poolName}</p>
    </div>
  );
}
