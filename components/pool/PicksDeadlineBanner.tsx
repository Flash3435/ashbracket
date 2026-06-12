"use client";

import type { PicksDeadlineBannerViewModel } from "@/lib/picks/picksDeadlineBanner";
import Link from "next/link";
import { useCallback, useState } from "react";
import { PicksDeadlineCountdown } from "./PicksDeadlineCountdown";

type Props = PicksDeadlineBannerViewModel & {
  className?: string;
};

export function PicksDeadlineBanner({
  lockAtIso,
  isLocked,
  urgency,
  deadlineLabel,
  copy,
  inviteUrl,
  className = "",
}: Props) {
  const [clientLocked, setClientLocked] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleExpired = useCallback(() => {
    setClientLocked(true);
  }, []);

  const showLocked = isLocked || clientLocked;
  const isUrgent = urgency === "urgent";

  async function copyInviteLink() {
    const url = inviteUrl ?? copy.ctaHref;
    if (!url || copy.ctaKind !== "copy_invite") return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  const shellClass = isUrgent
    ? "border-amber-500/55 bg-gradient-to-br from-amber-950/50 to-ash-body/25 shadow-[0_4px_16px_rgba(0,0,0,0.25)]"
    : "border-amber-700/45 bg-gradient-to-br from-amber-950/35 to-ash-body/20";

  return (
    <div
      role="status"
      className={`rounded-xl border px-4 py-4 sm:px-5 sm:py-4 ${shellClass} ${className}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                isUrgent
                  ? "bg-amber-500/20 text-amber-100"
                  : "bg-amber-900/45 text-amber-200"
              }`}
            >
              {showLocked ? "Locked" : isUrgent ? "Deadline soon" : "Deadline approaching"}
            </span>
            <p className="text-sm font-semibold text-amber-50 sm:text-base">
              {showLocked ? "Picks are now locked" : copy.headline}
            </p>
          </div>

          <p className="mt-2 text-sm leading-relaxed text-amber-100/95">
            {showLocked
              ? "The pick deadline has passed. Group, third-place, and bonus picks can no longer be changed."
              : copy.body}
          </p>

          {!showLocked && deadlineLabel ? (
            <p className="mt-2 text-xs text-amber-200/85">
              Deadline:{" "}
              <span className="font-medium text-amber-50">{deadlineLabel}</span>
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <p
            className={`text-sm font-semibold tabular-nums ${
              isUrgent ? "text-amber-100" : "text-amber-200/95"
            }`}
          >
            <PicksDeadlineCountdown
              lockAtIso={lockAtIso}
              onExpired={handleExpired}
            />
          </p>

          {!showLocked ? (
            copy.ctaKind === "copy_invite" && inviteUrl ? (
              <button
                type="button"
                onClick={copyInviteLink}
                className="inline-flex items-center justify-center rounded-lg border border-amber-500/50 bg-amber-900/50 px-4 py-2 text-sm font-semibold text-amber-50 transition hover:bg-amber-900/70"
              >
                {copied ? "Copied" : copy.ctaLabel}
              </button>
            ) : (
              <Link
                href={copy.ctaHref}
                className="inline-flex items-center justify-center rounded-lg border border-amber-500/50 bg-amber-900/50 px-4 py-2 text-sm font-semibold text-amber-50 transition hover:bg-amber-900/70"
              >
                {copy.ctaLabel}
              </Link>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
