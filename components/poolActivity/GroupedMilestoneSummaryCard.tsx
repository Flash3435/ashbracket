import { formatRelativeTimeEn } from "@/lib/datetime/formatRelativeTimeEn";
import type { GroupedSystemActivityDisplayItem } from "@/lib/poolActivity/activityFeedDisplayTypes";
import {
  groupedMilestoneSummaryHeadline,
  groupedMilestoneSummaryLabels,
} from "@/lib/poolActivity/activityFeedGrouping";

type GroupedMilestoneSummaryCardProps = {
  item: GroupedSystemActivityDisplayItem;
  poolName?: string;
  compact?: boolean;
};

export function GroupedMilestoneSummaryCard({
  item,
  poolName,
  compact,
}: GroupedMilestoneSummaryCardProps) {
  const rel = formatRelativeTimeEn(item.createdAt);
  const headline = groupedMilestoneSummaryHeadline(item);
  const labels = groupedMilestoneSummaryLabels(item);

  return (
    <article
      className={`rounded-xl border border-ash-border/80 bg-ash-body/35 px-4 py-3 ring-1 ring-ash-border/40 ${
        compact ? "" : ""
      }`}
    >
      {poolName ? (
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-ash-accent">
          Pool: {poolName}
        </p>
      ) : null}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-base leading-none opacity-80" aria-hidden>
          {item.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-ash-muted">
              {item.label}
            </span>
            <span className="text-xs text-ash-muted">{rel}</span>
          </div>
          <p className="mt-1 text-sm text-ash-text">{headline}</p>
          <p className="mt-1 text-xs text-ash-muted">{labels}</p>
        </div>
      </div>
    </article>
  );
}
