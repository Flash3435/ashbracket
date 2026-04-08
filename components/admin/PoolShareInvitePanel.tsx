"use client";

import Link from "next/link";
import { useState } from "react";

type Props = {
  joinCode: string | null;
  shareUrl: string | null;
  /** Primary = full invite URL UI; compact = reference block for Settings */
  variant?: "primary" | "compact";
  /** Pool admin Participants URL (used in compact variant) */
  participantsHref?: string;
};

export function PoolShareInvitePanel({
  joinCode,
  shareUrl,
  variant = "primary",
  participantsHref,
}: Props) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  if (!joinCode?.trim()) {
    if (variant === "compact") {
      return (
        <div className="mb-6 rounded-md border border-ash-border bg-ash-body/40 px-3 py-2.5 text-xs text-ash-muted">
          <p className="font-medium text-ash-text">Participant joining</p>
          <p className="mt-1">
            This pool does not have a join code yet, so there is no share link
            for open joining. Email invites still work from{" "}
            {participantsHref ? (
              <Link href={participantsHref} className="ash-link font-medium">
                Participants
              </Link>
            ) : (
              "Participants"
            )}
            .
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-md border border-ash-border bg-ash-body/60 px-4 py-3 text-sm text-ash-muted">
        <p className="font-medium text-ash-text">Shareable join link</p>
        <p className="mt-1">
          This pool does not have a join code yet, so there is no link to share
          for open joining. A global administrator can set a join code when
          creating the pool. You can still invite people by email using{" "}
          <span className="font-medium text-ash-text">Invite participant</span>{" "}
          below.
        </p>
      </div>
    );
  }

  const code = joinCode.trim();

  if (variant === "compact") {
    return (
      <div className="mb-6 rounded-md border border-ash-border bg-ash-body/40 px-3 py-2.5 text-xs text-ash-muted">
        <p className="font-medium text-ash-text">Participant joining</p>
        <p className="mt-1">
          Copy the share link and send invites from the{" "}
          {participantsHref ? (
            <Link href={participantsHref} className="ash-link font-medium">
              Participants
            </Link>
          ) : (
            "Participants"
          )}{" "}
          page — same link as here.
        </p>
        {shareUrl ? (
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="block max-w-full flex-1 break-all rounded border border-ash-border bg-ash-body px-2 py-1 font-mono text-[11px] text-ash-text">
              {shareUrl}
            </code>
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 rounded-md bg-ash-surface px-3 py-1.5 text-xs font-medium text-ash-text ring-1 ring-ash-border transition-colors hover:bg-ash-border/40"
            >
              {copied ? "Copied" : "Copy invite link"}
            </button>
          </div>
        ) : null}
        <p className="mt-2 text-[11px]">
          Join code: <span className="font-mono text-ash-text">{code}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-ash-accent/25 bg-ash-accent/5 px-4 py-3">
      <p className="text-sm font-medium text-ash-text">Shareable join link</p>
      {shareUrl ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="block flex-1 break-all rounded-md border border-ash-border bg-ash-body px-3 py-2 text-xs text-ash-text">
            {shareUrl}
          </code>
          <button
            type="button"
            onClick={copyLink}
            className="shrink-0 rounded-lg bg-ash-surface px-4 py-2 text-sm font-medium text-ash-text ring-1 ring-ash-border transition-colors hover:bg-ash-border/40"
          >
            {copied ? "Copied" : "Copy invite link"}
          </button>
        </div>
      ) : null}
      <p className="text-xs text-ash-muted">
        Join code for manual entry:{" "}
        <span className="font-mono text-ash-text">{code}</span> (also shown in
        the pool header)
      </p>
    </div>
  );
}
