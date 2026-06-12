"use client";

import { useMemo, useState } from "react";
import type { RecapFacts } from "@/lib/poolActivity/buildDeterministicRecapBody";
import {
  filterPoolActivityDisplayItems,
} from "@/lib/poolActivity/activityFeedDisplayFilter";
import { type ActivityFeedFilter } from "@/lib/poolActivity/activityFeedFilter";
import { applyPoolActivityFeedGrouping } from "@/lib/poolActivity/activityFeedGrouping";
import {
  applyPostLockDefaultAllFeedFilter,
  sortDisplayItemsForPostLockTournamentMode,
} from "@/lib/poolActivity/activityFeedTournamentMode";
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
  revealHref?: string | null;
  /** When true, default All feed hides completion recaps and favors tournament activity. */
  poolLocked?: boolean;
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
  revealHref = null,
  poolLocked = false,
}: PoolActivityFeedPanelProps) {
  const [filter, setFilter] = useState<ActivityFeedFilter>("all");

  const displayItems = useMemo(() => {
    const grouped = applyPoolActivityFeedGrouping(
      items,
      poolLocked ? "strict" : "light",
      poolId,
    );
    const typeFiltered = filterPoolActivityDisplayItems(grouped, filter);
    const postLockFiltered = applyPostLockDefaultAllFeedFilter(typeFiltered, filter, {
      poolLocked,
    });
    return sortDisplayItemsForPostLockTournamentMode(postLockFiltered, {
      poolLocked: poolLocked && filter === "all",
    });
  }, [items, poolId, filter, poolLocked]);

  const filteredItems = displayItems;

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
        revealHref={revealHref}
        showCompletionDiagnostics={isPoolAdmin}
      />
    </>
  );
}
