import type { NhlSeriesRow } from "@/lib/nhl/types";
import { NhlRound1SeriesPickCard } from "./NhlRound1SeriesPickCard";

function sortBySlot(rows: NhlSeriesRow[]): NhlSeriesRow[] {
  return [...rows].sort((a, b) => a.slot_index - b.slot_index);
}

export function NhlPicksRound1Grid({
  east,
  west,
  fallback,
  editionId,
  round1PickBySeriesId,
  picksLocked,
  isAuthenticated,
}: {
  east: NhlSeriesRow[];
  west: NhlSeriesRow[];
  /** Used when rows are not grouped by conference in the view model. */
  fallback?: NhlSeriesRow[];
  editionId: string;
  round1PickBySeriesId: Record<string, string>;
  picksLocked: boolean;
  isAuthenticated: boolean;
}) {
  const eastSorted = sortBySlot(east);
  const westSorted = sortBySlot(west);
  const useFallback =
    fallback &&
    fallback.length > 0 &&
    eastSorted.length === 0 &&
    westSorted.length === 0;

  if (useFallback) {
    const rows = sortBySlot(fallback);
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((s) => (
          <NhlRound1SeriesPickCard
            key={s.id}
            editionId={editionId}
            series={s}
            initialPickedTeamId={round1PickBySeriesId[s.id] ?? null}
            picksLocked={picksLocked}
            isAuthenticated={isAuthenticated}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <h3 className="text-center text-sm font-semibold uppercase tracking-widest text-blue-200/90">
          Eastern Conference · Round 1
        </h3>
        <p className="mt-1 text-center text-xs text-slate-500">
          Choose one series winner per matchup. Picks save as soon as you tap a team (Round 1 only).
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {eastSorted.map((s) => (
            <NhlRound1SeriesPickCard
              key={s.id}
              editionId={editionId}
              series={s}
              initialPickedTeamId={round1PickBySeriesId[s.id] ?? null}
              picksLocked={picksLocked}
              isAuthenticated={isAuthenticated}
            />
          ))}
        </div>
        {eastSorted.length === 0 ? (
          <p className="mt-4 text-center text-sm text-slate-500">No Eastern Round 1 rows are loaded for this edition.</p>
        ) : null}
      </div>
      <div>
        <h3 className="text-center text-sm font-semibold uppercase tracking-widest text-blue-200/90">
          Western Conference · Round 1
        </h3>
        <p className="mt-1 text-center text-xs text-slate-500">
          Choose one series winner per matchup. Picks save as soon as you tap a team (Round 1 only).
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {westSorted.map((s) => (
            <NhlRound1SeriesPickCard
              key={s.id}
              editionId={editionId}
              series={s}
              initialPickedTeamId={round1PickBySeriesId[s.id] ?? null}
              picksLocked={picksLocked}
              isAuthenticated={isAuthenticated}
            />
          ))}
        </div>
        {westSorted.length === 0 ? (
          <p className="mt-4 text-center text-sm text-slate-500">No Western Round 1 rows are loaded for this edition.</p>
        ) : null}
      </div>
    </div>
  );
}
