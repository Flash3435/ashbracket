"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { fetchLiveScoresPreviewAction } from "../../app/(worldcup)/admin/tournament/liveScoresActions";
import type { AdminImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import type {
  CardChangeRowReason,
  LiveScoresApplySummary,
  LiveScoresApplyTechnicalDetails,
  ScoreChangePreview,
  ScoreChangePreviewRow,
} from "@/lib/tournament/liveScores/types";
import type { LiveScoresSyncDiagnostics } from "@/lib/tournament/liveScores/buildLiveScoresSyncDiagnostics";
import { formatCardTotals } from "@/lib/tournament/liveScores/loadMatchCardStatsForLiveScores";
import { extractApplyPlanOperations, type ApplyPlanMismatch } from "@/lib/tournament/liveScores/applyPlanSignature";
import {
  buildLiveScoresApplyPlanSubmitPayload,
  formatApplyPlanClientDebug,
} from "@/lib/tournament/liveScores/liveScoresApplyPlanClient";
import {
  formatHttpDebugLine,
  postLiveScoresApplyScores,
  postLiveScoresRecalculatePool,
} from "@/lib/tournament/liveScores/liveScoresApplyClient";
import { buildStepAImpactLines } from "@/lib/tournament/liveScores/liveScoresHttpClient";
import { formatLiveScoresSyncDiagnosticsSummary } from "@/lib/tournament/liveScores/buildLiveScoresSyncDiagnostics";
import { interpretStepAResponse } from "@/lib/tournament/liveScores/liveScoresStepAUi";
import { AdminRiskConfirmPanel } from "./AdminRiskConfirmPanel";

type Props = {
  isProduction: boolean;
  impact: AdminImpactSummary;
  provider: string;
  providerConfigured: boolean;
  configWarning: string | null;
  applyBuild: string;
  deploySha: string;
};

const APPLY_ERROR_STORAGE_KEY = "ashbracket:live-scores:apply-error";
const PREVIEW_DEBUG_STORAGE_KEY = "ashbracket:live-scores:preview-debug";

function clearStoredApplyState() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(APPLY_ERROR_STORAGE_KEY);
    sessionStorage.removeItem(PREVIEW_DEBUG_STORAGE_KEY);
  } catch {
    // ignore quota / private mode
  }
}

