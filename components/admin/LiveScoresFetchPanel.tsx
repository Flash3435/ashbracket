"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  applyLiveScoresAction,
  fetchLiveScoresPreviewAction,
} from "../../app/(worldcup)/admin/tournament/liveScoresActions";
import type { AdminImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import type {
  CardChangeRowReason,
  LiveScoresApplySummary,
  LiveScoresApplyTechnicalDetails,
  ScoreChangePreview,
  ScoreChangePreviewRow,
} from "@/lib/tournament/liveScores/types";
import { formatCardTotals } from "@/lib/tournament/liveScores/loadMatchCardStatsForLiveScores";
import { AdminRiskConfirmPanel } from "./AdminRiskConfirmPanel";

type Props = {
  isProduction: boolean;
  impact: AdminImpactSummary;
  provider: string;
  providerConfigured: boolean;
  configWarning: string | null;
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
};

function formatTechnicalDetails(details: LiveScoresApplyTechnicalDetails): string {
  return JSON.stringify(details, null, 2);
}

function isLikelyClientActionFailure(e: unknown): boolean {
  if (!(e instanceof Error)) return true;
  const msg = e.message.toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("aborted") ||
    msg.includes("failed to fetch") ||
    msg.includes("network")
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

export function LiveScoresFetchPanel({
  isProduction,
  impact,
  provider,
  providerConfigured,
  configWarning,
}: Props) {
  const router = useRouter();
  const [isFetching, startFetch] = useTransition();
  const [isApplying, startApply] = useTransition();
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<ApplyErrorState | null>(null);
  const [preview, setPreview] = useState<ScoreChangePreview | null>(null);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [applySummary, setApplySummary] = useState<LiveScoresApplySummary | null>(null);

  function fetchPreview() {
    setFetchError(null);
    setApplyError(null);
    setApplyMessage(null);
    setApplySummary(null);
    startFetch(async () => {
      try {
        const res = await fetchLiveScoresPreviewAction();
        if (!res.ok) {
          setPreview(null);
          setFetchError(res.error);
          return;
        }
        setPreview(res.preview);
      } catch (e) {
        setPreview(null);
        setFetchError(
          isLikelyClientActionFailure(e)
            ? "Fetch timed out or failed before the server responded. Retry, then check function logs if it keeps happening."
            : e instanceof Error
              ? e.message
              : "Unexpected fetch error.",
        );
      }
    });
  }

  function applyScores(productionAcknowledged: boolean) {
    if (!preview) return;
    setApplyError(null);
    setApplyMessage(null);
    setApplySummary(null);
    startApply(async () => {
      try {
        const res = await applyLiveScoresAction({
          previewId: preview.previewId,
          productionAcknowledged,
        });
        if (!res.ok) {
          setApplyError({
            message: res.error,
            technicalDetails: res.technicalDetails,
          });
          setApplySummary(res.applySummary ?? null);
          return;
        }
        setApplyMessage(res.message);
        setApplySummary(res.applySummary);
        setPreview(null);
        router.refresh();
      } catch (e) {
        setApplyError({
          message: isLikelyClientActionFailure(e)
            ? "Apply timed out or failed before the server returned a result. Scores may or may not have been written — check tournament status and function logs before retrying."
            : e instanceof Error
              ? e.message
              : "Unexpected apply error.",
        });
      }
    });
  }

  const pending = isFetching || isApplying;

  return (
    <div className="ash-surface flex flex-col gap-4 border border-sky-800/40 bg-sky-950/10 p-5">
      <div>
        <h2 className="text-lg font-bold text-ash-text">Fetch latest scores and cards</h2>
        <p className="mt-2 text-sm leading-relaxed text-ash-muted">
          Fetch latest final scores and card totals from the configured provider, then update
          standings. Preview always runs first — nothing is written until you confirm apply.
          Manual card entries are kept if they differ from provider data.
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
        <details className="mt-3 rounded-md border border-ash-border/60 bg-ash-body/20 px-3 py-2 text-sm text-ash-muted">
          <summary className="cursor-pointer font-medium text-ash-text">
            Environment variables
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <code className="text-xs">LIVE_SCORES_PROVIDER</code> —{" "}
              <code className="text-xs">api-football</code> (default) or{" "}
              <code className="text-xs">mock</code> for local tests
            </li>
            <li>
              <code className="text-xs">API_FOOTBALL_KEY</code> — API key from api-football.com
            </li>
            <li>
              <code className="text-xs">API_FOOTBALL_LEAGUE_ID</code> — competition id for World
              Cup 2026 in your provider account
            </li>
            <li>
              <code className="text-xs">API_FOOTBALL_SEASON</code> — season year (default{" "}
              <code className="text-xs">2026</code>)
            </li>
          </ul>
          <p className="mt-2">
            Local: add to <code className="text-xs">.env.local</code>. Production: Vercel →
            Project → Settings → Environment Variables.
          </p>
        </details>
      </div>

      {fetchError ? (
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {fetchError}
        </p>
      ) : null}

      {applyError ? (
        <div
          className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          <p>{applyError.message}</p>
          {applyError.technicalDetails ? (
            <details className="mt-3 rounded-md border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-100/90">
              <summary className="cursor-pointer font-medium text-red-50">
                Technical details
              </summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono">
                {formatTechnicalDetails(applyError.technicalDetails)}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}

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
            {" · "}
            <span className="font-medium text-ash-text">Card conflicts:</span>{" "}
            {applySummary.cardsManualConflict}
          </p>
          {applySummary.details.some((d) => d.planned && !d.verified) ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-100">
              {applySummary.details
                .filter((d) => d.planned && !d.verified)
                .map((d) => (
                  <li key={d.matchCode}>
                    <span className="font-mono text-xs">{d.matchCode}</span>: expected{" "}
                    {d.expectedScore ?? "—"} ({d.expectedStatus ?? "finished"}), database has{" "}
                    {d.actualScore ?? "—"} ({d.actualStatus ?? "missing"})
                    {d.reason ? ` — ${d.reason}` : ""}
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {applyMessage ? (
        <div
          className="rounded-md border border-emerald-700/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100"
          role="status"
        >
          <p>{applyMessage}</p>
          <p className="mt-2 text-ash-muted">
            <Link href="/admin/tournament/status" className="ash-link">
              Tournament status
            </Link>
            {" · "}
            <Link href="/admin/activity" className="ash-link">
              Activity
            </Link>
            {" · "}
            Open a live pool leaderboard to spot-check points.
          </p>
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
          <div className="text-sm text-ash-muted">
            <p>
              <span className="font-medium text-ash-text">Matches checked:</span>{" "}
              {preview.summary.matchesChecked}
            </p>
            <p>
              <span className="font-medium text-ash-text">Scores will update:</span>{" "}
              {preview.summary.willUpdate}
              {" · "}
              <span className="font-medium text-ash-text">Cards will update:</span>{" "}
              {preview.summary.cardsWillUpdate}
              {" · "}
              <span className="font-medium text-ash-text">Card conflicts:</span>{" "}
              {preview.summary.cardsManualConflict}
            </p>
            {preview.message ? (
              <p className="mt-2 text-amber-100">{preview.message}</p>
            ) : null}
            {preview.fixtureIdentityWarnings.length > 0 ? (
              <div className="mt-2 rounded-md border border-amber-800/50 bg-amber-950/30 p-3 text-xs text-amber-100">
                <p className="font-medium text-amber-50">
                  {preview.summary.fixturesMissingIdentity} provider fixture
                  {preview.summary.fixturesMissingIdentity === 1 ? "" : "s"} skipped (incomplete team/kickoff data):
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {preview.fixtureIdentityWarnings.slice(0, 8).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
                {preview.fixtureIdentityWarnings.length > 8 ? (
                  <p className="mt-1 text-amber-200/80">
                    …and {preview.fixtureIdentityWarnings.length - 8} more.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <PreviewTable rows={preview.rows} />

          {preview.summary.willUpdate > 0 || preview.summary.cardsWillUpdate > 0 ? (
            <AdminRiskConfirmPanel
              isProduction={isProduction}
              impact={impact}
              actionTitle="Apply fetched scores/cards and update standings"
              buttonLabel="Apply scores/cards & update standings"
              pending={isApplying}
              disabled={isFetching}
              variant="live"
              confirmLabel="I understand this writes live match scores and provider card totals from the provider and recalculates every live pool when scores change."
              onConfirm={applyScores}
            />
          ) : (
            <p className="text-sm text-ash-muted">
              Nothing to apply — only final matches with changed scores or provider card totals are
              written. Manual card entries that differ from the provider are skipped.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
