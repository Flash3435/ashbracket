"use client";

import type { ActivityFeedFilter } from "@/lib/poolActivity/activityFeedFilter";
import {
  ACTIVITY_FEED_FILTER_LABELS,
  ACTIVITY_FEED_FILTERS,
} from "@/lib/poolActivity/activityFeedFilter";

type ActivityFeedFiltersProps = {
  value: ActivityFeedFilter;
  onChange: (filter: ActivityFeedFilter) => void;
};

export function ActivityFeedFilters({ value, onChange }: ActivityFeedFiltersProps) {
  return (
    <div
      className="mb-4 flex flex-wrap gap-1.5"
      role="tablist"
      aria-label="Filter activity feed"
    >
      {ACTIVITY_FEED_FILTERS.map((filter) => {
        const active = value === filter;
        return (
          <button
            key={filter}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(filter)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? "border-ash-accent/50 bg-ash-accent/15 text-ash-text"
                : "border-ash-border bg-ash-body/30 text-ash-muted hover:border-ash-accent/30 hover:text-ash-text"
            }`}
          >
            {ACTIVITY_FEED_FILTER_LABELS[filter]}
          </button>
        );
      })}
    </div>
  );
}