function storeApplyError(error: ApplyErrorState | null) {
  if (typeof window === "undefined") return;
  try {
    if (!error) {
      sessionStorage.removeItem(APPLY_ERROR_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(APPLY_ERROR_STORAGE_KEY, JSON.stringify(error));
  } catch {
    // ignore quota / private mode
  }
}

function storePreviewDebug(debug: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (!debug) {
      sessionStorage.removeItem(PREVIEW_DEBUG_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(PREVIEW_DEBUG_STORAGE_KEY, debug);
  } catch {
    // ignore quota / private mode
  }
}

type StandingsRecalcState = {
  editionId: string;
  poolIds: string[];
  appliedMatchCodes: string[];
  completed: number;
  failedPoolId?: string;
  error?: string;
};

function formatScore(
  home: number | null,
  away: number | null,
  homePen: number | null,
  awayPen: number | null,
): string {
  if (home == null || away == null) return "—";
  const base = `${home}–${away}`;
  if (homePen != null && awayPen != null) return `${base} (${homePen}–${awayPen} pens)`;
  return base;
}

function cardReasonLabel(reason: CardChangeRowReason): string {
  switch (reason) {
    case "will_update":
      return "Cards will update";
    case "unchanged":
      return "Cards unchanged";
    case "no_event_data":
      return "No event data";
    case "manual_conflict":
      return "Manual cards differ — skipped";
    case "skipped":
      return "Cards skipped";
    case "unmapped":
      return "Cards unmapped";
    default:
      return reason;
  }
}

function formatDbCards(row: ScoreChangePreviewRow): string {
  return formatCardTotals(
    row.currentHomeYellowCards,
    row.currentAwayYellowCards,
    row.currentHomeRedCards,
    row.currentAwayRedCards,
  );
}

function formatFetchedCards(row: ScoreChangePreviewRow): string {
  return formatCardTotals(
    row.fetchedHomeYellowCards,
    row.fetchedAwayYellowCards,
    row.fetchedHomeRedCards,
    row.fetchedAwayRedCards,
  );
}

type ApplyErrorState = {
  message: string;
  technicalDetails?: LiveScoresApplyTechnicalDetails;
  stalePreview?: ApplyPlanMismatch;
  debugLine?: string;
};

function formatTechnicalDetails(details: LiveScoresApplyTechnicalDetails): string {
  return JSON.stringify(details, null, 2);
}

function isLikelyClientFailure(e: unknown): boolean {
  if (!(e instanceof Error)) return true;
  const msg = e.message.toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("aborted") ||
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("empty response")
  );
}

function reasonLabel(reason: ScoreChangePreviewRow["reason"]): string {
  switch (reason) {
    case "will_update":
      return "Will update";
    case "unchanged":
      return "Unchanged";
    case "sync_locked":
      return "Sync locked";
    case "not_finished":
      return "Not final";
    case "in_progress":
      return "In progress";
    case "unmapped":
      return "Unmapped";
    case "ambiguous":
      return "Ambiguous";
    case "postponed":
      return "Postponed";
    case "cancelled":
      return "Cancelled";
    case "no_score":
      return "No score";
    default:
      return reason;
  }
}

function SyncDiagnosticsPanel({ diagnostics }: { diagnostics: LiveScoresSyncDiagnostics }) {
  const summaryLines = formatLiveScoresSyncDiagnosticsSummary(diagnostics);
  const knockoutMissing = diagnostics.knockoutMissingProviderFixtureId.filter(
    (row) => row.matchCode >= "M89",
  );
  const unmapped = diagnostics.unmappedProviderFixtures;

  return (
    <details className="mt-2 rounded-md border border-ash-border/60 bg-ash-body/20 px-3 py-2 text-xs text-ash-muted">
      <summary className="cursor-pointer font-medium text-ash-text">
        Sync diagnostics
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        {summaryLines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {knockoutMissing.length > 0 ? (
        <div className="mt-3">
          <p className="font-medium text-amber-100">
            Knockout rows missing provider_fixture_id (M89+)
          </p>
          <ul className="mt-1 max-h-40 overflow-y-auto font-mono text-[11px] text-ash-muted">
            {knockoutMissing.map((row) => (
              <li key={row.matchCode}>
                {row.matchCode} · {row.stageCode} · {row.homeTeamName} vs {row.awayTeamName} ·{" "}
                {row.status}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {unmapped.length > 0 ? (
        <div className="mt-3">
          <p className="font-medium text-amber-100">Provider fixtures not matched to DB</p>
          <ul className="mt-1 max-h-40 overflow-y-auto font-mono text-[11px] text-ash-muted">
            {unmapped.map((row) => (
              <li key={row.providerFixtureId}>
                {row.providerFixtureId} · {row.label} · {row.kickoffAt} · {row.status}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </details>
  );
}

function PreviewTable({ rows }: { rows: ScoreChangePreviewRow[] }) {
  const interesting = rows.filter(
    (r) =>
      r.willUpdate ||
      r.reason === "ambiguous" ||
      r.reason === "unmapped" ||
      r.reason === "in_progress" ||
      r.reason === "sync_locked" ||
      r.cardWillUpdate ||
      r.cardReason === "manual_conflict" ||
      r.fetchedStatus === "finished",
  );

  if (interesting.length === 0) {
    return (
      <p className="text-sm text-ash-muted">No provider fixtures matched tournament matches.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead>
          <tr className="border-b border-ash-border text-ash-muted">
            <th className="py-2 pr-3 font-medium">Match</th>
            <th className="py-2 pr-3 font-medium">Provider id</th>
            <th className="py-2 pr-3 font-medium">Teams</th>
            <th className="py-2 pr-3 font-medium">DB score</th>
            <th className="py-2 pr-3 font-medium">Fetched</th>
            <th className="py-2 pr-3 font-medium">Cards DB</th>
            <th className="py-2 pr-3 font-medium">Cards fetched</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 font-medium">Plan</th>
          </tr>
        </thead>
        <tbody>
          {interesting.map((row) => (
            <tr key={row.matchId} className="border-b border-ash-border/50 align-top">
              <td className="py-2 pr-3 font-mono text-xs">{row.matchCode}</td>
              <td className="py-2 pr-3 font-mono text-xs">{row.providerFixtureId ?? "—"}</td>
              <td className="py-2 pr-3">
                {row.homeTeamName} vs {row.awayTeamName}
              </td>
              <td className="py-2 pr-3">
                {formatScore(
                  row.currentHomeGoals,
                  row.currentAwayGoals,
                  row.currentHomePenalties,
                  row.currentAwayPenalties,
                )}
              </td>
              <td className="py-2 pr-3">
                {formatScore(
                  row.fetchedHomeGoals,
                  row.fetchedAwayGoals,
                  row.fetchedHomePenalties,
                  row.fetchedAwayPenalties,
                )}
              </td>
              <td className="py-2 pr-3 text-xs">{formatDbCards(row)}</td>
              <td className="py-2 pr-3 text-xs">{formatFetchedCards(row)}</td>
              <td className="py-2 pr-3">{row.fetchedStatus ?? row.currentStatus}</td>
              <td className="py-2">
                <div className="space-y-1">
                  <span
                    className={
                      row.willUpdate
                        ? "font-medium text-emerald-200"
                        : row.reason === "ambiguous" || row.reason === "unmapped"
                          ? "text-amber-200"
                          : "text-ash-muted"
                    }
                  >
                    Score: {reasonLabel(row.reason)}
                  </span>
                  <span
                    className={
                      row.cardWillUpdate
                        ? "block font-medium text-emerald-200"
                        : row.cardReason === "manual_conflict" || row.cardReason === "no_event_data"
                          ? "block text-amber-200"
                          : "block text-ash-muted"
                    }
                  >
                    {cardReasonLabel(row.cardReason)}
                  </span>
                </div>
                {row.warnings.length > 0 ? (
                  <ul className="mt-1 list-disc pl-4 text-xs text-amber-200/90">
                    {row.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ErrorBanner({
  error,
}: {
  error: ApplyErrorState;
}) {
  return (
    <div
      className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
      role="alert"
    >
      <p>{error.message}</p>
      {error.debugLine ? (
        <p className="mt-2 font-mono text-xs text-red-100/90">HTTP debug: {error.debugLine}</p>
      ) : null}
      {error.stalePreview ? (
        <details className="mt-3 rounded-md border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-100/90">
          <summary className="cursor-pointer font-medium text-red-50">Apply plan diff</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono">
            {JSON.stringify(error.stalePreview, null, 2)}
          </pre>
        </details>
      ) : null}
      {error.technicalDetails ? (
        <details className="mt-3 rounded-md border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-100/90">
          <summary className="cursor-pointer font-medium text-red-50">Technical details</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono">
            {formatTechnicalDetails(error.technicalDetails)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

export function LiveScoresFetchPanel({
  isProduction,
  impact,
  provider,
  providerConfigured,
  configWarning,
  applyBuild,
  deploySha,
}: Props) {
  const router = useRouter();
  const [isFetching, startFetch] = useTransition();
  const [isApplying, setIsApplying] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<ApplyErrorState | null>(null);
  const [recalcError, setRecalcError] = useState<ApplyErrorState | null>(null);
  const [adminDebugStatus, setAdminDebugStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<ScoreChangePreview | null>(null);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [applySummary, setApplySummary] = useState<LiveScoresApplySummary | null>(null);
  const [standingsRecalc, setStandingsRecalc] = useState<StandingsRecalcState | null>(null);
  const [stepADebugLine, setStepADebugLine] = useState<string | null>(null);
  const [applyPlanClientDebug, setApplyPlanClientDebug] = useState<string | null>(null);
  const [lastSubmittedApplyDebug, setLastSubmittedApplyDebug] = useState<string | null>(null);
  const applyAttemptRef = useRef(0);

  const stepAEffectLines =
    impact.editionName && impact.editionCode
      ? buildStepAImpactLines({
          editionName: impact.editionName,
          editionCode: impact.editionCode,
        })
      : impact.effectLines;

  useEffect(() => {
    console.info("[ashbracket:liveScoresClient] panel mounted", {
      applyBuild,
      deploySha,
    });
    clearStoredApplyState();
    setApplyError(null);
    setStepADebugLine(null);
    setApplyPlanClientDebug(null);
    setLastSubmittedApplyDebug(null);
  }, [applyBuild, deploySha]);

  function setVisibleApplyError(error: ApplyErrorState | null) {
    setApplyError(error);
    storeApplyError(error);
    setStepADebugLine(error?.debugLine ?? null);
  }

  function fetchPreview() {
    setFetchError(null);
    setVisibleApplyError(null);
    setRecalcError(null);
    setApplyMessage(null);
    setApplySummary(null);
    setStandingsRecalc(null);
    setLastSubmittedApplyDebug(null);
    clearStoredApplyState();
    startFetch(async () => {
      try {
        const res = await fetchLiveScoresPreviewAction();
        if (!res.ok) {
          setPreview(null);
          setApplyPlanClientDebug(null);
          storePreviewDebug(null);
          setFetchError(res.error);
          return;
        }
        const clientDebug = formatApplyPlanClientDebug(res.preview);
        setPreview(res.preview);
        setApplyPlanClientDebug(clientDebug);
        storePreviewDebug(clientDebug);
        console.info("[ashbracket:liveScoresClient] preview fetched", {
          previewId: res.preview.previewId,
          operationCount: extractApplyPlanOperations(res.preview.rows).length,
        });
      } catch (e) {
        setPreview(null);
        setApplyPlanClientDebug(null);
        storePreviewDebug(null);
        setFetchError(
          isLikelyClientFailure(e)
            ? "Fetch timed out or failed before the server responded."
            : e instanceof Error
              ? e.message
              : "Unexpected fetch error.",
        );
      }
    });
  }

  async function applyScores(productionAcknowledged: boolean) {
    if (!preview || isApplying || isRecalculating) return;

    const attemptId = ++applyAttemptRef.current;
    setIsApplying(true);
    setVisibleApplyError(null);
    setRecalcError(null);
    setApplyMessage(null);
    setApplySummary(null);
    setStandingsRecalc(null);
    setStepADebugLine("Step A: client submit started…");
    setAdminDebugStatus("Step A: client submit started…");
    console.info("[ashbracket:liveScoresClient] apply started", { attemptId, applyBuild });

    try {
      const submitPayload = buildLiveScoresApplyPlanSubmitPayload(preview);
      const submittedDebug = [
        `submittedPreviewId=${submitPayload.previewId}`,
        `submittedApplyPlanSignature=${submitPayload.previewId}`,
        `submittedOperationCount=${submitPayload.applyPlanSnapshotCount}`,
      ].join(" · ");
      setLastSubmittedApplyDebug(submittedDebug);
      console.info("[ashbracket:liveScoresClient] apply submit payload", {
        previewId: submitPayload.previewId,
        applyPlanSnapshotCount: submitPayload.applyPlanSnapshotCount,
      });

      const call = await postLiveScoresApplyScores({
        previewId: submitPayload.previewId,
        applyPlanSnapshot: submitPayload.applyPlanSnapshot,
        productionAcknowledged,
      });

      if (attemptId !== applyAttemptRef.current) return;

      const outcome = interpretStepAResponse({
        clientOk: call.ok,
        clientError: call.ok ? undefined : call.error,
        debug: call.debug,
        payload: call.ok ? call.data : call.data,
      });

      setStepADebugLine(`Step A finished · ${outcome.debugLine}`);
      setAdminDebugStatus(`Step A finished · ${outcome.debugLine}`);

      if (outcome.kind === "error") {
        setVisibleApplyError({
          message: outcome.message,
          technicalDetails: outcome.technicalDetails,
          stalePreview: outcome.stalePreview,
          debugLine: outcome.stalePreview
            ? [
                outcome.debugLine,
                `submittedSignature=${outcome.stalePreview.submittedSignature}`,
                `rebuiltSignature=${outcome.stalePreview.rebuiltSignature}`,
                `materialIntentMatch=${outcome.stalePreview.materialIntentMatch}`,
                `rawOperationSignatureMatch=${outcome.stalePreview.rawOperationSignatureMatch}`,
                `submittedOperationCount=${outcome.stalePreview.submittedOperationCount}`,
                `rebuiltOperationCount=${outcome.stalePreview.rebuiltOperationCount}`,
              ].join(" · ")
            : outcome.debugLine,
        });
        setApplySummary(outcome.applySummary ?? null);
        setPreview(null);
        setApplyPlanClientDebug(null);
        storePreviewDebug(null);
        return;
      }

      setApplyMessage(outcome.message);
      setApplySummary(outcome.applySummary);
      setVisibleApplyError(null);
      setPreview(null);
      setApplyPlanClientDebug(null);
      setLastSubmittedApplyDebug(null);
      clearStoredApplyState();
      storePreviewDebug(null);

      if (outcome.showStepB) {
        setStandingsRecalc({
          editionId: outcome.editionId,
          poolIds: outcome.pendingPoolIds,
          appliedMatchCodes: outcome.appliedMatchCodes,
          completed: 0,
        });
      } else {
        router.refresh();
      }
    } catch (e) {
      if (attemptId !== applyAttemptRef.current) return;
      const message = isLikelyClientFailure(e)
        ? "Apply threw before a response could be handled. Check network tab and Vercel logs."
        : e instanceof Error
          ? e.message
          : "Unexpected apply error.";
      setVisibleApplyError({ message, debugLine: "Step A: unhandled client exception" });
      setStepADebugLine(`Step A exception · ${message}`);
      setAdminDebugStatus("Step A: client caught an exception.");
    } finally {
      if (attemptId === applyAttemptRef.current) {
        setIsApplying(false);
      }
      console.info("[ashbracket:liveScoresClient] apply finished", { attemptId });
    }
  }

  async function recalculateAllPools(productionAcknowledged: boolean) {
    if (!standingsRecalc || isRecalculating || isApplying) return;

    setIsRecalculating(true);
    setRecalcError(null);
    setAdminDebugStatus(
      `Step B: recalculating ${standingsRecalc.poolIds.length} live pool(s)…`,
    );

    let completed = 0;
    const total = standingsRecalc.poolIds.length;

    try {
      for (let index = 0; index < total; index += 1) {
        const poolId = standingsRecalc.poolIds[index]!;
        setAdminDebugStatus(`Step B: pool ${index + 1}/${total} (${poolId.slice(0, 8)}…)…`);

        const res = await postLiveScoresRecalculatePool({
          editionId: standingsRecalc.editionId,
          poolId,
          poolIndex: index,
          poolTotal: total,
          appliedMatchCodes: standingsRecalc.appliedMatchCodes,
          productionAcknowledged,
          revalidateWhenComplete: index === total - 1,
        });

        if (!res.ok) {
          setStandingsRecalc({
            ...standingsRecalc,
            completed,
            failedPoolId: poolId,
            error: res.error,
          });
          setRecalcError({
            message: `Pool recalculation failed on pool ${index + 1}/${total}: ${res.error}`,
            technicalDetails: res.data?.ok === false ? res.data.technicalDetails : undefined,
            debugLine: formatHttpDebugLine(res.debug),
          });
          setAdminDebugStatus(`Step B failed on pool ${index + 1}/${total}. · ${formatHttpDebugLine(res.debug)}`);
          return;
        }

        completed += 1;
        setStandingsRecalc({
          editionId: standingsRecalc.editionId,
          poolIds: standingsRecalc.poolIds,
          appliedMatchCodes: standingsRecalc.appliedMatchCodes,
          completed,
        });
      }

      setStandingsRecalc(null);
      setApplyMessage((prev) =>
        prev
          ? `${prev} All ${total} live pool standings recalculated.`
          : `All ${total} live pool standings recalculated.`,
      );
      setAdminDebugStatus(`Step B completed for ${total} pool(s).`);
      router.refresh();
    } catch (e) {
      setRecalcError({
        message: isLikelyClientFailure(e)
          ? "Pool recalculation timed out or failed mid-run. Some pools may already be updated."
          : e instanceof Error
            ? e.message
            : "Unexpected pool recalculation error.",
      });
      setAdminDebugStatus("Step B: client caught an exception.");
    } finally {
      setIsRecalculating(false);
    }
  }

  const pending = isFetching || isApplying || isRecalculating;

  return (
    <div className="ash-surface flex flex-col gap-4 border border-sky-800/40 bg-sky-950/10 p-5">
      <div>
        <h2 className="text-lg font-bold text-ash-text">Fetch latest scores and cards</h2>
        <p className="mt-2 text-sm leading-relaxed text-ash-muted">
          Two-step workflow: Step A saves official scores, cards, and derived knockout results.
          Step B recalculates live pool standings one pool at a time so score writes cannot time out.
        </p>
        <p className="mt-2 text-xs text-ash-muted">
          Deploy: <span className="font-mono text-ash-text">{deploySha}</span>
          {" · "}
          Apply build: <span className="font-mono text-ash-text">{applyBuild}</span>
        </p>
        <p className="mt-2 text-sm text-ash-muted">
          <span className="font-medium text-ash-text">Provider:</span> {provider}
          {providerConfigured ? (
            <span className="ml-2 text-emerald-300">configured</span>
          ) : (
            <span className="ml-2 text-amber-300">not configured</span>
          )}
        </p>
        {configWarning ? (
          <p
            className="mt-2 rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100"
            role="alert"
          >
            {configWarning}
          </p>
        ) : null}
      </div>

      {adminDebugStatus || stepADebugLine || applyPlanClientDebug || lastSubmittedApplyDebug ? (
        <div className="rounded-md border border-sky-800/50 bg-sky-950/30 px-3 py-2 text-xs text-sky-100 space-y-1">
          {stepADebugLine || adminDebugStatus ? (
            <p>Admin debug: {stepADebugLine ?? adminDebugStatus}</p>
          ) : null}
          {applyPlanClientDebug ? (
            <p className="font-mono">Client preview: {applyPlanClientDebug}</p>
          ) : null}
          {lastSubmittedApplyDebug ? (
            <p className="font-mono">Client submit: {lastSubmittedApplyDebug}</p>
          ) : null}
        </div>
      ) : null}

      {fetchError ? (
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {fetchError}
        </p>
      ) : null}

      {applyError ? <ErrorBanner error={applyError} /> : null}
      {recalcError ? <ErrorBanner error={recalcError} /> : null}

      {applySummary ? (
        <div
          className="rounded-md border border-ash-border/70 bg-ash-body/20 px-3 py-2 text-sm text-ash-muted"
          role="status"
        >
          <p>
            <span className="font-medium text-ash-text">Scores planned:</span> {applySummary.planned}
            {" · "}
            <span className="font-medium text-ash-text">Written:</span> {applySummary.written}
            {" · "}
            <span className="font-medium text-ash-text">Cards written:</span>{" "}
            {applySummary.cardsWritten}/{applySummary.cardsPlanned}
          </p>
        </div>
      ) : null}

      {applyMessage ? (
        <div
          className="rounded-md border border-emerald-700/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100"
          role="status"
        >
          <p>{applyMessage}</p>
        </div>
      ) : null}

      {standingsRecalc ? (
        <div className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          <p className="font-medium text-amber-50">Step B required — live pool standings</p>
          <p className="mt-1">
            Scores and derived results are saved.{" "}
            {standingsRecalc.completed}/{standingsRecalc.poolIds.length} live pool(s) recalculated.
          </p>
          {standingsRecalc.error ? (
            <p className="mt-2 text-red-200">Last error: {standingsRecalc.error}</p>
          ) : null}
          <div className="mt-4">
            <AdminRiskConfirmPanel
              isProduction={isProduction}
              impact={impact}
              actionTitle="Recalculate live pool standings (Step B)"
              buttonLabel={
                isRecalculating
                  ? `Recalculating ${standingsRecalc.completed}/${standingsRecalc.poolIds.length}…`
                  : "Recalculate all live pool standings"
              }
              pending={isRecalculating}
              disabled={isApplying}
              variant="live"
              confirmLabel="I understand this recalculates every live pool's leaderboard from the saved scores."
              onConfirm={recalculateAllPools}
            />
          </div>
        </div>
      ) : null}

      <button
        type="button"
        disabled={!providerConfigured || pending}
        onClick={fetchPreview}
        className="rounded-lg border border-ash-border bg-ash-body/50 px-4 py-2 text-sm font-medium text-ash-text hover:bg-ash-body/80 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isFetching ? "Fetching…" : "Fetch latest scores and cards"}
      </button>

      {preview ? (
        <div className="space-y-4 border-t border-ash-border/60 pt-4">
          <div className="text-sm text-ash-muted space-y-1">
            <p>
              <span className="font-medium text-ash-text">Matches checked:</span>{" "}
              {preview.summary.matchesChecked}
              {preview.syncDiagnostics ? (
                <>
                  {" "}
                  <span className="text-ash-muted">
                    (DB eligible: {preview.syncDiagnostics.totalDbMatchesEligible})
                  </span>
                </>
              ) : null}
            </p>
            <p>
              <span className="font-medium text-ash-text">Scores will update:</span>{" "}
              {preview.summary.willUpdate}
              {" · "}
              <span className="font-medium text-ash-text">Cards will update:</span>{" "}
              {preview.summary.cardsWillUpdate}
            </p>
            {preview.syncDiagnostics ? (
              <SyncDiagnosticsPanel diagnostics={preview.syncDiagnostics} />
            ) : null}
          </div>

          <PreviewTable rows={preview.rows} />

          {applyError ? (
            <div className="sticky top-2 z-10">
              <ErrorBanner error={applyError} />
            </div>
          ) : null}

          {preview.summary.willUpdate > 0 || preview.summary.cardsWillUpdate > 0 ? (
            <AdminRiskConfirmPanel
              isProduction={isProduction}
              impact={impact}
              effectLines={stepAEffectLines}
              actionTitle="Step A — Apply fetched scores/cards (no standings yet)"
              buttonLabel={
                isApplying ? "Saving scores…" : "Apply scores/cards (Step A)"
              }
              pending={isApplying}
              disabled={isFetching || isRecalculating}
              variant="live"
              confirmLabel="I understand Step A writes live match scores and provider card totals, rebuilds derived knockout results, and does not recalculate pool standings yet."
              onConfirm={applyScores}
            />
          ) : (
            <p className="text-sm text-ash-muted">Nothing to apply.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
