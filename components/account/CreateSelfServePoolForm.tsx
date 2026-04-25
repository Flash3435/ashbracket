"use client";

import { createPoolForCurrentUserAction } from "@/lib/pools/createPoolForCurrentUserAction";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function CreateSelfServePoolForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [poolName, setPoolName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    const trimmedName = poolName.trim();
    if (!trimmedName) {
      setActionError("Pool name is required.");
      return;
    }

    startTransition(async () => {
      const res = await createPoolForCurrentUserAction({
        name: trimmedName,
        joinCode: joinCode.trim() === "" ? null : joinCode,
        isPublic,
      });
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      router.push(`/admin/pools/${res.poolId}`);
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-ash-border bg-ash-body/60 p-4 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-ash-text">Create your own pool</h2>
      <p className="mt-1 text-xs text-ash-muted">
        You&apos;ll become the organizer for this pool and can invite friends after
        it&apos;s created. Leave the join code blank to generate one from the pool
        name.
      </p>

      {actionError ? (
        <p
          className="mt-3 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}

      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="ss-pool-name"
            className="block text-sm font-medium text-ash-text"
          >
            Pool name
          </label>
          <input
            id="ss-pool-name"
            type="text"
            value={poolName}
            onChange={(e) => setPoolName(e.target.value)}
            disabled={isPending}
            className="w-full max-w-md rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm focus:border-ash-accent focus:outline-none focus:ring-1 focus:ring-ash-accent disabled:opacity-50"
            autoComplete="off"
            required
            maxLength={200}
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="ss-join-code"
            className="block text-sm font-medium text-ash-text"
          >
            Join code{" "}
            <span className="font-normal text-ash-muted">(optional)</span>
          </label>
          <input
            id="ss-join-code"
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            disabled={isPending}
            className="w-full max-w-md rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm focus:border-ash-accent focus:outline-none focus:ring-1 focus:ring-ash-accent disabled:opacity-50"
            autoComplete="off"
            placeholder="e.g. MYPOOL-2026"
            maxLength={40}
          />
          <p className="text-xs text-ash-muted">
            3–40 characters: letters, digits, hyphens, underscores. Stored
            uppercase. Must be unique.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="ss-pool-public"
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            disabled={isPending}
            className="h-4 w-4 rounded border-ash-border text-ash-accent focus:ring-ash-accent"
          />
          <label htmlFor="ss-pool-public" className="text-sm text-ash-muted">
            Public leaderboard (aggregate standings visible without sign-in).
            Pool rules can be shown or hidden separately in pool settings.
          </label>
        </div>
      </div>

      <div className="mt-4">
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Creating…" : "Create pool"}
        </button>
      </div>
    </form>
  );
}
