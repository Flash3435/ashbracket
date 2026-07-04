"use client";

import {
  TOPOLOGY_STALE_PICKS_REVIEW_BODY,
  TOPOLOGY_STALE_PICKS_REVIEW_HEADLINE,
} from "@/lib/bracket/knockoutBracketDisplayCopy";

type Props = {
  stalePickCount?: number;
  className?: string;
};

/** Shown when saved SF+ picks are impossible under corrected FIFA semi-final feeders. */
export function TopologyStalePicksReviewBanner({
  stalePickCount,
  className = "",
}: Props) {
  return (
    <div
      className={`rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-3.5 ${className}`}
      role="status"
    >
      <p className="text-sm font-semibold text-amber-50">
        {TOPOLOGY_STALE_PICKS_REVIEW_HEADLINE}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-amber-100/95">
        {TOPOLOGY_STALE_PICKS_REVIEW_BODY}
      </p>
      {stalePickCount != null && stalePickCount > 0 ? (
        <p className="mt-2 text-xs text-amber-200/90">
          {stalePickCount} saved pick{stalePickCount === 1 ? "" : "s"} need
          review in your semi-final, final, or champion selections.
        </p>
      ) : null}
    </div>
  );
}
