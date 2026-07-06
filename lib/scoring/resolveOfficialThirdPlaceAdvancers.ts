import type { Result, Team } from "../../src/types/domain";
import {
  r32SlotKeysForMatchIndex,
  WC2026_R32_MATCH_DEFS,
} from "../bracket/wc2026RoundOf32";
import { computeGroupStandings, type GroupStanding } from "../tournament/groupStandings";
import { WC2026_GROUP_CODES } from "../tournament/wc2026GroupCodes";
import {
  buildThirdPlaceTeamIdByGroupLetterFromTeamIds,
  thirdPlaceGroupLetterByWinnerSlot,
} from "../tournament/worldcup2026ThirdPlaceMapping";

export type ThirdPlaceAdvancer = {
  teamId: string;
  /** 1–8 slot on the round_of_32 stage (stable ordering for `results.slot_key`). */
  slotKey: string;
  groupCode: string | null;
};

export type OfficialThirdPlaceResolution = {
  settled: boolean;
  advancers: ThirdPlaceAdvancer[];
  source: "explicit_results" | "r32_fixtures" | "group_standings" | "none";
};

export type R32FixtureSide = {
  matchCode: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
};

export type GroupStageMatchForThirdPlace = {
  groupCode: string;
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
};

function compareThirdPlaceCandidates(a: GroupStanding, b: GroupStanding): number {
  if (b.points !== a.points) return b.points - a.points;
  const da = a.goalsFor - a.goalsAgainst;
  const db = b.goalsFor - b.goalsAgainst;
  if (db !== da) return db - da;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return a.teamId.localeCompare(b.teamId);
}

function explicitThirdPlaceFromResults(
  results: Result[],
  roundOf32StageId: string,
): ThirdPlaceAdvancer[] {
  const rows: ThirdPlaceAdvancer[] = [];
  const seenTeam = new Set<string>();
  for (const r of results) {
    if (
      r.tournamentStageId !== roundOf32StageId ||
      r.kind !== "third_place_qualifier" ||
      !r.teamId?.trim()
    ) {
      continue;
    }
    const teamId = r.teamId.trim();
    if (seenTeam.has(teamId)) continue;
    seenTeam.add(teamId);
    rows.push({
      teamId,
      slotKey: (r.slotKey ?? String(rows.length + 1)).trim() || String(rows.length + 1),
      groupCode: r.groupCode?.trim().toUpperCase() ?? null,
    });
  }
  rows.sort((a, b) => a.slotKey.localeCompare(b.slotKey, undefined, { numeric: true }));
  return rows;
}

/** Derives the eight third-place advancers from confirmed R32 fixture teams. */
export function thirdPlaceAdvancersFromR32Fixtures(
  fixtures: readonly R32FixtureSide[],
): ThirdPlaceAdvancer[] | null {
  const byCode = new Map(fixtures.map((row) => [row.matchCode.trim().toUpperCase(), row]));
  const advancers: ThirdPlaceAdvancer[] = [];

  for (let matchIndex = 0; matchIndex < WC2026_R32_MATCH_DEFS.length; matchIndex += 1) {
    const def = WC2026_R32_MATCH_DEFS[matchIndex]!;
    const matchCode = `M${def.fifaMatchNo}`;
    const row = byCode.get(matchCode);
    if (!row) continue;

    const { top: topSlotKey, bottom: bottomSlotKey } = r32SlotKeysForMatchIndex(matchIndex);
    const sides: Array<{
      spec: (typeof def)["top"];
      teamId: string | null;
      bracketSlotKey: string;
    }> = [
      { spec: def.top, teamId: row.homeTeamId, bracketSlotKey: topSlotKey },
      { spec: def.bottom, teamId: row.awayTeamId, bracketSlotKey: bottomSlotKey },
    ];

    for (const side of sides) {
      if (side.spec.kind !== "third_routed") continue;
      const teamId = side.teamId?.trim();
      if (!teamId) return null;
      advancers.push({
        teamId,
        slotKey: String(advancers.length + 1),
        groupCode: null,
      });
    }
  }

  if (advancers.length !== 8) return null;
  return advancers;
}

/** Builds insert rows for sync when explicit third-place results are absent. */
export function buildSyncThirdPlaceQualifierInserts(input: {
  editionId: string;
  roundOf32StageId: string;
  results: Result[];
  r32Fixtures: readonly R32FixtureSide[];
  groupMatches: readonly GroupStageMatchForThirdPlace[];
  teams: Team[];
  groupTeamCountryCodesByLetter: Record<string, string[]>;
  resolvedAtIso: string;
  lockedKeys: ReadonlySet<string>;
  resultSlotKey: (
    stageId: string,
    kind: string,
    groupCode: string | null,
    slotKey: string | null,
  ) => string;
}): Array<Record<string, unknown>> {
  const resolution = resolveOfficialThirdPlaceAdvancers({
    results: input.results,
    roundOf32StageId: input.roundOf32StageId,
    r32Fixtures: input.r32Fixtures,
    groupMatches: input.groupMatches,
    teams: input.teams,
    groupTeamCountryCodesByLetter: input.groupTeamCountryCodesByLetter,
  });
  if (!resolution.settled || resolution.source === "explicit_results") {
    return [];
  }

  const rows = buildDerivedThirdPlaceQualifierResultRows({
    editionId: input.editionId,
    roundOf32StageId: input.roundOf32StageId,
    advancers: resolution.advancers,
    resolvedAtIso: input.resolvedAtIso,
    source: "sync",
  });

  return rows.filter((row) => {
    const k = input.resultSlotKey(
      row.tournament_stage_id as string,
      row.kind as string,
      row.group_code as string | null,
      row.slot_key as string | null,
    );
    return !input.lockedKeys.has(k);
  });
}

