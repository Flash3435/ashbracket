"use client";

import { useState } from "react";
import { LiveTournamentSyncPanel } from "./LiveTournamentSyncPanel";
import type { AdminImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";

type Props = {
  isProduction: boolean;
  impact: AdminImpactSummary;
};

export function AdminTournamentAdvancedTools({ isProduction, impact }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-8 border-t border-ash-border pt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left text-sm font-semibold text-ash-muted hover:text-ash-text"
        aria-expanded={open}
      >
        <span>Advanced / troubleshooting</span>
        <span aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-ash-muted">
            For manual corrections or debugging. Normal daily operations should use{" "}
            <span className="font-medium text-ash-text">Update today&apos;s scores</span>{" "}
            above.
          </p>
          <LiveTournamentSyncPanel isProduction={isProduction} impact={impact} secondary />
        </div>
      ) : null}
    </section>
  );
}
