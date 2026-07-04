"use client";

import Link from "next/link";
import {
  TOPOLOGY_STALE_PICKS_ADMIN_INTRO,
  TOPOLOGY_STALE_PICKS_REPAIR_DRY_RUN_LABEL,
} from "@/lib/bracket/knockoutBracketDisplayCopy";
import type { TopologyStalePicksReviewPanelData } from "@/lib/admin/loadTopologyStalePicksReviewForPool";

type Props = {
  data: TopologyStalePicksReviewPanelData;
  className?: string;
};

export function TopologyStalePicksReviewPanel({ data, className = "" }: Props) {
  if (!data.statusAvailable) {
    return (
      <section
        className={`rounded-lg border border-ash-border bg-ash-body/20 px-4 py-3 ${className}`}
      >
        <h2 className="text-sm font-semibold text-ash-text">
          Bracket topology review
        </h2>
        <p className="mt-2 text-sm text-ash-muted">
          Topology stale-pick review is unavailable right now.
        </p>
      </section>
    );
  }

  if (
    data.participantsWithStalePicks === 0 &&
    data.participantsWithMissingOnly === 0
  ) {
    return null;
  }

  const picksBase = `/admin/pools/${data.poolId}/picks`;

  return (
    <section
      className={`rounded-lg border border-amber-700/40 bg-amber-950/20 px-4 py-4 ${className}`}
    >
      <h2 className="text-sm font-semibold text-amber-50">
        Bracket correction needed
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-amber-100/95">
        {TOPOLOGY_STALE_PICKS_ADMIN_INTRO}
      </p>

      <dl className="mt-3 grid gap-2 text-xs text-amber-100/90 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-amber-200/70">Participants scanned</dt>
          <dd className="font-semibold text-amber-50">{data.participantsScanned}</dd>
        </div>
        <div>
          <dt className="text-amber-200/70">Stale SF+ picks</dt>
          <dd className="font-semibold text-amber-50">
            {data.participantsWithStalePicks}
          </dd>
        </div>
        <div>
          <dt className="text-amber-200/70">Missing-only downstream</dt>
          <dd className="font-semibold text-amber-50">
            {data.participantsWithMissingOnly}
          </dd>
        </div>
        <div>
          <dt className="text-amber-200/70">Planned repair clears</dt>
          <dd className="font-semibold text-amber-50">{data.plannedRepairClears}</dd>
        </div>
      </dl>

      {data.participants.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {data.participants.map((participant) => (
            <li
              key={participant.participantId}
              className="rounded-md border border-ash-border/60 bg-ash-body/30 px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ash-text">
                  {participant.displayName}
                </span>
                {participant.stalePickCount > 0 ? (
                  <span className="rounded-full border border-amber-800/60 bg-amber-950/40 px-2 py-0.5 text-[11px] font-semibold text-amber-100">
                    {participant.stalePickCount} stale
                  </span>
                ) : null}
                {participant.missingPickCount > 0 ? (
                  <span className="rounded-full border border-ash-border/60 bg-ash-body/40 px-2 py-0.5 text-[11px] text-ash-muted">
                    {participant.missingPickCount} missing
                  </span>
                ) : null}
                <Link
                  href={`${picksBase}?participant=${participant.participantId}`}
                  className="ash-link text-xs"
                >
                  Review picks
                </Link>
              </div>
              {participant.stalePickCount > 0 ? (
                <p className="mt-1 text-xs text-ash-muted">
                  Stale: {participant.staleSlots.join(", ")}
                </p>
              ) : null}
              {participant.missingPickCount > 0 && participant.stalePickCount === 0 ? (
                <p className="mt-1 text-xs text-ash-muted">
                  Missing only: {participant.missingSlots.join(", ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-4 text-xs leading-relaxed text-ash-muted">
        Run{" "}
        <code className="rounded bg-ash-body/80 px-1 py-0.5 font-mono text-[11px]">
          npx tsx scripts/repair-knockout-topology-stale-picks.ts --pool {data.poolId}
        </code>{" "}
        for a dry run. {TOPOLOGY_STALE_PICKS_REPAIR_DRY_RUN_LABEL} Add{" "}
        <code className="rounded bg-ash-body/80 px-1 py-0.5 font-mono text-[11px]">
          --apply
        </code>{" "}
        only after reviewing planned clears.
      </p>
    </section>
  );
}
