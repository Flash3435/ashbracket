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
    <section className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4">
      <h2 className="text-sm font-semibold text-zinc-900">
        Recompute standings
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-zinc-600">
        Calls the same job as after saving results or picks: reloads predictions,
        all tournament results, and pool scoring rules; recomputes points; replaces{" "}
        <code className="rounded bg-zinc-200/80 px-1 py-0.5 text-xs text-zinc-800">
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
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Recomputing…" : "Recompute now"}
        </button>
      </div>
      {error ? (
        <p
          className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {success && !error ? (
        <p
          className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          Standings recomputed successfully. Refresh any open tabs if counts look
          stale.
        </p>
      ) : null}
    </section>
  );
}
