"use client";

import Link from "next/link";
import { useState } from "react";
import {
  buildAdminKnockoutParticipantDisplaySections,
  formatAdminKnockoutParticipantStatusLabel,
  formatAdminKnockoutReminderCopy,
  shouldShowAdminKnockoutReminder,
  type AdminKnockoutPickStatusPanelData,
  type AdminKnockoutParticipantDisplaySection,
  type AdminKnockoutParticipantStatus,
} from "@/lib/admin/adminKnockoutPickStatus";

type Props = {
  data: AdminKnockoutPickStatusPanelData;
  className?: string;
};

function participantStatusBadgeClass(
  participant: AdminKnockoutParticipantStatus,
): string {
  if (participant.actionableMissingCount > 0) {
    if (participant.status === "missing_next_matchday") {
      return "border-red-800/60 bg-red-950/40 text-red-200";
    }
    return "border-amber-800/60 bg-amber-950/40 text-amber-100";
  }
  if (participant.lockedMissingCount > 0) {
    return "border-red-900/50 bg-red-950/30 text-red-200";
  }
  if (participant.status === "not_started") {
    return "border-ash-border/60 bg-ash-body/30 text-ash-muted";
  }
  return "border-emerald-800/60 bg-emerald-950/40 text-emerald-200";
}

function SummarySection({
  section,
  tone = "muted",
}: {
  section: AdminKnockoutParticipantDisplaySection;
  tone?: "muted" | "missed";
}) {
  return (
    <div
      className={`mt-2 text-xs ${tone === "missed" ? "text-red-200" : "text-ash-muted"}`}
    >
      <p className={`font-medium ${tone === "missed" ? "" : "text-ash-text"}`}>
        {section.title}:
      </p>
      <ul className="mt-1 list-inside list-disc space-y-0.5">
        {section.lines.map((line) => (
          <li key={`${section.title}-${line}`}>{line}</li>
        ))}
      </ul>
    </div>
  );
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
  const showReminder = shouldShowAdminKnockoutReminder(participant);
  const sections = buildAdminKnockoutParticipantDisplaySections(participant);

  async function copyReminder() {
    const text = formatAdminKnockoutReminderCopy({
      participantName: participant.displayName,
      poolName,
      actionableMissingSummaryLines: participant.actionableMissingSummaryLines,
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
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${participantStatusBadgeClass(participant)}`}
        >
          {formatAdminKnockoutParticipantStatusLabel(participant)}
        </span>
      </div>

      {sections.stillNeeded ? (
        <SummarySection section={sections.stillNeeded} tone="muted" />
      ) : null}

      {sections.alreadyMissed ? (
        <SummarySection section={sections.alreadyMissed} tone="missed" />
      ) : null}

      {sections.lockedMatches ? (
        <SummarySection section={sections.lockedMatches} tone="missed" />
      ) : null}

      {participant.nextUrgentMatch ? (
        <p className="mt-2 text-xs text-amber-100">
          Next urgent: {participant.nextUrgentMatch.matchLabel.replace(/^M\d+\s+/, "")}
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
        {showReminder ? (
          <button
            type="button"
            onClick={() => void copyReminder()}
            className="font-medium text-ash-accent hover:underline"
          >
            {copied ? "Copied!" : "Copy reminder"}
          </button>
        ) : null}
      </div>
    </li>
  );
}

function ParticipantSection({
  title,
  participants,
  poolId,
  poolName,
}: {
  title: string;
  participants: AdminKnockoutParticipantStatus[];
  poolId: string;
  poolName: string;
}) {
  if (participants.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ash-muted">
        {title}
      </p>
      <ul className="mt-2 space-y-2 text-sm">
        {participants.map((p) => (
          <ParticipantRow
            key={p.participantId}
            participant={p}
            poolId={poolId}
            poolName={poolName}
          />
        ))}
      </ul>
    </div>
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

          <ParticipantSection
            title="Needs action"
            participants={data.needsActionParticipants}
            poolId={data.poolId}
            poolName={data.poolName}
          />

          <ParticipantSection
            title="Missed locked picks"
            participants={data.missedLockedParticipants}
            poolId={data.poolId}
            poolName={data.poolName}
          />

          {data.needsActionParticipants.length === 0 &&
          data.missedLockedParticipants.length === 0 ? (
            <p className="mt-3 text-sm text-emerald-200">
              Everyone has complete knockout picks for currently pickable matches.
            </p>
          ) : null}

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
