"use client";

import { formatKickoffAmericaEdmonton } from "@/lib/datetime/scheduleDisplay";
import type { MatchTeamStatsAdminMatch } from "@/lib/tournament/matchTeamStats/types";
import { statsForMatch } from "@/lib/tournament/matchTeamStats/loadMatchTeamStatsAdminData";
import type { MatchTeamStatRecord } from "@/lib/tournament/matchTeamStats/types";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  clearMatchTeamStatsAction,
  saveMatchTeamStatsAction,
} from "../../app/(worldcup)/admin/tournament/matchTeamStatsActions";

type Props = {
  matches: MatchTeamStatsAdminMatch[];
  teamStats: MatchTeamStatRecord[];
};

function kickoffAdminLabel(iso: string | null | undefined): string {
  const parts = formatKickoffAmericaEdmonton(iso);
  if (parts.singleLineFallback) return parts.singleLineFallback;
  return `${parts.dateLine} · ${parts.timeLine}`;
}

function parseOptionalInt(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : null;
}

function intToInput(value: number | null | undefined): string {
  return value != null ? String(value) : "";
}

export function MatchTeamStatsAdminPanel({ matches, teamStats }: Props) {
  const [filter, setFilter] = useState("");
  const [selectedMatchId, setSelectedMatchId] = useState(matches[0]?.id ?? "");
  const [homeScoreInput, setHomeScoreInput] = useState("");
  const [awayScoreInput, setAwayScoreInput] = useState("");
  const [homeYellowInput, setHomeYellowInput] = useState("");
  const [awayYellowInput, setAwayYellowInput] = useState("");
  const [homeRedInput, setHomeRedInput] = useState("");
  const [awayRedInput, setAwayRedInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredMatches = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return matches;
    return matches.filter(
      (m) =>
        m.matchCode.toLowerCase().includes(q) ||
        m.homeTeamName.toLowerCase().includes(q) ||
        m.awayTeamName.toLowerCase().includes(q) ||
        m.stageCode.toLowerCase().includes(q) ||
        (m.groupCode ?? "").toLowerCase().includes(q),
    );
  }, [filter, matches]);

  const selectedMatch =
    matches.find((m) => m.id === selectedMatchId) ?? filteredMatches[0] ?? null;

  const currentStats = useMemo(() => {
    if (!selectedMatch) return null;
    return statsForMatch(selectedMatch, teamStats);
  }, [selectedMatch, teamStats]);

  useEffect(() => {
    if (!selectedMatch) return;
    setHomeScoreInput(intToInput(selectedMatch.homeGoals));
    setAwayScoreInput(intToInput(selectedMatch.awayGoals));
    const side = statsForMatch(selectedMatch, teamStats);
    setHomeYellowInput(intToInput(side.home.yellowCards));
    setAwayYellowInput(intToInput(side.away.yellowCards));
    setHomeRedInput(intToInput(side.home.redCards));
    setAwayRedInput(intToInput(side.away.redCards));
  }, [selectedMatch, teamStats]);

  function selectMatch(match: MatchTeamStatsAdminMatch) {
    setSelectedMatchId(match.id);
    setMessage(null);
    setError(null);
  }

  function handleSaveAll() {
    if (!selectedMatch) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await saveMatchTeamStatsAction({
        matchId: selectedMatch.id,
        homeGoals: parseOptionalInt(homeScoreInput),
        awayGoals: parseOptionalInt(awayScoreInput),
        homeYellowCards: parseOptionalInt(homeYellowInput),
        awayYellowCards: parseOptionalInt(awayYellowInput),
        homeRedCards: parseOptionalInt(homeRedInput),
        awayRedCards: parseOptionalInt(awayRedInput),
      });
      if (res.ok) setMessage(res.message);
      else setError(res.error);
    });
  }

  function handleClear(clearScore: boolean, clearCards: boolean) {
    if (!selectedMatch) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await clearMatchTeamStatsAction({
        matchId: selectedMatch.id,
        clearScore,
        clearCards,
      });
      if (res.ok) {
        if (clearScore) {
          setHomeScoreInput("");
          setAwayScoreInput("");
        }
        if (clearCards) {
          setHomeYellowInput("");
          setAwayYellowInput("");
          setHomeRedInput("");
          setAwayRedInput("");
        }
        setMessage(res.message);
      } else {
        setError(res.error);
      }
    });
  }

  if (matches.length === 0) {
    return (
      <p className="text-sm text-ash-muted">No tournament matches found for the live edition.</p>
    );
  }

  const derivedHomeGoals = parseOptionalInt(homeScoreInput);
  const derivedAwayGoals = parseOptionalInt(awayScoreInput);

  return (
    <div className="space-y-6">
      <div className="ash-surface space-y-2 p-4 text-sm text-ash-muted">
        <p>
          <span className="font-medium text-ash-text">Final score</span> drives match winners and
          standings.
        </p>
        <p>
          <span className="font-medium text-ash-text">Team card totals</span> are used for bonus/stat
          questions.
        </p>
        <p>
          <span className="font-medium text-ash-text">Team goals</span> are derived from the final
          score (not stored separately).
        </p>
        <p>
          After saving, run{" "}
          <Link href="/admin/tournament" className="ash-link">
            Update standings
          </Link>{" "}
          or fetch/apply scores to refresh leaderboards.
        </p>
      </div>

      <div className="ash-surface space-y-3 p-4 text-sm">
        <label className="block space-y-1">
          <span className="font-medium text-ash-text">Filter matches</span>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Match code, team, group, or stage"
            className="ash-input w-full max-w-md"
          />
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-ash-text">Select match</span>
          <select
            value={selectedMatch?.id ?? ""}
            onChange={(e) => {
              const m = matches.find((row) => row.id === e.target.value);
              if (m) selectMatch(m);
            }}
            className="ash-input w-full max-w-xl"
          >
            {filteredMatches.map((m) => (
              <option key={m.id} value={m.id}>
                {m.matchCode} — {m.homeTeamName} vs {m.awayTeamName}
                {m.homeGoals != null && m.awayGoals != null
                  ? ` (${m.homeGoals}–${m.awayGoals})`
                  : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedMatch ? (
        <div className="ash-surface space-y-6 p-4">
          <div className="space-y-1 text-sm">
            <h2 className="text-base font-bold text-ash-text">{selectedMatch.matchCode}</h2>
            <p className="text-ash-muted">
              {kickoffAdminLabel(selectedMatch.kickoffAt)}
              {" · "}
              Stage: {selectedMatch.stageCode}
              {selectedMatch.groupCode ? ` · Group ${selectedMatch.groupCode}` : ""}
            </p>
            <p className="text-ash-muted">
              {selectedMatch.homeTeamName} vs {selectedMatch.awayTeamName}
              {" · "}
              Status: {selectedMatch.status}
              {selectedMatch.syncLocked ? " · sync locked" : ""}
            </p>
            <p className="text-ash-muted">
              Current final score:{" "}
              {selectedMatch.homeGoals != null && selectedMatch.awayGoals != null
                ? `${selectedMatch.homeGoals}–${selectedMatch.awayGoals}`
                : "—"}
            </p>
            {currentStats ? (
              <p className="text-ash-muted">
                Saved card totals — Home YC/RC:{" "}
                {currentStats.home.yellowCards ?? "—"}/{currentStats.home.redCards ?? "—"} · Away
                YC/RC: {currentStats.away.yellowCards ?? "—"}/{currentStats.away.redCards ?? "—"}
              </p>
            ) : null}
          </div>

          <section className="space-y-3">
            <h3 className="font-medium text-ash-text">Final score</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-ash-muted">{selectedMatch.homeTeamName} (home)</span>
                <input
                  type="number"
                  min={0}
                  value={homeScoreInput}
                  onChange={(e) => setHomeScoreInput(e.target.value)}
                  className="ash-input w-full max-w-[8rem]"
                  disabled={isPending || selectedMatch.syncLocked}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-ash-muted">{selectedMatch.awayTeamName} (away)</span>
                <input
                  type="number"
                  min={0}
                  value={awayScoreInput}
                  onChange={(e) => setAwayScoreInput(e.target.value)}
                  className="ash-input w-full max-w-[8rem]"
                  disabled={isPending || selectedMatch.syncLocked}
                />
              </label>
            </div>
            {derivedHomeGoals != null && derivedAwayGoals != null ? (
              <p className="text-xs text-ash-muted">
                Derived team goals: {selectedMatch.homeTeamName} {derivedHomeGoals},{" "}
                {selectedMatch.awayTeamName} {derivedAwayGoals}
              </p>
            ) : null}
            {selectedMatch.syncLocked ? (
              <p className="text-xs text-amber-200">
                Final score is locked (sync_locked). Card totals can still be saved.
              </p>
            ) : null}
          </section>

          <section className="space-y-3">
            <h3 className="font-medium text-ash-text">Team card totals</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-ash-border text-ash-muted">
                    <th className="py-2 pr-3 font-medium">Team</th>
                    <th className="py-2 pr-3 font-medium">Yellow cards</th>
                    <th className="py-2 font-medium">Red cards</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-ash-border/50">
                    <td className="py-2 pr-3">{selectedMatch.homeTeamName}</td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min={0}
                        value={homeYellowInput}
                        onChange={(e) => setHomeYellowInput(e.target.value)}
                        className="ash-input w-20"
                        disabled={isPending}
                        placeholder="—"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        min={0}
                        value={homeRedInput}
                        onChange={(e) => setHomeRedInput(e.target.value)}
                        className="ash-input w-20"
                        disabled={isPending}
                        placeholder="—"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3">{selectedMatch.awayTeamName}</td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min={0}
                        value={awayYellowInput}
                        onChange={(e) => setAwayYellowInput(e.target.value)}
                        className="ash-input w-20"
                        disabled={isPending}
                        placeholder="—"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        min={0}
                        value={awayRedInput}
                        onChange={(e) => setAwayRedInput(e.target.value)}
                        className="ash-input w-20"
                        disabled={isPending}
                        placeholder="—"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isPending}
              className="ash-btn-primary"
            >
              Save all for this match
            </button>
            <button
              type="button"
              onClick={() => handleClear(true, false)}
              disabled={isPending || selectedMatch.syncLocked}
              className="ash-btn-secondary"
            >
              Clear final score
            </button>
            <button
              type="button"
              onClick={() => handleClear(false, true)}
              disabled={isPending}
              className="ash-btn-secondary"
            >
              Clear card totals
            </button>
            <button
              type="button"
              onClick={() => handleClear(true, true)}
              disabled={isPending || selectedMatch.syncLocked}
              className="ash-btn-secondary"
            >
              Clear score &amp; cards
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className="rounded-md border border-emerald-700/50 bg-emerald-950/25 px-3 py-2 text-sm text-emerald-100">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-700/50 bg-red-950/25 px-3 py-2 text-sm text-red-100">
          {error}
        </p>
      ) : null}
    </div>
  );
}
