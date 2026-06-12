"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TeamFlagName } from "@/components/tournament/TeamFlagName";
import type { AdminImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import type { BonusResultPreviewRow } from "@/lib/tournament/matchTeamStats/bonusResultsFromTeamStats";
import {
  previewBonusResultsFromStatsAction,
  publishBonusResultsFromStatsAction,
} from "../../app/(worldcup)/admin/tournament/bonusResultsFromTeamStatsActions";
import { AdminRiskConfirmPanel } from "./AdminRiskConfirmPanel";

type Props = {
  isProduction: boolean;
  impact: AdminImpactSummary;
};

function statusLabel(status: BonusResultPreviewRow["status"]): string {
  switch (status) {
    case "ready":
      return "Ready to publish";
    case "unchanged":
      return "Already published";
    case "tie":
      return "Needs manual decision";
    case "no_data":
      return "No data";
    case "unsupported":
      return "Not scored in pools";
    default:
      return status;
  }
}

function statusClass(status: BonusResultPreviewRow["status"]): string {
  switch (status) {
    case "ready":
      return "text-emerald-200";
    case "unchanged":
      return "text-ash-muted";
    case "tie":
      return "text-amber-200";
    case "no_data":
      return "text-ash-muted";
    case "unsupported":
      return "text-ash-muted";
    default:
      return "text-ash-muted";
  }
}

function LeaderCell({
  team,
  total,
}: {
  team: BonusResultPreviewRow["proposedTeam"];
  total: number | null;
}) {
  if (!team) return <span className="text-ash-muted">—</span>;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <TeamFlagName
        countryCode={team.countryCode}
        teamName={team.teamName}
        nameClassName="text-sm font-medium text-ash-text"
      />
      {total != null ? (
        <span className="text-sm font-semibold tabular-nums text-ash-text">
          {total}
        </span>
      ) : null}
    </div>
  );
}

function PreviewTable({ rows }: { rows: BonusResultPreviewRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-ash-border/70">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-ash-border bg-ash-body/40 text-xs uppercase tracking-wide text-ash-muted">
          <tr>
            <th className="px-3 py-2 font-semibold">Category</th>
            <th className="px-3 py-2 font-semibold">Current leader</th>
            <th className="px-3 py-2 font-semibold">Published result</th>
            <th className="px-3 py-2 font-semibold">Proposed result</th>
            <th className="px-3 py-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ash-border/60">
          {rows.map((row) => (
            <tr key={row.bonusKey} className="align-top">
              <td className="px-3 py-3 text-ash-text">{row.label}</td>
              <td className="px-3 py-3">
                {row.leaders.length > 1 ? (
                  <div className="space-y-1">
                    {row.leaders.map((l) => (
                      <LeaderCell key={l.teamId} team={l} total={l.total} />
                    ))}
                    <p className="text-xs text-amber-200">Tied</p>
                  </div>
                ) : (
                  <LeaderCell
                    team={row.leaders[0] ?? null}
                    total={row.total}
                  />
                )}
              </td>
              <td className="px-3 py-3">
                <LeaderCell team={row.existingResultTeam} total={null} />
              </td>
              <td className="px-3 py-3">
                <LeaderCell team={row.proposedTeam} total={row.total} />
              </td>
              <td className="px-3 py-3">
                <p className={`font-medium ${statusClass(row.status)}`}>
                  {statusLabel(row.status)}
                </p>
                {row.warning ? (
                  <p className="mt-1 text-xs text-amber-100/90">{row.warning}</p>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PublishBonusResultsPanel({ isProduction, impact }: Props) {
  const router = useRouter();
  const [previewPending, startPreview] = useTransition();
  const [publishPending, startPublish] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<BonusResultPreviewRow[] | null>(null);
  const [publishableCount, setPublishableCount] = useState(0);

  function runPreview() {
    setError(null);
    setSuccessMessage(null);
    startPreview(async () => {
      const res = await previewBonusResultsFromStatsAction();
      if (!res.ok) {
        setError(res.error);
        setRows(null);
        return;
      }
      setRows(res.rows);
      setPublishableCount(res.publishableCount);
    });
  }

  function runPublish(productionAcknowledged: boolean) {
    setError(null);
    setSuccessMessage(null);
    startPublish(async () => {
      const res = await publishBonusResultsFromStatsAction({
        productionAcknowledged,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccessMessage(res.message);
      router.refresh();
      const previewRes = await previewBonusResultsFromStatsAction();
      if (previewRes.ok) {
        setRows(previewRes.rows);
        setPublishableCount(previewRes.publishableCount);
      }
    });
  }

  return (
    <section className="ash-surface space-y-4 border border-ash-border/80 bg-ash-body/20 p-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ash-muted">
          Bonus outcomes
        </p>
        <h2 className="mt-1 text-lg font-bold text-ash-text">
          Publish bonus results
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ash-muted">
          Use current stat leaders to publish bonus outcomes for most goals,
          yellow cards, and red cards. Preview before applying.
        </p>
      </div>

      <button
        type="button"
        onClick={runPreview}
        disabled={previewPending || publishPending}
        className="btn-ghost inline-flex text-sm ring-1 ring-ash-border disabled:opacity-50"
      >
        {previewPending ? "Loading preview…" : "Preview bonus results"}
      </button>

      {rows ? (
        <div className="space-y-3">
          <p className="text-sm text-ash-muted">
            {publishableCount} categor{publishableCount === 1 ? "y" : "ies"} ready
            to publish.
          </p>
          <PreviewTable rows={rows} />
        </div>
      ) : null}

      {rows && publishableCount > 0 ? (
        <AdminRiskConfirmPanel
          isProduction={isProduction}
          impact={impact}
          actionTitle="Publish bonus results and recompute standings"
          buttonLabel="Publish bonus results and recompute standings"
          pending={publishPending}
          disabled={previewPending}
          variant="live"
          confirmLabel="I understand this publishes bonus result rows from current stat leaders and recalculates live pool standings."
          onConfirm={runPublish}
        />
      ) : rows ? (
        <p className="text-sm text-ash-muted">
          Nothing ready to publish — resolve ties, enter missing stats, or wait
          until leaders change.
        </p>
      ) : null}

      {error ? (
        <p
          className="rounded-md border border-red-800/70 bg-red-950/40 px-3 py-2 text-sm text-red-100"
          role="alert"
        >
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
    </section>
  );
}
