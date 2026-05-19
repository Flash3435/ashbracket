"use client";

import { bootstrapSimulationPoolAction } from "../../app/(worldcup)/admin/simulation/actions";
import type { AdminImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AdminRiskConfirmPanel } from "./AdminRiskConfirmPanel";

type Props = {
  isProduction: boolean;
  impact: AdminImpactSummary;
};

export function BootstrapSimulationPoolForm({ isProduction, impact }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [poolName, setPoolName] = useState("Simulation test pool");
  const [joinCode, setJoinCode] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function onConfirm(productionAcknowledged: boolean) {
    setActionError(null);
    const trimmedName = poolName.trim();
    if (!trimmedName) {
      setActionError("Pool name is required.");
      return;
    }

    startTransition(async () => {
      const res = await bootstrapSimulationPoolAction({
        poolName: trimmedName,
        joinCode: joinCode.trim() === "" ? null : joinCode,
        isPublic,
        productionAcknowledged,
      });
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      router.push(
        `/admin/pools/${res.poolId}?sim=1&edition=${encodeURIComponent(res.editionCode)}`,
      );
    });
  }

  return (
    <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-amber-100">
        Quick start: simulation pool + edition
      </h3>
      <p className="mt-1 text-xs text-amber-100/80">
        Copies the live World Cup schedule into a new simulation edition (blank
        scores), then creates a simulation pool tied to it.
      </p>

      {actionError ? (
        <p
          className="mt-3 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}

      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <label htmlFor="sim-pool-name" className="block text-sm font-medium text-ash-text">
            Pool name
          </label>
          <input
            id="sim-pool-name"
            type="text"
            value={poolName}
            onChange={(e) => setPoolName(e.target.value)}
            disabled={isPending}
            className="w-full max-w-md rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="sim-join-code" className="block text-sm font-medium text-ash-text">
            Join code <span className="font-normal text-ash-muted">(optional)</span>
          </label>
          <input
            id="sim-join-code"
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            disabled={isPending}
            className="w-full max-w-md rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text"
            placeholder="e.g. SIM-TEST-01"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-ash-muted">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            disabled={isPending}
          />
          Public leaderboard
        </label>
      </div>

      <div className="mt-6">
        <AdminRiskConfirmPanel
          isProduction={isProduction}
          impact={impact}
          actionTitle="Create simulation pool"
          buttonLabel="Create simulation pool"
          pending={isPending}
          variant="simulation"
          confirmLabel="I understand this creates new test-only data and does not change any live pool or live results."
          onConfirm={onConfirm}
        />
      </div>
    </div>
  );
}
