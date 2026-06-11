"use client";

import { formatKickoffAmericaEdmonton } from "@/lib/datetime/scheduleDisplay";
import type { MatchGoalRecord } from "@/lib/tournament/matchGoals/types";
import type { MatchGoalsAdminMatch } from "@/lib/tournament/matchGoals/loadMatchGoalsAdminData";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  clearMatchScoreAction,
  deleteMatchGoalAction,
  saveMatchGoalAction,
  saveMatchScoreAction,
} from "../../app/(worldcup)/admin/tournament/matchGoalsActions";

type Props = {
  matches: MatchGoalsAdminMatch[];
  goals: MatchGoalRecord[];
};

type GoalFormState = {
  goalId: string | null;
  playerName: string;
  teamId: string;
  minute: string;
  stoppageMinute: string;
  isOwnGoal: boolean;
};

const emptyGoalForm = (): GoalFormState => ({
  goalId: null,
  playerName: "",
  teamId: "",
  minute: "",
  stoppageMinute: "",
  isOwnGoal: false,
});

function formatMinute(goal: MatchGoalRecord): string {
  if (goal.minute == null) return "—";
  if (goal.stoppageMinute != null && goal.stoppageMinute > 0) {
    return `${goal.minute}+${goal.stoppageMinute}'`;
  }
  return `${goal.minute}'`;
}

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

