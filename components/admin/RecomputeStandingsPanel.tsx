"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { recomputeStandingsForPoolAction } from "../../app/admin/results/actions";

type Props = {
  poolId: string;
  disabled?: boolean;
};

export function RecomputeStandingsPanel({ poolId, disabled = false }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function runRecompute() {
    if (disabled || isPending) return;
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const res = await recomputeStandingsForPoolAction(poolId);
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
        Recalculate leaderboard
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-ash-muted">
        Re-scores every entry from the latest picks, official results, and your
        pool’s point rules—same as after you save results or picks. Use this if
        the standings look out of step with what you expect.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runRecompute}
          disabled={disabled || isPending}
          className="rounded-lg border border-ash-border bg-ash-body px-3 py-2 text-sm font-medium text-ash-text shadow-sm transition hover:bg-ash-surface disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Recalculating…" : "Recalculate now"}
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
          Leaderboard updated. Refresh the page if you still see old numbers.
        </p>
      ) : null}
    </section>
  );
}
