"use client";

import { useMemo, useState } from "react";
import type { ActivityReactionsSnapshot } from "@/lib/poolActivity/activityReactionTypes";
import {
  filterGlobalActivityByParticipantName,
  filterGlobalActivityFeedItems,
  GLOBAL_ACTIVITY_FEED_FILTER_LABELS,
  GLOBAL_ACTIVITY_FEED_FILTERS,
  type GlobalActivityFeedFilter,
} from "@/lib/poolActivity/globalActivityFeedFilter";
import type { GlobalPoolActivityFeedRow } from "@/lib/poolActivity/globalActivityTypes";
import { GlobalActivityFeed } from "./GlobalActivityFeed";

type PoolOption = { id: string; name: string };

type GlobalActivityDashboardProps = {
  items: GlobalPoolActivityFeedRow[];
  reactions: ActivityReactionsSnapshot;
  viewerParticipantIdByPoolId: Record<string, string>;
  poolOptions: PoolOption[];
  initialPoolId?: string | null;
};

export function GlobalActivityDashboard({
  items,
  reactions,
  viewerParticipantIdByPoolId,
  poolOptions,
  initialPoolId = null,
}: GlobalActivityDashboardProps) {
  const [typeFilter, setTypeFilter] = useState<GlobalActivityFeedFilter>("all");
  const [poolFilter, setPoolFilter] = useState(initialPoolId ?? "");
  const [participantQuery, setParticipantQuery] = useState("");

  const filteredItems = useMemo(() => {
    let next = items;
    if (poolFilter) {
      next = next.filter((item) => item.pool_id === poolFilter);
    }
    next = filterGlobalActivityFeedItems(next, typeFilter);
    next = filterGlobalActivityByParticipantName(next, participantQuery);
    return next;
  }, [items, poolFilter, typeFilter, participantQuery]);

  const emptyMessage =
    typeFilter !== "all" || poolFilter || participantQuery.trim()
      ? "No activity matches your filters."
      : undefined;

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-ash-muted">
          Pool
          <select
            value={poolFilter}
            onChange={(e) => setPoolFilter(e.target.value)}
            className="rounded-lg border border-ash-border bg-ash-body/50 px-3 py-2 text-sm text-ash-text"
          >
            <option value="">All pools</option>
            {poolOptions.map((pool) => (
              <option key={pool.id} value={pool.id}>
                {pool.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-ash-muted">
          Activity type
          <select
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value as GlobalActivityFeedFilter)
            }
            className="rounded-lg border border-ash-border bg-ash-body/50 px-3 py-2 text-sm text-ash-text"
          >
            {GLOBAL_ACTIVITY_FEED_FILTERS.map((filter) => (
              <option key={filter} value={filter}>
                {GLOBAL_ACTIVITY_FEED_FILTER_LABELS[filter]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-ash-muted">
          Participant name
          <input
            type="search"
            value={participantQuery}
            onChange={(e) => setParticipantQuery(e.target.value)}
            placeholder="Filter by display name"
            className="rounded-lg border border-ash-border bg-ash-body/50 px-3 py-2 text-sm text-ash-text placeholder:text-ash-muted/70"
          />
        </label>
      </div>

      <GlobalActivityFeed
        items={filteredItems}
        reactions={reactions}
        viewerParticipantIdByPoolId={viewerParticipantIdByPoolId}
        emptyFilterMessage={emptyMessage}
      />
    </>
  );
}
