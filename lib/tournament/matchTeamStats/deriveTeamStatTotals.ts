import type {
  MatchForTeamStatAggregation,
  MatchTeamStatRecord,
  TeamStatLeaderRow,
} from "./types";

export type TeamStatTotals = {
  goalsByTeamId: Map<string, number>;
  yellowCardsByTeamId: Map<string, number>;
  redCardsByTeamId: Map<string, number>;
};

function addToMap(map: Map<string, number>, teamId: string, delta: number): void {
  map.set(teamId, (map.get(teamId) ?? 0) + delta);
}

/**
 * Tournament-level team totals.
 * - Goals: from final scores on finished matches (both scores set).
 * - Cards: from manual stat rows (included even when score is not final).
 */
export function deriveTeamStatTotals(input: {
  matches: readonly MatchForTeamStatAggregation[];
  teamStats: readonly MatchTeamStatRecord[];
}): TeamStatTotals {
  const goalsByTeamId = new Map<string, number>();
  const yellowCardsByTeamId = new Map<string, number>();
  const redCardsByTeamId = new Map<string, number>();

  for (const m of input.matches) {
    if (m.homeGoals == null || m.awayGoals == null) continue;
    if (!m.homeTeamId || !m.awayTeamId) continue;
    addToMap(goalsByTeamId, m.homeTeamId, m.homeGoals);
    addToMap(goalsByTeamId, m.awayTeamId, m.awayGoals);
  }

  for (const row of input.teamStats) {
    if (row.yellowCards != null) {
      addToMap(yellowCardsByTeamId, row.teamId, row.yellowCards);
    }
    if (row.redCards != null) {
      addToMap(redCardsByTeamId, row.teamId, row.redCards);
    }
  }

  return { goalsByTeamId, yellowCardsByTeamId, redCardsByTeamId };
}

export function topTeamStatLeaders(
  totals: Map<string, number>,
  limit = 10,
): TeamStatLeaderRow[] {
  return [...totals.entries()]
    .map(([teamId, total]) => ({ teamId, total }))
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return a.teamId.localeCompare(b.teamId);
    })
    .slice(0, limit);
}

/** Goals for one team in one match — derived from final score fields only. */
export function goalsForTeamFromMatch(
  match: MatchForTeamStatAggregation,
  teamId: string,
): number | null {
  if (match.homeGoals == null || match.awayGoals == null) return null;
  if (teamId === match.homeTeamId) return match.homeGoals;
  if (teamId === match.awayTeamId) return match.awayGoals;
  return null;
}
