"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { postPoolAnnouncementAction } from "@/lib/poolActivity/poolActivityActions";

type PoolAnnouncementComposerProps = {
  poolId: string;
};

export function PoolAnnouncementComposer({ poolId }: PoolAnnouncementComposerProps) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await postPoolAnnouncementAction({ poolId, body });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mb-4 rounded-xl border border-ash-border bg-ash-surface px-4 py-3"
    >
      <label htmlFor="pool-announcement-body" className="text-xs font-semibold uppercase tracking-wide text-ash-muted">
        Post pool update
      </label>
      <textarea
        id="pool-announcement-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Reminder: picks lock Friday at 7 PM. Get your bracket in!"
        className="mt-2 w-full resize-y rounded-lg border border-ash-border bg-ash-body/50 px-3 py-2 text-sm text-ash-text placeholder:text-ash-muted/70 focus:border-ash-accent/50 focus:outline-none focus:ring-1 focus:ring-ash-accent/30"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-ash-muted">Plain text only. Visible to all pool members.</p>
        <button
          type="submit"
          disabled={pending || body.trim().length === 0}
          className="btn-primary inline-flex px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {pending ? "Posting…" : "Post update"}
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
