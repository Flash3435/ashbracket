"use client";

import type { NhlSeriesRow } from "@/lib/nhl/types";
import { NhlFinalSeriesPickCard } from "./NhlFinalSeriesPickCard";

export function NhlFinalRoundsPicks({
  editionId,
  eastCf,
  westCf,
  scf,
  cfPickBySeriesId,
  scfPickBySeriesId,
  picksLocked,
  isAuthenticated,
  round2Complete,
  conferenceFinalsReady,
  stanleyCupFinalReady,
  conferenceFinalsOpen,
  stanleyCupFinalOpen,
}: {
  editionId: string;
  eastCf: NhlSeriesRow | null;
  westCf: NhlSeriesRow | null;
  scf: NhlSeriesRow | null;
  cfPickBySeriesId: Record<string, string>;
  scfPickBySeriesId: Record<string, string>;
  picksLocked: boolean;
  isAuthenticated: boolean;
  round2Complete: boolean;
  conferenceFinalsReady: boolean;
  stanleyCupFinalReady: boolean;
  conferenceFinalsOpen: boolean;
  stanleyCupFinalOpen: boolean;
}) {
  const statusLine = (() => {
    if (!round2Complete) {
      return "Conference Finals and Stanley Cup picks unlock after every Round 2 series has a winner.";
    }
    if (conferenceFinalsOpen && !stanleyCupFinalReady) {
      return "Conference Finals picks are open. Stanley Cup winner pick opens once both conference finalists are known.";
    }
    if (conferenceFinalsOpen && stanleyCupFinalOpen) {
      return "All three final-round picks are open — choose each conference champion and your Stanley Cup winner.";
    }
    if (picksLocked) {
      return "The pick window is closed. Your saved final-round picks are shown below.";
    }
    return "Final-round matchups fill in as earlier rounds complete.";
  })();

  return (
    <div className="space-y-8">
      <p className="max-w-3xl text-sm leading-relaxed text-slate-400">{statusLine}</p>

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-widest text-amber-200/90">
            Conference Finals
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            One pick per conference — 4 points each when correct on the leaderboard.
          </p>
        </div>

        {!conferenceFinalsReady && round2Complete ? (
          <p className="rounded-lg border border-dashed border-amber-500/30 bg-slate-950/40 px-4 py-3 text-sm text-slate-500">
            Waiting for both Conference Final matchups to be set from Round 2 winners.
          </p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          {eastCf ? (
            <NhlFinalSeriesPickCard
              editionId={editionId}
              series={eastCf}
              roundCode="CF"
              initialPickedTeamId={cfPickBySeriesId[eastCf.id] ?? null}
              picksLocked={picksLocked}
              isAuthenticated={isAuthenticated}
              matchupReady={conferenceFinalsReady}
            />
          ) : (
            <PlaceholderCard label="East Conference Final" />
          )}
          {westCf ? (
            <NhlFinalSeriesPickCard
              editionId={editionId}
              series={westCf}
              roundCode="CF"
              initialPickedTeamId={cfPickBySeriesId[westCf.id] ?? null}
              picksLocked={picksLocked}
              isAuthenticated={isAuthenticated}
              matchupReady={conferenceFinalsReady}
            />
          ) : (
            <PlaceholderCard label="West Conference Final" />
          )}
        </div>
      </div>

      <div className="space-y-4 border-t border-slate-700/40 pt-8">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-widest text-yellow-200/90">
            Stanley Cup Final
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            One pick for the champion — 8 points when correct on the leaderboard.
          </p>
        </div>

        {scf ? (
          <div className="max-w-xl">
            <NhlFinalSeriesPickCard
              editionId={editionId}
              series={scf}
              roundCode="SCF"
              initialPickedTeamId={scfPickBySeriesId[scf.id] ?? null}
              picksLocked={picksLocked}
              isAuthenticated={isAuthenticated}
              matchupReady={stanleyCupFinalReady}
            />
          </div>
        ) : (
          <PlaceholderCard label="Stanley Cup Final" />
        )}

        {round2Complete && !stanleyCupFinalReady ? (
          <p className="text-xs text-slate-500">
            Your Cup winner pick stays visible but locked until both conference champions are known.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PlaceholderCard({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-600/50 bg-slate-950/40 px-4 py-8 text-center text-sm text-slate-500">
      {label} slot not configured for this edition.
    </div>
  );
}
