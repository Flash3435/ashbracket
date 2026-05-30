"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runLiveDailyUpdateAction } from "../../app/(worldcup)/admin/tournament/actions";
import type { AdminImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import {
  formatPublicLiveScoresLastUpdated,
  type LiveDailyUpdateStatusRow,
} from "@/lib/tournament/liveDailyUpdateStatus";
import { AdminRiskConfirmPanel } from "./AdminRiskConfirmPanel";

type Props = {
  isProduction: boolean;
  impact: AdminImpactSummary;
  lastUpdate: LiveDailyUpdateStatusRow | null;
};

export function LiveDailyUpdatePanel({ isProduction, impact, lastUpdate }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function runUpdate(productionAcknowledged: boolean) {
    setError(null);
    setSuccessMessage(null);
    startTransition(async () => {
      const res = await runLiveDailyUpdateAction({ productionAcknowledged });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccessMessage(res.message);
      router.refresh();
    });
  }

  const lastFormatted = lastUpdate
    ? formatPublicLiveScoresLastUpdated(lastUpdate.lastSuccessAt)
    : null;

  return (
    <div className="ash-surface flex flex-col gap-4 border border-emerald-800/40 bg-emerald-950/10 p-5">
      <div>
        <h2 className="text-lg font-bold text-ash-text">Update today&apos;s scores</h2>
        <p className="mt-2 text-sm leading-relaxed text-ash-muted">
          Run this once per day after completed match scores are on file. It reads live
          match scores, rebuilds official results, and refreshes every{" "}
          <span className="font-medium text-ash-text">live</span> pool leaderboard.
          Simulation test pools are not touched.
        </p>
        {lastFormatted ? (
          <p className="mt-2 text-sm text-ash-muted">
            <span className="font-medium text-ash-text">Last successful update:</span>{" "}
            {lastFormatted}
          </p>
        ) : (
          <p className="mt-2 text-sm text-ash-muted">
            No daily update has been recorded yet for the live tournament.
          </p>
        )}
      </div>

      {error ? (
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      {successMessage ? (
        <p
          className="rounded-md border border-emerald-700/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100"
          role="status"
        >
          {successMessage}
        </p>
      ) : null}

      <AdminRiskConfirmPanel
        isProduction={isProduction}
        impact={impact}
        actionTitle="Update live scores and standings"
        buttonLabel="Update today's scores"
        pending={isPending}
        variant="live"
        confirmLabel="I understand this updates live official results and every live pool — not simulation test pools."
        onConfirm={runUpdate}
      />
    </div>
  );
}
