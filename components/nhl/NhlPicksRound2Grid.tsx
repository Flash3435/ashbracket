"use client";

import type { NhlSeriesRow } from "@/lib/nhl/types";
import { NhlRound2SeriesPickCard } from "./NhlRound2SeriesPickCard";

function sortBySlot(rows: NhlSeriesRow[]): NhlSeriesRow[] {
  return [...rows].sort((a, b) => Number(a.slot_index) - Number(b.slot_index));
}

export function NhlPicksRound2Grid({
  east,
  west,
  editionId,
  round2PickBySeriesId,
  picksLocked,
  isAuthenticated,
}: {
  east: NhlSeriesRow[];
  west: NhlSeriesRow[];
  editionId: string;
  round2PickBySeriesId: Record<string, string>;
  picksLocked: boolean;
  isAuthenticated: boolean;
}) {
  const eastRows = sortBySlot(east);
  const westRows = sortBySlot(west);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <h3 className="text-center text-sm font-semibold uppercase tracking-widest text-violet-200/90">
          Eastern Conference · Round 2
        </h3>
        <p className="mt-1 text-center text-xs text-slate-500">
          Winners advance from Round 1 slots 1–2 and 3–4. Tap a team to save (sign-in required).
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {eastRows.map((s) => (
            <NhlRound2SeriesPickCard
              key={s.id}
              editionId={editionId}
              series={s}
              initialPickedTeamId={round2PickBySeriesId[s.id] ?? null}
              picksLocked={picksLocked}
              isAuthenticated={isAuthenticated}
            />
          ))}
        </div>
        {eastRows.length === 0 ? (
          <p className="mt-4 text-center text-sm text-slate-500">No Eastern Round 2 rows for this edition.</p>
        ) : null}
      </div>
      <div>
        <h3 className="text-center text-sm font-semibold uppercase tracking-widest text-violet-200/90">
          Western Conference · Round 2
        </h3>
        <p className="mt-1 text-center text-xs text-slate-500">
          Same bracket path as the East — picks save immediately per series.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {westRows.map((s) => (
            <NhlRound2SeriesPickCard
              key={s.id}
              editionId={editionId}
              series={s}
              initialPickedTeamId={round2PickBySeriesId[s.id] ?? null}
              picksLocked={picksLocked}
              isAuthenticated={isAuthenticated}
            />
          ))}
        </div>
        {westRows.length === 0 ? (
          <p className="mt-4 text-center text-sm text-slate-500">No Western Round 2 rows for this edition.</p>
        ) : null}
      </div>
    </div>
  );
}
