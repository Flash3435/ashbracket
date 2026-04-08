"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { recomputeAllPoolsLedgerAction } from "../../app/admin/results/actions";

type Props = {
  disabled?: boolean;
};

/**
 * Global-admin-only: refresh every pool’s ledger after editing shared tournament results.
 */
export function RecomputeAllPoolsPanel({ disabled = false }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function runRecompute() {
    if (disabled || isPending) return;
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const res = await recomputeAllPoolsLedgerAction();
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
        Recalculate all pool leaderboards
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-ash-muted">
        Runs scoring for every pool from current picks and official results. Use
        after bulk edits if anything looks stale.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runRecompute}
          disabled={disabled || isPending}
          className="rounded-lg border border-ash-border bg-ash-body px-3 py-2 text-sm font-medium text-ash-text shadow-sm transition hover:bg-ash-surface disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Recalculating…" : "Recalculate all pools"}
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
          All pool leaderboards updated.
        </p>
      ) : null}
    </section>
  );
}
