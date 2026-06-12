"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runTournamentSyncWithAckAction } from "../../app/(worldcup)/admin/tournament/actions";
import type { AdminImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import { AdminRiskConfirmPanel } from "./AdminRiskConfirmPanel";

type Props = {
  isProduction: boolean;
  impact: AdminImpactSummary;
  /** When true, renders as a secondary troubleshooting action. */
  secondary?: boolean;
};

export function LiveTournamentSyncPanel({ isProduction, impact, secondary = false }: Props) {
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
    <div className={`ash-surface flex flex-col gap-4 p-4 ${secondary ? "border border-ash-border/70 bg-ash-body/20" : ""}`}>
      <p className="text-sm text-ash-muted">
        {secondary ? (
          <>
            Same underlying sync as the daily update, but redirects to the status page
            instead of showing an inline summary. Match scores are maintained in the
            tournament schedule; you can{" "}
            <span className="font-medium text-ash-text">freeze</span> a match so sync
            skips it.
          </>
        ) : (
          <>
            Match scores must already be on <code className="text-xs">tournament_matches</code>{" "}
            before this runs (CLI, Supabase, or simulation test data only). You can{" "}
            <span className="font-medium text-ash-text">freeze</span> a match with{" "}
            <code className="text-xs">sync_locked</code> so a future patched sync skips it.
          </>
        )}
      </p>
      {error ? (
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      <AdminRiskConfirmPanel
        isProduction={isProduction}
        impact={impact}
        actionTitle={secondary ? "Manual tournament sync" : "Live tournament sync"}
        buttonLabel={
          secondary
            ? "Run manual sync (status page)"
            : "Sync live tournament and update live standings"
        }
        pending={isPending}
        variant="live"
        confirmLabel="I understand this rebuilds live official results and recalculates every live pool — not simulation test pools."
        onConfirm={runSync}
      />
    </div>
  );
}
