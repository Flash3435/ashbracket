"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  recomputeAllPoolsLedgerAction,
  recomputeEditionPoolsLedgerAction,
} from "../../app/(worldcup)/admin/results/actions";
import type { AdminImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import { AdminRiskConfirmPanel } from "./AdminRiskConfirmPanel";

type Props = {
  disabled?: boolean;
  isProduction: boolean;
  impact: AdminImpactSummary;
  editionId?: string;
  title?: string;
  description?: string;
  buttonLabel?: string;
  successMessage?: string;
};

export function RecomputeAllPoolsPanel({
  disabled = false,
  isProduction,
  impact,
  editionId,
  title = "Recalculate pool leaderboards",
  description = "Runs scoring for every pool on this tournament edition from current picks and results.",
  buttonLabel = "Recalculate pools on this edition",
  successMessage = "Pool leaderboards updated.",
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
      const res = editionId
        ? await recomputeEditionPoolsLedgerAction({
            editionId,
            productionAcknowledged,
          })
        : await recomputeAllPoolsLedgerAction({ productionAcknowledged });
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
      <h2 className="text-sm font-bold text-ash-text">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ash-muted">{description}</p>
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
          {successMessage}
        </p>
      ) : null}
      <div className="mt-4">
        <AdminRiskConfirmPanel
          isProduction={isProduction}
          impact={impact}
          actionTitle="Recalculate standings"
          buttonLabel={buttonLabel}
          pending={isPending || disabled}
          variant={impact.isSimulation ? "simulation" : "live"}
          onConfirm={runRecompute}
        />
      </div>
    </section>
  );
}
