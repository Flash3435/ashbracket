"use client";

import { labelNhlStandingsStatus } from "@/lib/nhl/standingsLabels";
import type { NhlStandingsRow } from "@/lib/nhl/types";
import Link from "next/link";
import { useMemo, useState } from "react";

type StandingsView = "overall" | "round2plus";

function sortRows(rows: NhlStandingsRow[], view: StandingsView): NhlStandingsRow[] {
  const copy = [...rows];
  if (view === "overall") {
    copy.sort((a, b) => a.rank - b.rank || a.entry_name.localeCompare(b.entry_name));
    return copy;
  }
  copy.sort(
    (a, b) =>
      a.round2_plus_rank - b.round2_plus_rank || a.entry_name.localeCompare(b.entry_name),
  );
  return copy;
}

export function NhlStandingsLeaderboard({ rows }: { rows: NhlStandingsRow[] }) {
  const [view, setView] = useState<StandingsView>("overall");
  const sorted = useMemo(() => sortRows(rows, view), [rows, view]);

  const anyR2PlusPoints = useMemo(() => rows.some((r) => r.round2_plus_points > 0), [rows]);
  const anyBonus = useMemo(() => rows.some((r) => r.bonus_points > 0), [rows]);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="inline-flex rounded-lg border border-blue-500/25 bg-slate-900/60 p-0.5"
          role="tablist"
          aria-label="Standings view"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "overall"}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
              view === "overall"
                ? "bg-blue-600/90 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => setView("overall")}
          >
            Overall
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "round2plus"}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
              view === "round2plus"
                ? "bg-violet-600/90 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => setView("round2plus")}
          >
            Round 2+
          </button>
        </div>
      </div>

      {view === "overall" ? (
        <p className="text-xs leading-relaxed text-slate-500 sm:text-sm">
          <span className="font-medium text-slate-400">Overall</span> ranks everyone by total
          points across every round. Round 1 credit stays on the board for people who joined early.
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-slate-500 sm:text-sm">
          <span className="font-medium text-slate-400">Round 2+</span> ignores Round 1 points so
          late joiners can compete on later rounds without starting behind on series they never
          picked.
        </p>
      )}

      {!anyR2PlusPoints && view === "round2plus" ? (
        <p className="rounded-lg border border-slate-600/40 bg-slate-950/50 px-3 py-2 text-xs text-slate-400 sm:text-sm">
          No post–Round 1 points yet. This view will move as soon as Round 2, Conference Final, or
          Stanley Cup Final series have recorded winners and matching picks.
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-blue-500/25 bg-slate-950/60 shadow-inner shadow-blue-950/30">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-blue-500/20 bg-slate-900/80">
                <th className="px-3 py-3 font-semibold tracking-wide text-blue-100/90 sm:px-4">
                  {view === "overall" ? "Rank" : "Rank (R2+)"}
                </th>
                <th className="px-3 py-3 font-semibold tracking-wide text-blue-100/90 sm:px-4">
                  Entry
                </th>
                <th className="px-3 py-3 text-right font-semibold tracking-wide text-blue-100/90 sm:px-4">
                  Overall
                </th>
                <th className="px-3 py-3 text-right font-semibold tracking-wide text-blue-100/90 sm:px-4">
                  R1
                </th>
                <th className="px-3 py-3 text-right font-semibold tracking-wide text-blue-100/90 sm:px-4">
                  R2+
                </th>
                <th className="hidden px-3 py-3 text-right font-semibold tracking-wide text-blue-100/90 md:table-cell md:px-4">
                  R2
                </th>
                <th className="hidden px-3 py-3 text-right font-semibold tracking-wide text-blue-100/90 lg:table-cell lg:px-4">
                  CF
                </th>
                <th className="hidden px-3 py-3 text-right font-semibold tracking-wide text-blue-100/90 lg:table-cell lg:px-4">
                  SCF
                </th>
                {anyBonus ? (
                  <th className="px-3 py-3 text-right font-semibold tracking-wide text-blue-100/90 sm:px-4">
                    Bonus
                  </th>
                ) : null}
                <th className="px-3 py-3 text-right font-semibold tracking-wide text-blue-100/90 sm:px-4">
                  {view === "overall" ? "Correct" : "Correct (R2+)"}
                </th>
                <th className="px-3 py-3 font-semibold tracking-wide text-blue-100/90 sm:px-4">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr
                  key={row.user_id}
                  className="border-b border-blue-500/10 bg-slate-950/30 last:border-b-0"
                >
                  <td className="px-3 py-3 tabular-nums text-slate-200 sm:px-4">
                    {view === "overall" ? row.rank : row.round2_plus_rank}
                  </td>
                  <td className="px-3 py-3 font-medium text-ash-text sm:px-4">
                    {row.membership_id ? (
                      <Link
                        href={`/nhl/entry/${row.membership_id}`}
                        className="text-blue-200 underline-offset-2 hover:text-blue-100 hover:underline"
                      >
                        {row.entry_name}
                      </Link>
                    ) : (
                      row.entry_name
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-200 sm:px-4">
                    {row.total_points}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-300 sm:px-4">
                    {row.round1_points}
                  </td>
                  <td
                    className={`px-3 py-3 text-right tabular-nums sm:px-4 ${
                      view === "round2plus"
                        ? "font-semibold text-violet-100/95"
                        : "text-slate-200"
                    }`}
                  >
                    {row.round2_plus_points}
                  </td>
                  <td className="hidden px-3 py-3 text-right tabular-nums text-slate-400 md:table-cell md:px-4">
                    {row.round2_points}
                  </td>
                  <td className="hidden px-3 py-3 text-right tabular-nums text-slate-400 lg:table-cell lg:px-4">
                    {row.conference_final_points}
                  </td>
                  <td className="hidden px-3 py-3 text-right tabular-nums text-slate-400 lg:table-cell lg:px-4">
                    {row.stanley_cup_final_points}
                  </td>
                  {anyBonus ? (
                    <td className="px-3 py-3 text-right tabular-nums text-slate-300 sm:px-4">
                      {row.bonus_points}
                    </td>
                  ) : null}
                  <td className="px-3 py-3 text-right tabular-nums text-slate-200 sm:px-4">
                    {view === "overall" ? row.correct_picks : row.correct_picks_post_round1}
                  </td>
                  <td className="px-3 py-3 text-slate-300 sm:px-4">
                    {labelNhlStandingsStatus(row.status)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-600">
        <span className="font-medium text-slate-500">R2+</span> sums Round 2, Conference Final, and
        Stanley Cup Final points{anyBonus ? " plus bonus" : ""} — the same total used for the Round
        2+ ranking.
      </p>
    </div>
  );
}
