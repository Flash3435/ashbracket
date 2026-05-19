"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recomputeStandingsForPoolAction } from "../../app/(worldcup)/admin/results/actions";
import type { AdminImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import { AdminRiskConfirmPanel } from "./AdminRiskConfirmPanel";

type Props = {
  poolId: string;
  isProduction: boolean;
  impact: AdminImpactSummary;
  disabled?: boolean;
};

export function RecomputeStandingsPanel({
  poolId,
  isProduction,
  impact,
  disabled = false,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function runRecompute(productionAcknowledged: boolean) {
    if (disabled || isPending) return;
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const res = await recomputeStandingsForPoolAction({
        poolId,
        productionAcknowledged,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(true);
      router.refresh();
    });
  }

  return (
    <section className="ash-surface border border-ash-border bg-ash-body/30 p-4">
      <h2 className="text-sm font-bold text-ash-text">Recalculate leaderboard</h2>
      <p className="mt-1 text-sm leading-relaxed text-ash-muted">
        Re-scores every entry from the latest picks and tournament results for this
        pool only.
      </p>
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
      <div className="mt-4">
        <AdminRiskConfirmPanel
          isProduction={isProduction}
          impact={impact}
          actionTitle="Recalculate this pool"
          buttonLabel="Recalculate now"
          pending={isPending || disabled}
          variant={impact.isSimulation ? "simulation" : "live"}
          onConfirm={runRecompute}
        />
      </div>
    </section>
  );
}
