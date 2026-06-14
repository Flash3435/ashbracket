import Link from "next/link";
import {
  STANDINGS_WARMING_UP_BODY,
  STANDINGS_WARMING_UP_HEADLINE,
} from "@/lib/leaderboard/bracketOutlookSeparation";

type Props = {
  poolName: string;
  entryCount: number;
  decisiveResultCount?: number;
  revealHref?: string | null;
};

export function StandingsWarmingUpState({
  poolName,
  entryCount,
  decisiveResultCount = 0,
  revealHref = null,
}: Props) {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-amber-500/25 bg-amber-950/15 px-5 py-6 sm:px-6">
        <h2 className="text-lg font-bold text-ash-text sm:text-xl">
          {STANDINGS_WARMING_UP_HEADLINE}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ash-muted">
          {STANDINGS_WARMING_UP_BODY}
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
            Decisive results counted
          </p>
          <p className="mt-1 text-lg font-bold text-ash-text">{decisiveResultCount}</p>
        </div>
        <div className="col-span-2 rounded-lg border border-ash-border/60 bg-ash-body/30 px-3 py-2.5 sm:col-span-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ash-muted">
            Official points
          </p>
          <p className="mt-1 text-lg font-bold text-ash-text">0</p>
        </div>
      </section>

      <p className="text-xs text-ash-muted">{poolName}</p>
    </div>
  );
}
