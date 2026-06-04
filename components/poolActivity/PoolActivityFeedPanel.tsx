"use client";

import { useMemo, useState } from "react";
import type { RecapFacts } from "@/lib/poolActivity/buildDeterministicRecapBody";
import {
  filterActivityFeedItems,
  type ActivityFeedFilter,
} from "@/lib/poolActivity/activityFeedFilter";
import type { ActivityReactionsSnapshot } from "@/lib/poolActivity/activityReactionTypes";
import type { PoolActivityFeedRow } from "@/lib/poolActivity/poolActivityTypes";
import { ActivityFeedFilters } from "./ActivityFeedFilters";
import { PoolActivityFeed } from "./PoolActivityFeed";
import { PoolAnnouncementComposer } from "./PoolAnnouncementComposer";

type PoolActivityFeedPanelProps = {
  items: PoolActivityFeedRow[];
  poolId: string;
  viewerParticipantId?: string | null;
  reactions: ActivityReactionsSnapshot;
  isPoolAdmin: boolean;
  liveRecapFacts?: RecapFacts | null;
  liveRecapDateYmd?: string | null;
  compact?: boolean;
  showFilters?: boolean;
  showAnnouncementComposer?: boolean;
  ashbotEnabled?: boolean;
};

export function PoolActivityFeedPanel({
  items,
  poolId,
  viewerParticipantId,
  reactions,
  isPoolAdmin,
  liveRecapFacts = null,
  liveRecapDateYmd = null,
  compact,
  showFilters = true,
  showAnnouncementComposer = true,
  ashbotEnabled = true,
}: PoolActivityFeedPanelProps) {
  const [filter, setFilter] = useState<ActivityFeedFilter>("all");
  const filteredItems = useMemo(
    () => filterActivityFeedItems(items, filter),
    [items, filter],
  );

  return (
    <>
      {showAnnouncementComposer && isPoolAdmin ? (
        <PoolAnnouncementComposer poolId={poolId} />
      ) : null}
      {showFilters && !compact ? (
        <ActivityFeedFilters value={filter} onChange={setFilter} />
      ) : null}
      <PoolActivityFeed
        items={filteredItems}
        compact={compact}
        liveRecapFacts={liveRecapFacts}
        liveRecapDateYmd={liveRecapDateYmd}
        poolId={poolId}
        viewerParticipantId={viewerParticipantId ?? null}
        reactions={reactions}
        emptyFilterMessage={
          filter !== "all"
            ? `No ${filter === "recaps" ? "recap" : filter} activity yet.`
            : undefined
        }
        ashbotEnabled={ashbotEnabled}
      />
    </>
  );
}
