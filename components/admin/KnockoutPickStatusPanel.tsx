"use client";

import Link from "next/link";
import { useState } from "react";
import {
  formatAdminKnockoutReminderCopy,
  formatAdminKnockoutStatusLabel,
  type AdminKnockoutPickStatusPanelData,
  type AdminKnockoutParticipantStatus,
  type AdminKnockoutStageBreakdown,
} from "@/lib/admin/adminKnockoutPickStatus";

type Props = {
  data: AdminKnockoutPickStatusPanelData;
  className?: string;
};

function stageBreakdownLines(breakdown: AdminKnockoutStageBreakdown): string[] {
  const lines: string[] = [];
  if (breakdown.roundOf32 > 0) {
    lines.push(`Round of 32: ${breakdown.roundOf32}`);
  }
  if (breakdown.roundOf16 > 0) {
    lines.push(`Round of 16: ${breakdown.roundOf16}`);
  }
  if (breakdown.quarterFinals > 0) {
    lines.push(`Quarter-finals: ${breakdown.quarterFinals}`);
  }
  if (breakdown.semiFinals > 0) {
    lines.push(`Semi-finals: ${breakdown.semiFinals}`);
  }
  if (breakdown.finalChampion > 0) {
    lines.push(`Final / Champion: ${breakdown.finalChampion}`);
  }
  return lines;
}

function statusBadgeClass(status: AdminKnockoutParticipantStatus["status"]): string {
  switch (status) {
    case "complete":
      return "border-emerald-800/60 bg-emerald-950/40 text-emerald-200";
    case "missing_next_matchday":
      return "border-red-800/60 bg-red-950/40 text-red-200";
    case "not_started":
      return "border-ash-border/60 bg-ash-body/30 text-ash-muted";
    default:
      return "border-amber-800/60 bg-amber-950/40 text-amber-100";
  }
}

function ParticipantRow({
  participant,
  poolId,
  poolName,
}: {
  participant: AdminKnockoutParticipantStatus;
  poolId: string;
  poolName: string;
}) {
  const [copied, setCopied] = useState(false);
  const picksBase = `/admin/pools/${poolId}/picks?participant=${participant.participantId}`;
  const breakdownLines = stageBreakdownLines(participant.stageBreakdown);

  async function copyReminder() {
    const text = formatAdminKnockoutReminderCopy({
      participantName: participant.displayName,
      poolName,
      urgentMatch: participant.nextUrgentMatch,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <li className="rounded-md border border-ash-border/60 bg-ash-body/30 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ash-text">{participant.displayName}</span>
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(participant.status)}`}
        >
          {formatAdminKnockoutStatusLabel(participant.status)}
        </span>
        {participant.actionableMissingCount > 0 ? (
          <span className="text-xs tabular-nums text-ash-muted">
            {participant.actionableMissingCount} missing
          </span>
        ) : null}
      </div>

      {breakdownLines.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-xs text-ash-muted">
          {breakdownLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {participant.lockedMissingLabels.length > 0 ? (
        <p className="mt-2 text-xs text-red-200">
          Locked missing: {participant.lockedMissingLabels.join(", ")}
        </p>
      ) : null}

      {participant.nextUrgentMatch ? (
        <p className="mt-2 text-xs text-amber-100">
          Next urgent: {participant.nextUrgentMatch.matchLabel}
          {` · locks ${participant.nextUrgentMatch.kickoffLocal}`}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <Link href={`${picksBase}&view=bracket`} className="ash-link font-medium">
          View picks
        </Link>
        <Link href={picksBase} className="ash-link font-medium">
          Edit picks
        </Link>
        <button
          type="button"
          onClick={() => void copyReminder()}
          className="font-medium text-ash-accent hover:underline"
        >
          {copied ? "Copied!" : "Copy reminder"}
        </button>
      </div>
    </li>
  );
}

export function KnockoutPickStatusPanel({ data, className = "" }: Props) {
  const [showComplete, setShowComplete] = useState(false);

  return (
    <section
      id="knockout-pick-status"
      className={`scroll-mt-20 rounded-lg border border-ash-border bg-ash-body/40 p-4 ${className}`}
      aria-label="Knockout pick status"
    >
      <h2 className="text-sm font-bold text-ash-text">Knockout pick status</h2>

      {data.state === "unavailable" ? (
        <p className="mt-3 rounded-md border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          {data.statusUnavailableReason ??
            "Knockout pick status is unavailable right now. Try again in a moment."}
        </p>
      ) : null}

      {data.state === "no_participants" ? (
        <p className="mt-3 text-sm text-ash-muted">No participants yet.</p>
      ) : null}

      {data.state === "not_applicable" ? (
        <p className="mt-3 text-sm text-ash-muted">
          Knockout picks are not open yet. Confirmed Round of 32 matchups will appear
          here as they become pickable.
        </p>
      ) : null}

      {data.state === "ready" ? (
        <>
          <p className="mt-3 text-sm font-medium text-ash-text">{data.summaryLine}</p>
          {data.firstMatchLockLabel ? (
            <p className="mt-1 text-sm text-ash-muted">{data.firstMatchLockLabel}</p>
          ) : null}
          {data.nextLockingMatchLabel ? (
            <p className="mt-1 text-sm text-ash-muted">{data.nextLockingMatchLabel}</p>
          ) : null}

          {data.incompleteParticipants.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ash-muted">
                Incomplete knockout picks
              </p>
              <ul className="mt-2 space-y-2 text-sm">
                {data.incompleteParticipants.map((p) => (
                  <ParticipantRow
                    key={p.participantId}
                    participant={p}
                    poolId={data.poolId}
                    poolName={data.poolName}
                  />
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-sm text-emerald-200">
              Everyone has complete knockout picks for currently pickable matches.
            </p>
          )}

          {data.completeParticipants.length > 0 ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowComplete((v) => !v)}
                className="text-xs font-semibold text-ash-accent hover:underline"
              >
                {showComplete
                  ? "Hide complete"
                  : `Show complete (${data.completeParticipants.length})`}
              </button>
              {showComplete ? (
                <ul className="mt-2 space-y-2 text-sm">
                  {data.completeParticipants.map((p) => (
                    <ParticipantRow
                      key={p.participantId}
                      participant={p}
                      poolId={data.poolId}
                      poolName={data.poolName}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
