import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import wc from "./wc2026Data.json";

const GROUP_LETTERS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
] as const;

type WcJson = {
  teams: Record<string, string>;
  groups: Record<string, string[]>;
};

const wcData = wc as WcJson;

export type PublicGroupStandingRow = {
  countryCode: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

export type PublicGroupStandingsTable = {
  groupCode: string;
  rows: PublicGroupStandingRow[];
};

function normGroupCode(c: string | null | undefined): string | null {
  if (c == null) return null;
  const t = c.trim().toUpperCase();
  return t.length ? t : null;
}

function normCountryCode(c: string | null | undefined): string {
  return (c ?? "").trim().toUpperCase();
}

/**
 * Sort aligned with `computeGroupStandings` in `groupStandings.ts`:
 * points, goal difference, goals for, then stable tie-break on country code.
 */
function comparePublicStandingRows(
  a: PublicGroupStandingRow,
  b: PublicGroupStandingRow,
): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDifference !== a.goalDifference) {
    return b.goalDifference - a.goalDifference;
  }
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return a.countryCode.localeCompare(b.countryCode);
}

function emptyRow(code: string, name: string): PublicGroupStandingRow {
  return {
    countryCode: code,
    teamName: name,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  };
}

function rosterForGroup(letter: string): PublicGroupStandingRow[] {
  const codes = wcData.groups[letter];
  if (!codes || codes.length === 0) return [];
  return codes.map((code) => {
    const c = code.trim().toUpperCase();
    const name = wcData.teams[c] ?? c;
    return emptyRow(c, name);
  });
}

function isFinishedWithScores(m: TournamentMatchPublicRow): boolean {
  if (m.status !== "finished") return false;
  if (m.home_goals == null || m.away_goals == null) return false;
  if (!normCountryCode(m.home_country_code) || !normCountryCode(m.away_country_code)) {
    return false;
  }
  return true;
}

/**
 * Official group tables for the public tournament page: canonical WC2026 rosters
 * plus stats from finished group-stage matches only (same ordering rules as sync).
 */
export function buildPublicGroupStandingsTables(
  matches: TournamentMatchPublicRow[],
): PublicGroupStandingsTable[] {
  const byLetter = new Map<string, Map<string, PublicGroupStandingRow>>();

  for (const letter of GROUP_LETTERS) {
    const roster = rosterForGroup(letter);
    const map = new Map<string, PublicGroupStandingRow>();
    for (const r of roster) {
      map.set(r.countryCode, { ...r });
    }
    byLetter.set(letter, map);
  }

  for (const m of matches) {
    if (m.stage_code !== "group") continue;
    const g = normGroupCode(m.group_code);
    if (!g || !byLetter.has(g)) continue;
    if (!isFinishedWithScores(m)) continue;

    const homeCode = normCountryCode(m.home_country_code);
    const awayCode = normCountryCode(m.away_country_code);
    const hg = m.home_goals!;
    const ag = m.away_goals!;
    const map = byLetter.get(g)!;

    const home = map.get(homeCode);
    const away = map.get(awayCode);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.goalsFor += hg;
    home.goalsAgainst += ag;
    away.goalsFor += ag;
    away.goalsAgainst += hg;

    if (hg > ag) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (ag > hg) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  const tables: PublicGroupStandingsTable[] = [];
  for (const letter of GROUP_LETTERS) {
    const map = byLetter.get(letter)!;
    const rows = [...map.values()].map((r) => ({
      ...r,
      goalDifference: r.goalsFor - r.goalsAgainst,
    }));
    rows.sort(comparePublicStandingRows);
    tables.push({ groupCode: letter, rows });
  }
  return tables;
}
