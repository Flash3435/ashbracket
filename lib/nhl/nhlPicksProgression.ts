import { buildNhlSeriesStatePresentation } from "./nhlSeriesStateText";
import { NHL_SERIES_WINNER_POINTS_BY_ROUND } from "./scoring";
import type { NhlSeriesRow, NhlTeam } from "./types";

/** Effective series winner: presentation winner when final (includes NHLE overlay on R1). */
export function effectiveSeriesWinnerId(series: NhlSeriesRow): string | null {
  const pres = buildNhlSeriesStatePresentation(series);
  return pres.winnerTeamId ?? series.winner_team_id ?? null;
}

function teamsById(teams: NhlTeam[]): Map<string, NhlTeam> {
  return new Map(teams.map((t) => [t.id, t]));
}

/** Order two team ids by regular-season seed (lower seed number = higher playoff seed). */
export function orderTwoTeamsBySeed(
  teamAId: string,
  teamBId: string,
  teamsByIdMap: Map<string, NhlTeam>,
): { higherTeamId: string; lowerTeamId: string } {
  const sa = teamsByIdMap.get(teamAId)?.seed;
  const sb = teamsByIdMap.get(teamBId)?.seed;
  const na = sa ?? 999;
  const nb = sb ?? 999;
  if (na < nb || (na === nb && teamAId <= teamBId)) {
    return { higherTeamId: teamAId, lowerTeamId: teamBId };
  }
  return { higherTeamId: teamBId, lowerTeamId: teamAId };
}

function r1WinnerBySlot(rows: NhlSeriesRow[], side: "east" | "west", slot: number): string | null {
  const row = rows.find(
    (r) => r.round_code === "R1" && r.side_or_conference === side && r.slot_index === slot,
  );
  return row ? effectiveSeriesWinnerId(row) : null;
}

/**
 * When Round 1 winners are known (from DB and/or overlay), fill Round 2 higher/lower for display.
 * DB may still be catching up; `sync_nhl_r2_slots_from_r1` aligns persisted bracket slots.
 */
export function mergeRound2DisplayFromRound1(rows: NhlSeriesRow[], teams: NhlTeam[]): NhlSeriesRow[] {
  const tmap = teamsById(teams);

  return rows.map((row) => {
    if (row.round_code !== "R2") {
      return row;
    }
    if (row.side_or_conference !== "east" && row.side_or_conference !== "west") {
      return row;
    }
    if (row.higher_seed_team_id && row.lower_seed_team_id) {
      return row;
    }
    const side = row.side_or_conference;
    const s1 = row.slot_index === 1 ? 1 : 3;
    const s2 = row.slot_index === 1 ? 2 : 4;
    const w1 = r1WinnerBySlot(rows, side, s1);
    const w2 = r1WinnerBySlot(rows, side, s2);
    if (!w1 || !w2) {
      return row;
    }
    const { higherTeamId, lowerTeamId } = orderTwoTeamsBySeed(w1, w2, tmap);
    const hi = tmap.get(higherTeamId);
    const lo = tmap.get(lowerTeamId);

    return {
      ...row,
      higher_seed_team_id: higherTeamId,
      lower_seed_team_id: lowerTeamId,
      higher_team_name: hi?.team_name ?? null,
      higher_team_abbr: hi?.abbreviation ?? null,
      higher_team_slug: hi?.team_slug ?? null,
      higher_team_logo_path: hi?.logo_path ?? null,
      lower_team_name: lo?.team_name ?? null,
      lower_team_abbr: lo?.abbreviation ?? null,
      lower_team_slug: lo?.team_slug ?? null,
      lower_team_logo_path: lo?.logo_path ?? null,
    };
  });
}

/** All Round 1 series have two teams set and an effective winner (includes overlay). */
export function isRound1FullyResolvedForProgression(rows: NhlSeriesRow[]): boolean {
  const r1 = rows.filter((r) => r.round_code === "R1");
  if (r1.length === 0) return false;
  for (const s of r1) {
    const hasPair =
      s.higher_seed_team_id &&
      s.lower_seed_team_id &&
      (s.higher_team_abbr || s.higher_team_name) &&
      (s.lower_team_abbr || s.lower_team_name);
    if (!hasPair) return false;
    if (!effectiveSeriesWinnerId(s)) return false;
  }
  return true;
}

export type Round1PickOutcome = "correct" | "incorrect" | "pending" | "no_pick";

export function round1PickOutcome(series: NhlSeriesRow, pickedTeamId: string | null): Round1PickOutcome {
  const win = effectiveSeriesWinnerId(series);
  if (!win) return "pending";
  if (!pickedTeamId) return "no_pick";
  if (pickedTeamId === win) return "correct";
  return "incorrect";
}

export type Round1UserSummary = {
  totalSeries: number;
  resolvedSeries: number;
  pickedSeries: number;
  correctCount: number;
  incorrectCount: number;
  pendingPickCount: number;
  noPickResolvedCount: number;
  /** Points from correct Round 1 picks only (matches standings weight for R1). */
  round1PointsEarned: number;
};

export function buildRound1UserSummary(
  r1Rows: NhlSeriesRow[],
  pickBySeriesId: Record<string, string>,
): Round1UserSummary {
  let resolvedSeries = 0;
  let pickedSeries = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let pendingPickCount = 0;
  let noPickResolvedCount = 0;
  let round1PointsEarned = 0;
  const w = NHL_SERIES_WINNER_POINTS_BY_ROUND.R1;

  for (const s of r1Rows) {
    const hasPair =
      s.higher_seed_team_id &&
      s.lower_seed_team_id &&
      (s.higher_team_abbr || s.higher_team_name) &&
      (s.lower_team_abbr || s.lower_team_name);
    if (!hasPair) continue;
    const win = effectiveSeriesWinnerId(s);
    const pick = pickBySeriesId[s.id] ?? null;
    if (pick) pickedSeries += 1;
    if (!win) {
      if (pick) pendingPickCount += 1;
      continue;
    }
    resolvedSeries += 1;
    if (!pick) {
      noPickResolvedCount += 1;
      continue;
    }
    if (pick === win) {
      correctCount += 1;
      round1PointsEarned += w;
    } else {
      incorrectCount += 1;
    }
  }

  return {
    totalSeries: r1Rows.length,
    resolvedSeries,
    pickedSeries,
    correctCount,
    incorrectCount,
    pendingPickCount,
    noPickResolvedCount,
    round1PointsEarned,
  };
}

export function round2SeriesReadyForPicks(series: NhlSeriesRow): boolean {
  return Boolean(
    series.higher_seed_team_id &&
      series.lower_seed_team_id &&
      (series.higher_team_abbr || series.higher_team_name) &&
      (series.lower_team_abbr || series.lower_team_name),
  );
}
