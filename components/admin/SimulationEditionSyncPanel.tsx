"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runSimulationEditionSyncWithAckAction } from "../../app/(worldcup)/admin/simulation/actions";
import type { AdminImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import { AdminRiskConfirmPanel } from "./AdminRiskConfirmPanel";

type Props = {
  isProduction: boolean;
  impact: AdminImpactSummary;
  editionCode: string;
};

export function SimulationEditionSyncPanel({
  isProduction,
  impact,
  editionCode,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function runSync(productionAcknowledged: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await runSimulationEditionSyncWithAckAction({
        editionCode,
        productionAcknowledged,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="ash-surface space-y-3 p-4 text-sm text-ash-muted">
      <p>
        <span className="font-medium text-ash-text">Sync from match scores:</span>{" "}
        Rebuilds result rows from this simulation edition&apos;s matches (blank until
        you enter scores).
      </p>
      {error ? (
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      <AdminRiskConfirmPanel
        isProduction={isProduction}
        impact={impact}
        actionTitle="Simulation edition sync"
        buttonLabel="Run simulation sync"
        pending={isPending}
        variant="simulation"
        onConfirm={runSync}
      />
    </div>
  );
}
