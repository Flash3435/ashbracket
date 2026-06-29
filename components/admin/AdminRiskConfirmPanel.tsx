"use client";

import { useState } from "react";
import type { AdminImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import { AdminImpactSummaryCard } from "./AdminImpactSummaryCard";

type Props = {
  isProduction: boolean;
  impact: AdminImpactSummary;
  actionTitle: string;
  buttonLabel: string;
  pending?: boolean;
  disabled?: boolean;
  variant?: "live" | "simulation";
  /** Extra checkbox label; defaults based on impact mode. */
  confirmLabel?: string;
  /** Override default impact effect lines (e.g. Step A vs Step B copy). */
  effectLines?: string[];
  onConfirm: (productionAcknowledged: boolean) => void | Promise<void>;
};

export function AdminRiskConfirmPanel({
  isProduction,
  impact,
  actionTitle,
  buttonLabel,
  pending = false,
  disabled = false,
  variant,
  confirmLabel,
  effectLines,
  onConfirm,
}: Props) {
  const [checked, setChecked] = useState(false);
  const needsAck = isProduction;
  const canRun = !disabled && !pending && (!needsAck || checked);

  const tone =
    variant ?? (impact.isSimulation ? "simulation" : "live");

  const defaultConfirmLabel = impact.isSimulation
    ? "I understand this only changes simulation test data and simulation pools — not live pools."
    : "I understand this changes live official data and live pool standings.";

  const buttonClass =
    tone === "simulation"
      ? "rounded-lg border border-amber-600/60 bg-amber-900/50 px-4 py-2 text-sm font-medium text-amber-50 hover:bg-amber-900/70 disabled:opacity-50"
      : "btn-primary disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="space-y-4">
      <AdminImpactSummaryCard
        impact={effectLines ? { ...impact, effectLines } : impact}
        title={actionTitle}
      />

      {isProduction ? (
        <p
          className="rounded-md border border-red-800/70 bg-red-950/40 px-3 py-2 text-sm text-red-100"
          role="alert"
        >
          <strong>Production:</strong> confirm the impact summary above before running
          this action.
        </p>
      ) : null}

      {needsAck ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-ash-border bg-ash-body/50 p-3 text-sm text-ash-text">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            disabled={pending}
            className="mt-1"
          />
          <span>{confirmLabel ?? defaultConfirmLabel}</span>
        </label>
      ) : null}

      <button
        type="button"
        disabled={!canRun}
        onClick={() => {
          void Promise.resolve(onConfirm(needsAck ? checked : false)).catch((e) => {
            console.error("[AdminRiskConfirmPanel] onConfirm failed", e);
          });
        }}
        className={buttonClass}
      >
        {pending ? "Working…" : buttonLabel}
      </button>
    </div>
  );
}
