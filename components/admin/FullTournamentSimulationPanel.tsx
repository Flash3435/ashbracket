"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  applyFullTournamentSimulationAction,
  previewFullTournamentSimulationAction,
  type ApplyFullTournamentSimulationResult,
  type FullTournamentSimulationPreview,
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

function outcomeLabel(match: FullTournamentSimulationPreview["matches"][number]): string {
  if (match.decisionType === "draw") return "Draw";
  if (match.decisionType === "penalties") {
    return `${match.winnerTeamName ?? "Winner"} on penalties`;
  }
  return match.winnerTeamName ?? "Winner";
}

export function FullTournamentSimulationPanel({ editionId, isProduction }: Props) {
  const router = useRouter();
  const [preview, setPreview] = useState<FullTournamentSimulationPreview | null>(null);
  const [applySummary, setApplySummary] = useState<
    Extract<ApplyFullTournamentSimulationResult, { ok: true }>["summary"] | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewPending, startPreviewTransition] = useTransition();
  const [isApplyPending, startApplyTransition] = useTransition();

  const busy = isPreviewPending || isApplyPending;
  const blocked = Boolean(preview && (preview.blockers.length > 0 || !preview.tournamentWillFinish));

  function loadPreview() {
    setError(null);
    setMessage(null);
    setApplySummary(null);
    startPreviewTransition(async () => {
      const res = await previewFullTournamentSimulationAction({ editionId });
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
      const res = await applyFullTournamentSimulationAction({
        editionId,
        preview,
        productionAcknowledged,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage(res.message);
      setApplySummary(res.summary);
      setPreview(null);
      router.refresh();
    });
  }

  return (
    <section className="ash-surface mb-8 space-y-4 border border-sky-700/40 bg-sky-950/15 p-4">
      <div className="space-y-2">
        <h2 className="text-base font-bold text-ash-text">Simulate full tournament</h2>
        <p className="text-sm leading-relaxed text-ash-muted">
          Simulation edition only. This runs the remaining tournament to completion for this
          simulation edition only: remaining group matches, group resolution, eight third-place
          advancers, FIFA Annex C / Round of 32, and the knockout bracket through the final.
        </p>
        <p className="text-xs leading-relaxed text-ash-muted">
          Safety rules: only remaining unplayed simulation matches are filled, blockers stop the
          run before any writes, and live editions, live pools, and live standings are untouched.
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

      {applySummary ? (
        <div className="rounded-md border border-emerald-800/60 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-100">
          <p className="font-medium text-emerald-50">Full simulation summary</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
            <li>Groups resolved: {applySummary.groupsResolved}/12</li>
            <li>Third-place advancers resolved: {applySummary.thirdPlaceAdvancersResolved}/8</li>
            <li>Knockout rounds completed: {applySummary.knockoutRoundsCompleted.join(", ")}</li>
            <li>Champion: {applySummary.championTeamName ?? "Unknown"}</li>
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={loadPreview}
          disabled={busy}
          className="rounded-md border border-sky-500/60 bg-sky-900/40 px-4 py-2 text-sm font-medium text-sky-50 hover:bg-sky-900/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPreviewPending ? "Generating preview…" : "Preview full tournament simulation"}
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
              <div className="text-[11px] uppercase tracking-wide">Remaining matches</div>
              <div className="mt-1 font-medium text-ash-text">{preview.matchCount}</div>
            </div>
            <div className="rounded-md border border-ash-border/70 bg-ash-body/20 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide">Stages included</div>
              <div className="mt-1 font-medium text-ash-text">
                {preview.stagesIncluded.length > 0
                  ? preview.stagesIncluded.join(", ")
                  : "None"}
              </div>
            </div>
            <div className="rounded-md border border-ash-border/70 bg-ash-body/20 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide">Round of 32</div>
              <div className="mt-1 font-medium text-ash-text">
                {preview.willGenerateRoundOf32 ? "Generate / refresh" : "Already present"}
              </div>
            </div>
            <div className="rounded-md border border-ash-border/70 bg-ash-body/20 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide">Projected champion</div>
              <div className="mt-1 font-medium text-ash-text">
                {preview.championTeamName ?? "Blocked / unresolved"}
              </div>
            </div>
          </div>

          <div className="grid gap-3 text-sm text-ash-muted md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border border-ash-border/70 bg-ash-body/20 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide">Groups resolved</div>
              <div className="mt-1 font-medium text-ash-text">{preview.groupsResolved}/12</div>
            </div>
            <div className="rounded-md border border-ash-border/70 bg-ash-body/20 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide">Third-place advancers</div>
              <div className="mt-1 font-medium text-ash-text">
                {preview.thirdPlaceAdvancersResolved}/8
              </div>
            </div>
            <div className="rounded-md border border-ash-border/70 bg-ash-body/20 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide">Pools to recompute</div>
              <div className="mt-1 font-medium text-ash-text">{preview.impact.poolCount}</div>
            </div>
            <div className="rounded-md border border-ash-border/70 bg-ash-body/20 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide">Tournament finish</div>
              <div className="mt-1 font-medium text-ash-text">
                {preview.tournamentWillFinish ? "Ready to complete" : "Blocked"}
              </div>
            </div>
          </div>

          {preview.blockers.length > 0 ? (
            <div className="rounded-md border border-red-800/80 bg-red-950/35 px-4 py-3 text-sm text-red-100">
              <p className="font-medium text-red-50">Preview blockers</p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {preview.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          ) : null}

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
            actionTitle="Apply full tournament simulation"
            buttonLabel="Apply full tournament simulation"
            pending={isApplyPending}
            disabled={blocked}
            variant="simulation"
            confirmLabel="I understand this completes the remaining tournament only inside this simulation edition, writes only simulation test data, and recomputes only simulation pools."
            onConfirm={applyPreview}
          />
        </div>
      ) : null}
    </section>
  );
}
