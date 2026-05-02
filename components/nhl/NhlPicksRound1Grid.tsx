"use client";

import type { NhlSeriesRow } from "@/lib/nhl/types";
import { useEffect, useState } from "react";
import { NhlRound1SeriesPickCard } from "./NhlRound1SeriesPickCard";

function sortBySlot(rows: NhlSeriesRow[]): NhlSeriesRow[] {
  return [...rows].sort((a, b) => Number(a.slot_index) - Number(b.slot_index));
}

function mergeSliceFromFull(prior: NhlSeriesRow[], mergedFull: NhlSeriesRow[]): NhlSeriesRow[] {
  const byId = new Map(mergedFull.map((r) => [r.id, r]));
  return sortBySlot(prior.map((r) => byId.get(r.id) ?? r));
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
  const [eastRows, setEastRows] = useState(() => sortBySlot(east));
  const [westRows, setWestRows] = useState(() => sortBySlot(west));
  const [fallbackRows, setFallbackRows] = useState<NhlSeriesRow[] | null>(() =>
    fallback && fallback.length > 0 ? sortBySlot(fallback) : null,
  );

  useEffect(() => {
    setEastRows(sortBySlot(east));
    setWestRows(sortBySlot(west));
    setFallbackRows(fallback && fallback.length > 0 ? sortBySlot(fallback) : null);
  }, [east, west, fallback]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/nhl/round1-live-overlay", { cache: "no-store" });
        const j = (await res.json()) as { ok?: boolean; rows?: NhlSeriesRow[] };
        const merged = j.rows;
        if (cancelled || !j?.ok || !Array.isArray(merged)) return;
        setEastRows((prev) => mergeSliceFromFull(prev, merged));
        setWestRows((prev) => mergeSliceFromFull(prev, merged));
        setFallbackRows((prev) => (prev ? mergeSliceFromFull(prev, merged) : null));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editionId]);

  const useFallback =
    fallbackRows &&
    fallbackRows.length > 0 &&
    eastRows.length === 0 &&
    westRows.length === 0;

  if (useFallback) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {fallbackRows.map((s) => (
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
          {eastRows.map((s) => (
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
        {eastRows.length === 0 ? (
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
          {westRows.map((s) => (
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
        {westRows.length === 0 ? (
          <p className="mt-4 text-center text-sm text-slate-500">No Western Round 1 rows are loaded for this edition.</p>
        ) : null}
      </div>
    </div>
  );
}
