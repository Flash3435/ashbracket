"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { recomputeStandingsForSamplePoolAction } from "../../app/admin/results/actions";

type Props = {
  disabled?: boolean;
};

export function RecomputeStandingsPanel({ disabled = false }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function runRecompute() {
    if (disabled || isPending) return;
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const res = await recomputeStandingsForSamplePoolAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(true);
      router.refresh();
    });
  }

  useEffect(() => {
    if (!success) return;
    const t = window.setTimeout(() => setSuccess(false), 6000);
    return () => window.clearTimeout(t);
  }, [success]);

  return (
    <section className="ash-surface border border-ash-border bg-ash-body/30 p-4">
      <h2 className="text-sm font-bold text-ash-text">
        Recompute standings
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-ash-muted">
        Calls the same job as after saving results or picks: reloads predictions,
        all tournament results, and pool scoring rules; recomputes points; replaces{" "}
        <code className="rounded bg-ash-surface px-1 py-0.5 text-xs text-ash-text ring-1 ring-ash-border">
          points_ledger
        </code>{" "}
        in one transaction. Next.js caches for public and admin routes are
        invalidated afterward.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runRecompute}
          disabled={disabled || isPending}
          className="rounded-lg border border-ash-border bg-ash-body px-3 py-2 text-sm font-medium text-ash-text shadow-sm transition hover:bg-ash-surface disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Recomputing…" : "Recompute now"}
        </button>
      </div>
      {error ? (
        <p
          className="mt-3 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {success && !error ? (
        <p
          className="mt-3 rounded-md border border-ash-accent/40 bg-ash-accent/10 px-3 py-2 text-sm text-ash-muted"
          role="status"
        >
          Standings recomputed successfully. Refresh any open tabs if counts look
          stale.
        </p>
      ) : null}
    </section>
  );
}
