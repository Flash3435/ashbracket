"use client";

import { useState } from "react";
import type { PoolMembershipCompletionStatus } from "@/lib/picks/poolMembershipCompletionStatus";

export type IncompleteParticipantBreakdown = {
  participantId: string;
  displayName: string;
  userId: string | null;
  completion: PoolMembershipCompletionStatus;
};

type Props = {
  completeCount: number;
  participantCount: number;
  knockoutBracketPicksUnlocked: boolean;
  incomplete: IncompleteParticipantBreakdown[];
};

function sectionLine(
  section: PoolMembershipCompletionStatus["sections"][number],
  knockoutUnlocked: boolean,
): string {
  if (section.id === "knockout" && !knockoutUnlocked) {
    return "Knockout picks: not required yet";
  }
  return `${section.label}: ${section.filled}/${section.total}`;
}

export function IncompleteBracketsOverview({
  completeCount,
  participantCount,
  knockoutBracketPicksUnlocked,
  incomplete,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const ruleHint = knockoutBracketPicksUnlocked
    ? "Complete means every required group, third-place, bonus, and knockout slot has a saved team pick."
    : "Pre-lock picks complete (group, third-place, and bonus). Knockout picks are not required until Round of 32 is published.";

  return (
    <section className="ash-surface p-4">
      <h2 className="text-base font-bold text-ash-text">Bracket completion</h2>
      <p className="mt-1 text-sm text-ash-muted">
        {completeCount} of {participantCount} participant
        {participantCount === 1 ? "" : "s"} with complete required picks.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-ash-muted">{ruleHint}</p>

      {incomplete.length === 0 ? (
        <p className="mt-4 rounded-md border border-ash-accent/30 bg-ash-accent/10 px-3 py-2 text-sm text-ash-text">
          Everyone in this pool has completed their required picks.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <h3 className="text-sm font-semibold text-ash-text">
            Incomplete brackets ({incomplete.length})
          </h3>
          <ul className="space-y-2">
            {incomplete.map((row) => {
              const open = expandedId === row.participantId;
              const { completion } = row;
              return (
                <li
                  key={row.participantId}
                  className="rounded-md border border-ash-border bg-ash-body/40"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId(open ? null : row.participantId)
                    }
                    className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left"
                    aria-expanded={open}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-ash-text">
                        {row.displayName}
                      </p>
                      <p className="mt-0.5 text-xs text-amber-100">
                        {completion.displaySummary}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-ash-muted">
                      {open ? "Hide" : "Details"}
                    </span>
                  </button>
                  {open ? (
                    <div className="border-t border-ash-border px-3 py-2 text-xs text-ash-muted">
                      <dl className="space-y-1">
                        <div>
                          <dt className="inline font-medium text-ash-text">
                            Membership ID:{" "}
                          </dt>
                          <dd className="inline font-mono">{row.participantId}</dd>
                        </div>
                        {row.userId ? (
                          <div>
                            <dt className="inline font-medium text-ash-text">
                              User ID:{" "}
                            </dt>
                            <dd className="inline font-mono">{row.userId}</dd>
                          </div>
                        ) : (
                          <div className="text-ash-border-hover">
                            No linked user account
                          </div>
                        )}
                      </dl>
                      <ul className="mt-2 space-y-0.5">
                        {completion.sections.map((section) => (
                          <li key={section.id}>
                            {sectionLine(section, knockoutBracketPicksUnlocked)}
                          </li>
                        ))}
                      </ul>
                      {completion.missingPickKeys.length > 0 ? (
                        <p className="mt-2 text-amber-100">
                          Reason incomplete: {completion.displaySummary}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
