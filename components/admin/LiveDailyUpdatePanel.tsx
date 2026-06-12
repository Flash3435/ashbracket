"use client";

import Link from "next/link";
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
    <div className="ash-surface flex flex-col gap-4 border border-ash-border/80 bg-ash-body/20 p-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ash-muted">
          Fallback / manual workflow
        </p>
        <h2 className="mt-1 text-lg font-bold text-ash-text">
          Recompute from stored scores
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ash-muted">
          Use this after scores are on <code className="text-xs">tournament_matches</code>{" "}
          — from{" "}
          <Link href="/admin/tournament/match-stats" className="ash-link">
            Match stats
          </Link>
          , a completed{" "}
          <Link href="/admin/tournament/live-scores" className="ash-link">
            live score fetch
          </Link>
          , CLI, or Supabase. It rebuilds derived tournament results and recalculates every{" "}
          <span className="font-medium text-ash-text">live</span> pool on the official edition.
          Simulation test pools and other editions are not touched.
        </p>
        <details className="mt-3 rounded-md border border-ash-border/60 bg-ash-body/20 px-3 py-2 text-sm text-ash-muted">
          <summary className="cursor-pointer font-medium text-ash-text">
            First match day checklist
          </summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5">
            <li>
              Enter scores via{" "}
              <Link href="/admin/tournament/match-stats" className="ash-link">
                Match stats
              </Link>{" "}
              or{" "}
              <Link href="/admin/tournament/live-scores" className="ash-link">
                Fetch latest scores
              </Link>{" "}
              (see the workflow box above).
            </li>
            <li>
              Run{" "}
              <span className="font-medium text-ash-text">Recompute from stored scores</span>{" "}
              below to rebuild derived results and leaderboards.
            </li>
            <li>
              <Link href="/admin/tournament/status" className="ash-link">
                Review tournament status
              </Link>{" "}
              — finished matches, last sync, and leaderboard freshness.
            </li>
            <li>
              <Link href="/admin/results" className="ash-link">
                Review or correct official results
              </Link>{" "}
              — manual edits or locked slots if sync missed something.
            </li>
            <li>
              Open a live pool leaderboard (public or admin standings) and spot-check
              points moved as expected.
            </li>
            <li>
              <Link href="/admin/activity" className="ash-link">
                Check global activity
              </Link>{" "}
              — score sync does not post feed events; recaps and milestones are separate.
            </li>
          </ol>
        </details>
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
        actionTitle="Recompute live scores and standings"
        buttonLabel="Recompute from stored scores"
        pending={isPending}
        variant="live"
        confirmLabel="I understand this updates live official results and every live pool — not simulation test pools."
        onConfirm={runUpdate}
      />
    </div>
  );
}
