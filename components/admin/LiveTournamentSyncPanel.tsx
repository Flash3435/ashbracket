"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runTournamentSyncWithAckAction } from "../../app/(worldcup)/admin/tournament/actions";
import type { AdminImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import { AdminRiskConfirmPanel } from "./AdminRiskConfirmPanel";

type Props = {
  isProduction: boolean;
  impact: AdminImpactSummary;
};

export function LiveTournamentSyncPanel({ isProduction, impact }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function runSync(productionAcknowledged: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await runTournamentSyncWithAckAction({
        productionAcknowledged,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/admin/tournament/status?ok=1");
    });
  }

  return (
    <div className="ash-surface flex flex-col gap-4 p-4">
      <p className="text-sm text-ash-muted">
        Match scores are usually updated where your tournament data is maintained. You
        can <span className="font-medium text-ash-text">freeze</span> a match so
        automated sync skips it and leaves your manual score in place.
      </p>
      {error ? (
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      <AdminRiskConfirmPanel
        isProduction={isProduction}
        impact={impact}
        actionTitle="Live tournament sync"
        buttonLabel="Sync live tournament and update live standings"
        pending={isPending}
        variant="live"
        confirmLabel="I understand this rebuilds live official results and recalculates every live pool — not simulation test pools."
        onConfirm={runSync}
      />
    </div>
  );
}
