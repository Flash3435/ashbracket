"use client";

import { useMemo, useState } from "react";
import type { ActivityReactionsSnapshot } from "@/lib/poolActivity/activityReactionTypes";
import {
  filterGlobalActivityDisplayByParticipantName,
  filterGlobalActivityDisplayItems,
} from "@/lib/poolActivity/globalActivityDisplayFilter";
import {
  GLOBAL_ACTIVITY_FEED_FILTER_LABELS,
  GLOBAL_ACTIVITY_FEED_FILTERS,
  type GlobalActivityFeedFilter,
} from "@/lib/poolActivity/globalActivityFeedFilter";
import { applyGlobalActivityFeedGrouping } from "@/lib/poolActivity/activityFeedGrouping";
import {
  applyPostLockDefaultAllFeedFilterForGlobal,
  sortGlobalDisplayItemsForPostLockTournamentMode,
} from "@/lib/poolActivity/activityFeedTournamentMode";
import type { GlobalPoolActivityFeedRow } from "@/lib/poolActivity/globalActivityTypes";
import { GlobalActivityFeed } from "./GlobalActivityFeed";

type PoolOption = { id: string; name: string };

type GlobalActivityDashboardProps = {
  items: GlobalPoolActivityFeedRow[];
  reactions: ActivityReactionsSnapshot;
  viewerParticipantIdByPoolId: Record<string, string>;
  lockAtByPoolId: Record<string, string | null>;
  poolOptions: PoolOption[];
  initialPoolId?: string | null;
};

export function GlobalActivityDashboard({
  items,
  reactions,
  viewerParticipantIdByPoolId,
  lockAtByPoolId,
  poolOptions,
  initialPoolId = null,
}: GlobalActivityDashboardProps) {
  const [typeFilter, setTypeFilter] = useState<GlobalActivityFeedFilter>("all");
  const [poolFilter, setPoolFilter] = useState(initialPoolId ?? "");
  const [participantQuery, setParticipantQuery] = useState("");
  const [showAllSystemCards, setShowAllSystemCards] = useState(false);

  const filteredItems = useMemo(() => {
    let next = items;
    if (poolFilter) {
      next = next.filter((item) => item.pool_id === poolFilter);
    }

    const groupingMode = showAllSystemCards ? "none" : "strict";
    let display = applyGlobalActivityFeedGrouping(next, groupingMode);

    display = filterGlobalActivityDisplayItems(display, typeFilter, {
      showAllSystemCards,
    });
    display = filterGlobalActivityDisplayByParticipantName(
      display,
      participantQuery,
    );
    if (!showAllSystemCards) {
      display = applyPostLockDefaultAllFeedFilterForGlobal(display, typeFilter, {
        lockAtByPoolId,
      });
      if (typeFilter === "all") {
        display = sortGlobalDisplayItemsForPostLockTournamentMode(display, {
          lockAtByPoolId,
        });
      }
    }
    return display;
  }, [
    items,
    poolFilter,
    typeFilter,
    participantQuery,
    showAllSystemCards,
    lockAtByPoolId,
  ]);

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
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-xs text-ash-muted">
          <input
            type="checkbox"
            checked={showAllSystemCards}
            onChange={(e) => setShowAllSystemCards(e.target.checked)}
            className="rounded border-ash-border"
          />
          Show all system cards
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
