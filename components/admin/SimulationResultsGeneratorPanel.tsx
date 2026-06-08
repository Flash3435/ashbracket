"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  applyPreviewedSimulationResultsAction,
  previewNextSimulationResultsAction,
  type SimulationResultsPreview,
} from "../../app/(worldcup)/admin/simulation/actions";
import { AdminRiskConfirmPanel } from "./AdminRiskConfirmPanel";

type Props = {
  editionId: string;
  isProduction: boolean;
};

function formatKickoff(iso: string | null): string {
  if (!iso) return "No kickoff time";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function outcomeLabel(match: SimulationResultsPreview["matches"][number]): string {
  if (match.decisionType === "draw") return "Draw";
  if (match.decisionType === "penalties") {
    return `${match.winnerTeamName ?? "Winner"} on penalties`;
  }
  return match.winnerTeamName ?? "Winner";
}

function stageModeLabel(preview: SimulationResultsPreview): string {
  switch (preview.stageMode) {
    case "group":
      return "Group stage only";
    case "knockout":
      return "Knockout only";
    default:
      return "Mixed group + knockout";
  }
}

export function SimulationResultsGeneratorPanel({
  editionId,
  isProduction,
}: Props) {
  const router = useRouter();
  const [preview, setPreview] = useState<SimulationResultsPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewPending, startPreviewTransition] = useTransition();
  const [isApplyPending, startApplyTransition] = useTransition();

  const busy = isPreviewPending || isApplyPending;

  function loadPreview() {
    setError(null);
    setMessage(null);
    startPreviewTransition(async () => {
      const res = await previewNextSimulationResultsAction({ editionId });
      if (!res.ok) {
        setPreview(null);
        setError(res.error);
        return;
      }
      setPreview(res.preview);
    });
  }

  function applyPreview(productionAcknowledged: boolean) {
    if (!preview) return;
    setError(null);
    setMessage(null);
    startApplyTransition(async () => {
      const res = await applyPreviewedSimulationResultsAction({
        editionId,
        preview,
        productionAcknowledged,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage(res.message);
      setPreview(null);
      router.refresh();
    });
  }

  return (
    <section className="ash-surface mb-8 space-y-4 border border-amber-700/40 bg-amber-950/15 p-4">
      <div className="space-y-2">
        <h2 className="text-base font-bold text-ash-text">
          Generate fake simulation results
        </h2>
        <p className="text-sm leading-relaxed text-ash-muted">
          Simulation edition only. Test data only. This previews fake scorelines
          for the next scheduled batch of unplayed matches in this simulation
          edition, then applies them through the normal match-sync and standings
          recompute flow. Live editions and live pools are not affected.
        </p>
        <p className="text-xs leading-relaxed text-ash-muted">
          Batch rule: all eligible unplayed matches on the earliest scheduled
          kickoff date in this simulation edition. If kickoff dates are missing,
          the fallback is the first eligible matches in schedule order.
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-md border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={loadPreview}
          disabled={busy}
          className="rounded-md border border-amber-500/60 bg-amber-900/40 px-4 py-2 text-sm font-medium text-amber-50 hover:bg-amber-900/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPreviewPending ? "Generating preview…" : "Preview next simulated results"}
        </button>
        {preview ? (
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              setError(null);
              setMessage(null);
            }}
            disabled={busy}
            className="rounded-md border border-ash-border/80 px-4 py-2 text-sm text-ash-muted hover:bg-ash-body/30 disabled:opacity-50"
          >
            Clear preview
          </button>
        ) : null}
      </div>

      {preview ? (
        <div className="space-y-4">
          <div className="grid gap-3 text-sm text-ash-muted md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border border-ash-border/70 bg-ash-body/20 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide">Batch</div>
              <div className="mt-1 font-medium text-ash-text">
                {preview.batchLabel}
              </div>
            </div>
            <div className="rounded-md border border-ash-border/70 bg-ash-body/20 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide">Matches</div>
              <div className="mt-1 font-medium text-ash-text">
                {preview.matchCount}
              </div>
            </div>
            <div className="rounded-md border border-ash-border/70 bg-ash-body/20 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide">Stage mix</div>
              <div className="mt-1 font-medium text-ash-text">
                {stageModeLabel(preview)}
              </div>
            </div>
            <div className="rounded-md border border-ash-border/70 bg-ash-body/20 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide">Pools to recompute</div>
              <div className="mt-1 font-medium text-ash-text">
                {preview.impact.poolCount}
              </div>
            </div>
          </div>

          <div className="max-h-[420px] overflow-auto rounded-md border border-ash-border/60 bg-ash-body/20">
            <table className="w-full min-w-[760px] border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-ash-body/95 text-[10px] font-semibold uppercase tracking-wide text-ash-muted">
                <tr>
                  <th className="border-b border-ash-border/60 px-2 py-2">Match</th>
                  <th className="border-b border-ash-border/60 px-2 py-2">Kickoff</th>
                  <th className="border-b border-ash-border/60 px-2 py-2">Stage</th>
                  <th className="border-b border-ash-border/60 px-2 py-2">Home</th>
                  <th className="border-b border-ash-border/60 px-2 py-2">Away</th>
                  <th className="border-b border-ash-border/60 px-2 py-2">Generated</th>
                  <th className="border-b border-ash-border/60 px-2 py-2">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {preview.matches.map((match) => (
                  <tr key={match.matchCode} className="border-b border-ash-border/40">
                    <td className="whitespace-nowrap px-2 py-2 font-mono text-ash-text">
                      {match.matchCode}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {formatKickoff(match.kickoffAt)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-ash-text">
                      {match.stageCode}
                      {match.groupCode ? ` · Group ${match.groupCode}` : ""}
                    </td>
                    <td className="px-2 py-2 text-ash-text">{match.homeTeamName}</td>
                    <td className="px-2 py-2 text-ash-text">{match.awayTeamName}</td>
                    <td className="whitespace-nowrap px-2 py-2 font-medium text-ash-text">
                      {match.homeGoals}-{match.awayGoals}
                      {match.homePenalties != null && match.awayPenalties != null
                        ? ` (pens ${match.homePenalties}-${match.awayPenalties})`
                        : ""}
                    </td>
                    <td className="px-2 py-2">{outcomeLabel(match)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <AdminRiskConfirmPanel
            isProduction={isProduction}
            impact={preview.impact}
            actionTitle="Apply simulated results"
            buttonLabel="Apply simulated results"
            pending={isApplyPending}
            variant="simulation"
            confirmLabel="I understand this writes fake match scores to the simulation edition and recomputes only simulation pools."
            onConfirm={applyPreview}
          />
        </div>
      ) : null}
    </section>
  );
}
