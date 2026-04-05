/**
 * FIFA-style group table from finished round-robin matches (3 pts win, 1 draw).
 */

export type FinishedGroupMatch = {
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
};

export type GroupStanding = {
  teamId: string;
  played: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
};

function addRow(
  map: Map<string, GroupStanding>,
  teamId: string,
  gf: number,
  ga: number,
  points: number,
) {
  const cur = map.get(teamId) ?? {
    teamId,
    played: 0,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
  };
  cur.played += 1;
  cur.points += points;
  cur.goalsFor += gf;
  cur.goalsAgainst += ga;
  map.set(teamId, cur);
}

/**
 * Returns null until exactly 6 matches are present (full double round-robin for 4 teams).
 */
export function computeGroupStandings(
  teamIds: string[],
  matches: FinishedGroupMatch[],
): GroupStanding[] | null {
  if (matches.length !== 6 || teamIds.length !== 4) return null;

  const idSet = new Set(teamIds);
  for (const m of matches) {
    if (!idSet.has(m.homeTeamId) || !idSet.has(m.awayTeamId)) return null;
  }

  const map = new Map<string, GroupStanding>();

  for (const m of matches) {
    if (m.homeGoals > m.awayGoals) {
      addRow(map, m.homeTeamId, m.homeGoals, m.awayGoals, 3);
      addRow(map, m.awayTeamId, m.awayGoals, m.homeGoals, 0);
    } else if (m.awayGoals > m.homeGoals) {
      addRow(map, m.awayTeamId, m.awayGoals, m.homeGoals, 3);
      addRow(map, m.homeTeamId, m.homeGoals, m.awayGoals, 0);
    } else {
      addRow(map, m.homeTeamId, m.homeGoals, m.awayGoals, 1);
      addRow(map, m.awayTeamId, m.awayGoals, m.homeGoals, 1);
    }
  }

  const rows = [...map.values()];
  if (rows.length !== 4 || rows.some((r) => r.played !== 3)) return null;

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const da = a.goalsFor - a.goalsAgainst;
    const db = b.goalsFor - b.goalsAgainst;
    if (db !== da) return db - da;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.teamId.localeCompare(b.teamId);
  });

  return rows;
}
