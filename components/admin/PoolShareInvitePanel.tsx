"use client";

import { useState } from "react";

type Props = {
  joinCode: string | null;
  shareUrl: string | null;
};

export function PoolShareInvitePanel({ joinCode, shareUrl }: Props) {
  const [copied, setCopied] = useState(false);

  if (!joinCode?.trim()) {
    return (
      <div className="mb-8 rounded-md border border-ash-border bg-ash-body/60 px-4 py-3 text-sm text-ash-muted">
        <p className="font-medium text-ash-text">Shareable join link</p>
        <p className="mt-1">
          This pool does not have a join code yet, so there is no link to share
          for open joining. A global administrator can set a join code when
          creating the pool. You can still invite people by email from the
          Participants page.
        </p>
      </div>
    );
  }

  const code = joinCode.trim();

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

  return (
    <div className="mb-8 space-y-3 rounded-md border border-ash-accent/25 bg-ash-accent/5 px-4 py-3">
      <div>
        <p className="text-sm font-medium text-ash-text">Shareable join link</p>
        <p className="mt-1 text-sm text-ash-muted">
          Post this in group chat (WhatsApp, Slack, etc.). Anyone with the link
          can sign in and join as a participant — same rules as joining with the
          pool join code. This does not grant organizer access.
        </p>
      </div>
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
