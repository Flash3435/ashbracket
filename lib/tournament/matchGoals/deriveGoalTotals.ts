import { normalizePlayerNameForGoals } from "./normalizePlayerName";
import type { MatchGoalRecord, PlayerGoalTotal } from "./types";

export type DerivePlayerGoalTotalsOptions = {
  /** When true, own goals count toward the scorer. Default false. */
  includeOwnGoals?: boolean;
};

/**
 * Count regular (non-own) goals by normalized player name.
 */
export function derivePlayerGoalTotals(
  goals: readonly MatchGoalRecord[],
  options?: DerivePlayerGoalTotalsOptions,
): PlayerGoalTotal[] {
  const includeOwnGoals = options?.includeOwnGoals ?? false;
  const byNorm = new Map<
    string,
    { playerName: string; goals: number; teamIds: Set<string> }
  >();

  for (const g of goals) {
    if (g.isOwnGoal && !includeOwnGoals) continue;
    const normalizedName = normalizePlayerNameForGoals(g.playerName);
    if (!normalizedName) continue;

    let row = byNorm.get(normalizedName);
    if (!row) {
      row = { playerName: g.playerName.trim(), goals: 0, teamIds: new Set() };
      byNorm.set(normalizedName, row);
    }
    row.goals += 1;
    if (g.teamId) row.teamIds.add(g.teamId);
    row.playerName = g.playerName.trim();
  }

  return [...byNorm.entries()]
    .map(([normalizedName, row]) => ({
      playerName: row.playerName,
      normalizedName,
      goals: row.goals,
      teamIds: [...row.teamIds],
    }))
    .sort((a, b) => {
      if (b.goals !== a.goals) return b.goals - a.goals;
      return a.playerName.localeCompare(b.playerName);
    });
}

/**
 * Non-own goals credited to team_id on each goal row (cross-check vs match scores).
 */
export function deriveTeamGoalTotalsFromEvents(
  goals: readonly MatchGoalRecord[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const g of goals) {
    if (g.isOwnGoal || !g.teamId) continue;
    totals.set(g.teamId, (totals.get(g.teamId) ?? 0) + 1);
  }
  return totals;
}

/** Top scorers by regular goals (own goals excluded). */
export function deriveTopScorerLeaderboard(
  goals: readonly MatchGoalRecord[],
): PlayerGoalTotal[] {
  return derivePlayerGoalTotals(goals);
}