export function MatchGoalsAdminPanel({ matches, goals }: Props) {
  const [filter, setFilter] = useState("");
  const [selectedMatchId, setSelectedMatchId] = useState(matches[0]?.id ?? "");
  const [homeGoalsInput, setHomeGoalsInput] = useState("");
  const [awayGoalsInput, setAwayGoalsInput] = useState("");
  const [goalForm, setGoalForm] = useState<GoalFormState>(emptyGoalForm);
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
        m.awayTeamName.toLowerCase().includes(q),
    );
  }, [filter, matches]);

  const selectedMatch =
    matches.find((m) => m.id === selectedMatchId) ?? filteredMatches[0] ?? null;

  useEffect(() => {
    if (!selectedMatch) return;
    setHomeGoalsInput(
      selectedMatch.homeGoals != null ? String(selectedMatch.homeGoals) : "",
    );
    setAwayGoalsInput(
      selectedMatch.awayGoals != null ? String(selectedMatch.awayGoals) : "",
    );
  }, [selectedMatch]);

  const matchGoals = useMemo(() => {
    if (!selectedMatch) return [];
    return goals.filter((g) => g.matchId === selectedMatch.id);
  }, [goals, selectedMatch]);

  function selectMatch(match: MatchGoalsAdminMatch) {
    setSelectedMatchId(match.id);
    setHomeGoalsInput(match.homeGoals != null ? String(match.homeGoals) : "");
    setAwayGoalsInput(match.awayGoals != null ? String(match.awayGoals) : "");
    setGoalForm(emptyGoalForm());
    setMessage(null);
    setError(null);
  }

  function handleSaveScore() {
    if (!selectedMatch) return;
    const home = Number(homeGoalsInput);
    const away = Number(awayGoalsInput);
    if (!Number.isInteger(home) || home < 0 || !Number.isInteger(away) || away < 0) {
      setError("Enter non-negative whole numbers for home and away goals.");
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await saveMatchScoreAction({
        matchId: selectedMatch.id,
        homeGoals: home,
        awayGoals: away,
      });
      if (res.ok) {
        setMessage(res.message);
      } else {
        setError(res.error);
      }
    });
  }

  function handleClearScore() {
    if (!selectedMatch) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await clearMatchScoreAction({ matchId: selectedMatch.id });
      if (res.ok) {
        setHomeGoalsInput("");
        setAwayGoalsInput("");
        setMessage(res.message);
      } else {
        setError(res.error);
      }
    });
  }

  function handleEditGoal(goal: MatchGoalRecord) {
    setGoalForm({
      goalId: goal.id,
      playerName: goal.playerName,
      teamId: goal.teamId ?? "",
      minute: goal.minute != null ? String(goal.minute) : "",
      stoppageMinute: goal.stoppageMinute != null ? String(goal.stoppageMinute) : "",
      isOwnGoal: goal.isOwnGoal,
    });
    setError(null);
    setMessage(null);
  }

  function handleSaveGoal() {
    if (!selectedMatch) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await saveMatchGoalAction({
        matchId: selectedMatch.id,
        goalId: goalForm.goalId,
        playerName: goalForm.playerName,
        teamId: goalForm.teamId.trim() || null,
        minute: parseOptionalInt(goalForm.minute),
        stoppageMinute: parseOptionalInt(goalForm.stoppageMinute),
        isOwnGoal: goalForm.isOwnGoal,
      });
      if (res.ok) {
        setGoalForm(emptyGoalForm());
        setMessage(res.message);
      } else {
        setError(res.error);
      }
    });
  }

  function handleDeleteGoal(goalId: string) {
    if (!selectedMatch) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await deleteMatchGoalAction({
        matchId: selectedMatch.id,
        goalId,
      });
      if (res.ok) {
        if (goalForm.goalId === goalId) setGoalForm(emptyGoalForm());
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

  return (
    <div className="space-y-6">
      <div className="ash-surface space-y-3 p-4 text-sm">
        <label className="block space-y-1">
          <span className="font-medium text-ash-text">Filter matches</span>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Match code or team name"
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
              {selectedMatch.homeTeamName} vs {selectedMatch.awayTeamName}
              {" · "}
              Status: {selectedMatch.status}
              {selectedMatch.syncLocked ? " · sync locked" : ""}
            </p>
            <p className="text-ash-muted">
              Current score:{" "}
              {selectedMatch.homeGoals != null && selectedMatch.awayGoals != null
                ? `${selectedMatch.homeGoals}–${selectedMatch.awayGoals}`
                : "—"}
            </p>
          </div>

          <section className="space-y-3">
            <h3 className="font-medium text-ash-text">Final score</h3>
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1 text-sm">
                <span className="text-ash-muted">Home</span>
                <input
                  type="number"
                  min={0}
                  value={homeGoalsInput}
                  onChange={(e) => setHomeGoalsInput(e.target.value)}
                  className="ash-input w-20"
                  disabled={isPending || selectedMatch.syncLocked}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-ash-muted">Away</span>
                <input
                  type="number"
                  min={0}
                  value={awayGoalsInput}
                  onChange={(e) => setAwayGoalsInput(e.target.value)}
                  className="ash-input w-20"
                  disabled={isPending || selectedMatch.syncLocked}
                />
              </label>
              <button
                type="button"
                onClick={handleSaveScore}
                disabled={isPending || selectedMatch.syncLocked}
                className="ash-btn-primary"
              >
                Save score
              </button>
              <button
                type="button"
                onClick={handleClearScore}
                disabled={isPending || selectedMatch.syncLocked}
                className="ash-btn-secondary"
              >
                Clear score
              </button>
            </div>
            {selectedMatch.syncLocked ? (
              <p className="text-xs text-amber-200">
                Score fields are locked on this match. Unlock sync_locked in Supabase to edit here.
              </p>
            ) : null}
          </section>

          <section className="space-y-3">
            <h3 className="font-medium text-ash-text">Goal scorers ({matchGoals.length})</h3>
            {matchGoals.length === 0 ? (
              <p className="text-sm text-ash-muted">No goals recorded for this match yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-ash-border text-ash-muted">
                      <th className="py-2 pr-3 font-medium">Player</th>
                      <th className="py-2 pr-3 font-medium">Team</th>
                      <th className="py-2 pr-3 font-medium">Min</th>
                      <th className="py-2 pr-3 font-medium">OG</th>
                      <th className="py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchGoals.map((g) => {
                      const teamName =
                        g.teamId === selectedMatch.homeTeamId
                          ? selectedMatch.homeTeamName
                          : g.teamId === selectedMatch.awayTeamId
                            ? selectedMatch.awayTeamName
                            : "—";
                      return (
                        <tr key={g.id} className="border-b border-ash-border/50">
                          <td className="py-2 pr-3">{g.playerName}</td>
                          <td className="py-2 pr-3">{teamName}</td>
                          <td className="py-2 pr-3">{formatMinute(g)}</td>
                          <td className="py-2 pr-3">{g.isOwnGoal ? "Yes" : ""}</td>
                          <td className="py-2">
                            <button
                              type="button"
                              className="ash-link mr-3"
                              onClick={() => handleEditGoal(g)}
                              disabled={isPending}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="text-red-300 hover:underline"
                              onClick={() => handleDeleteGoal(g.id)}
                              disabled={isPending}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-3 border-t border-ash-border pt-4">
            <h3 className="font-medium text-ash-text">
              {goalForm.goalId ? "Edit goal" : "Add goal"}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="text-ash-muted">Player name</span>
                <input
                  type="text"
                  value={goalForm.playerName}
                  onChange={(e) =>
                    setGoalForm((f) => ({ ...f, playerName: e.target.value }))
                  }
                  className="ash-input w-full"
                  disabled={isPending}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-ash-muted">Team</span>
                <select
                  value={goalForm.teamId}
                  onChange={(e) => setGoalForm((f) => ({ ...f, teamId: e.target.value }))}
                  className="ash-input w-full"
                  disabled={isPending}
                >
                  <option value="">—</option>
                  {selectedMatch.homeTeamId ? (
                    <option value={selectedMatch.homeTeamId}>
                      {selectedMatch.homeTeamName} (home)
                    </option>
                  ) : null}
                  {selectedMatch.awayTeamId ? (
                    <option value={selectedMatch.awayTeamId}>
                      {selectedMatch.awayTeamName} (away)
                    </option>
                  ) : null}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-ash-muted">Minute (optional)</span>
                <input
                  type="number"
                  min={0}
                  max={130}
                  value={goalForm.minute}
                  onChange={(e) => setGoalForm((f) => ({ ...f, minute: e.target.value }))}
                  className="ash-input w-full"
                  disabled={isPending}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-ash-muted">Stoppage (optional)</span>
                <input
                  type="number"
                  min={0}
                  value={goalForm.stoppageMinute}
                  onChange={(e) =>
                    setGoalForm((f) => ({ ...f, stoppageMinute: e.target.value }))
                  }
                  className="ash-input w-full"
                  disabled={isPending}
                />
              </label>
              <label className="flex items-center gap-2 self-end text-sm">
                <input
                  type="checkbox"
                  checked={goalForm.isOwnGoal}
                  onChange={(e) =>
                    setGoalForm((f) => ({ ...f, isOwnGoal: e.target.checked }))
                  }
                  disabled={isPending}
                />
                <span className="text-ash-muted">Own goal</span>
              </label>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSaveGoal}
                disabled={isPending}
                className="ash-btn-primary"
              >
                {goalForm.goalId ? "Update goal" : "Add goal"}
              </button>
              {goalForm.goalId ? (
                <button
                  type="button"
                  onClick={() => setGoalForm(emptyGoalForm())}
                  disabled={isPending}
                  className="ash-btn-secondary"
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </section>
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

      <p className="text-sm text-ash-muted">
        After saving scores, run{" "}
        <Link href="/admin/tournament" className="ash-link">
          Update standings
        </Link>{" "}
        on the live scores page. Goal scorers are stored separately and do not change match scores
        or pool points automatically.
      </p>
    </div>
  );
}
