import type { GlobalActivityEngagementSummary } from "@/lib/poolActivity/globalActivityTypes";

type Props = {
  summary: GlobalActivityEngagementSummary;
};

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-ash-border bg-ash-surface px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ash-muted">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ash-text">
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-ash-muted">{hint}</p> : null}
    </div>
  );
}

export function GlobalActivityEngagementSummaryCards({ summary }: Props) {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <SummaryCard
        label="Active pools today"
        value={summary.activePools24h}
        hint="Pools with activity or reactions in the last 24h"
      />
      <SummaryCard
        label="Activity items today"
        value={summary.activityItems24h}
      />
      <SummaryCard
        label="Picks activity today"
        value={summary.picksActivity24h}
      />
      <SummaryCard label="Reactions today" value={summary.reactions24h} />
      <SummaryCard
        label="Quiet pools"
        value={summary.quietPools24h}
        hint={`No activity in 24h (${summary.quietPools7d} quiet for 7d)`}
      />
    </div>
  );
}