function thirdPlaceFromGroupStandings(
  groupMatches: readonly GroupStageMatchForThirdPlace[],
  teams: Team[],
  groupTeamCountryCodesByLetter: Record<string, string[]>,
): ThirdPlaceAdvancer[] | null {
  const byGroup = new Map<string, GroupStageMatchForThirdPlace[]>();
  for (const m of groupMatches) {
    const g = m.groupCode.trim().toUpperCase();
    const list = byGroup.get(g) ?? [];
    list.push(m);
    byGroup.set(g, list);
  }

  const thirdCandidates: Array<GroupStanding & { groupCode: string }> = [];
  for (const letter of WC2026_GROUP_CODES) {
    const g = letter.toUpperCase();
    const rows = byGroup.get(g) ?? [];
    if (rows.length !== 6) return null;

    const finished = rows.map((m) => ({
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeGoals: m.homeGoals,
      awayGoals: m.awayGoals,
    }));
    const teamIds = [...new Set(finished.flatMap((x) => [x.homeTeamId, x.awayTeamId]))];
    const standings = computeGroupStandings(teamIds, finished);
    if (!standings || standings.length < 3) return null;
    thirdCandidates.push({ ...standings[2]!, groupCode: g });
  }

  const sorted = [...thirdCandidates].sort(compareThirdPlaceCandidates);
  const topEight = sorted.slice(0, 8);
  const teamIds = topEight.map((row) => row.teamId);
  const byGroupLetter = buildThirdPlaceTeamIdByGroupLetterFromTeamIds(
    teamIds,
    teams,
    groupTeamCountryCodesByLetter,
  );
  if (!byGroupLetter) return null;

  const letters = Object.keys(byGroupLetter).map((k) => k.toUpperCase());
  if (thirdPlaceGroupLetterByWinnerSlot(letters) == null) return null;

  return topEight.map((row, index) => ({
    teamId: row.teamId,
    slotKey: String(index + 1),
    groupCode: row.groupCode,
  }));
}

/**
 * Resolves the eight official best third-place advancers using, in order:
 * 1. Explicit `third_place_qualifier` results on the Round of 32 stage
 * 2. Teams seeded into third-route R32 fixture slots (M73–M88)
 * 3. FIFA-ranked third-place finishers when all twelve groups are complete
 */
export function resolveOfficialThirdPlaceAdvancers(input: {
  results: Result[];
  roundOf32StageId: string;
  r32Fixtures?: readonly R32FixtureSide[];
  groupMatches?: readonly GroupStageMatchForThirdPlace[];
  teams?: Team[];
  groupTeamCountryCodesByLetter?: Record<string, string[]>;
}): OfficialThirdPlaceResolution {
  const explicit = explicitThirdPlaceFromResults(input.results, input.roundOf32StageId);
  if (explicit.length === 8) {
    return { settled: true, advancers: explicit, source: "explicit_results" };
  }

  if (input.r32Fixtures?.length) {
    const fromFixtures = thirdPlaceAdvancersFromR32Fixtures(input.r32Fixtures);
    if (fromFixtures) {
      return { settled: true, advancers: fromFixtures, source: "r32_fixtures" };
    }
  }

  if (
    input.groupMatches?.length &&
    input.teams?.length &&
    input.groupTeamCountryCodesByLetter
  ) {
    const fromStandings = thirdPlaceFromGroupStandings(
      input.groupMatches,
      input.teams,
      input.groupTeamCountryCodesByLetter,
    );
    if (fromStandings) {
      return { settled: true, advancers: fromStandings, source: "group_standings" };
    }
  }

  return { settled: false, advancers: [], source: "none" };
}

export function thirdPlaceAdvancerTeamIds(
  resolution: OfficialThirdPlaceResolution,
): Set<string> {
  return new Set(resolution.advancers.map((row) => row.teamId));
}

/** Builds `results`-shaped rows for derived third-place advancers (not yet in DB). */
export function buildDerivedThirdPlaceQualifierResultRows(input: {
  editionId: string;
  roundOf32StageId: string;
  advancers: ThirdPlaceAdvancer[];
  resolvedAtIso: string;
  source?: "sync" | "derived";
}): Array<Record<string, unknown>> {
  const source = input.source ?? "sync";
  return input.advancers.map((adv) => ({
    edition_id: input.editionId,
    tournament_stage_id: input.roundOf32StageId,
    kind: "third_place_qualifier",
    team_id: adv.teamId,
    group_code: adv.groupCode,
    slot_key: adv.slotKey,
    resolved_at: input.resolvedAtIso,
    source,
    locked: false,
  }));
}

/** Maps R32 DB match rows into fixture sides for third-place derivation. */
export function r32FixturesFromTournamentMatches(
  matches: ReadonlyArray<{
    match_code: string;
    home_team_id: string | null;
    away_team_id: string | null;
    stage_code?: string | null;
  }>,
): R32FixtureSide[] {
  return matches
    .filter((m) => (m.stage_code ?? "round_of_32") === "round_of_32")
    .map((m) => ({
      matchCode: m.match_code,
      homeTeamId: m.home_team_id,
      awayTeamId: m.away_team_id,
    }));
}

/** True when the edition has eight known third-place advancers from any supported source. */
export function areThirdPlaceQualifiersSettled(
  resolution: OfficialThirdPlaceResolution,
): boolean {
  return resolution.settled && resolution.advancers.length === 8;
}
