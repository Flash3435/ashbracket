import type { OfficialMatchScorePatch } from "@/lib/tournament/syncOfficialTournament";
import { computeGroupStandings, type GroupStanding } from "@/lib/tournament/groupStandings";
import { winnerFromMatchScores } from "@/lib/tournament/matchOutcome";
import { WC2026_GROUP_CODES } from "@/lib/tournament/wc2026GroupCodes";
import { resolveWc2026RoundOf32SlotTeamIds } from "@/lib/tournament/worldcup2026ThirdPlaceMapping";
import type { Result, Team, TournamentStageCode } from "../../src/types/domain";
import {
  compareCandidateMatches,
  generateSimulationMatch,
  type SimulationGeneratedMatch,
  type SimulationMatchCandidate,
} from "./simulationResultsGenerator";

type EditableAutomationResultKind =
  | "group_winner"
  | "group_runner_up"
  | "third_place_qualifier"
  | "round_of_32"
  | "round_of_16"
  | "quarterfinalist"
  | "semifinalist"
  | "finalist"
  | "champion";

type SimulationEditionMatch = {
  id: string;
  matchCode: string;
  stageCode: string;
  groupCode: string | null;
  kickoffAt: string | null;
  status: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
  homePenalties: number | null;
  awayPenalties: number | null;
  winnerTeamId: string | null;
  syncLocked: boolean;
};

type SimulationResultRow = Pick<
  Result,
  "tournamentStageId" | "kind" | "teamId" | "groupCode" | "slotKey" | "source" | "locked"
>;

type KnockoutSeedRow = {
  matchCode: string;
  stageCode: Exclude<TournamentStageCode, "group" | "third_place">;
  roundIndex: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeAdvanceFromMatchCode: string | null;
  awayAdvanceFromMatchCode: string | null;
  scoringResultKind: Result["kind"];
  scoringSlotKey: string | null;
  scoringStageCode: Exclude<TournamentStageCode, "group" | "third_place">;
};

export type FullTournamentSimulationResultRow = {
  tournament_stage_id: string;
  kind: Result["kind"];
  team_id: string;
  group_code: string | null;
  slot_key: string | null;
  resolved_at: string;
  source: "manual";
  locked: boolean;
};

export type FullTournamentSimulationKnockoutMatchRow = {
  matchCode: string;
  stageCode: Exclude<TournamentStageCode, "group" | "third_place">;
  roundIndex: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeAdvanceFromMatchCode: string | null;
  awayAdvanceFromMatchCode: string | null;
  scoringResultKind: Result["kind"];
  scoringSlotKey: string | null;
  scoringStageCode: Exclude<TournamentStageCode, "group" | "third_place">;
};

export type FullTournamentSimulationPreviewCore = {
  matchCount: number;
  stagesIncluded: string[];
  groupsResolved: number;
  thirdPlaceAdvancersResolved: number;
  willGenerateRoundOf32: boolean;
  knockoutFullySimulatable: boolean;
  tournamentWillFinish: boolean;
  blockers: string[];
  championTeamId: string | null;
  championTeamName: string | null;
  matches: SimulationGeneratedMatch[];
};

export type FullTournamentSimulationPlan = {
  preview: FullTournamentSimulationPreviewCore;
  groupPatches: OfficialMatchScorePatch[];
  knockoutPatches: OfficialMatchScorePatch[];
  resultRows: FullTournamentSimulationResultRow[];
  knockoutMatchRows: FullTournamentSimulationKnockoutMatchRow[];
};

const KNOCKOUT_STAGE_CODES = [
  "round_of_32",
  "round_of_16",
  "quarterfinal",
  "semifinal",
  "final",
] as const;

const AUTOMATION_RESULT_KINDS = new Set<EditableAutomationResultKind>([
  "group_winner",
  "group_runner_up",
  "third_place_qualifier",
  "round_of_32",
  "round_of_16",
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "champion",
]);

const STAGE_SORT_ORDER: Record<string, number> = {
  group: 0,
  round_of_32: 1,
  round_of_16: 2,
  quarterfinal: 3,
  semifinal: 4,
  third_place: 5,
  final: 6,
};

function stageSortValue(stageCode: string): number {
  return STAGE_SORT_ORDER[stageCode] ?? 99;
}

function compareStandings(a: GroupStanding, b: GroupStanding): number {
  if (b.points !== a.points) return b.points - a.points;
  const aDiff = a.goalsFor - a.goalsAgainst;
  const bDiff = b.goalsFor - b.goalsAgainst;
  if (bDiff !== aDiff) return bDiff - aDiff;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return a.teamId.localeCompare(b.teamId);
}

function summarizeKinds(kinds: string[]): string {
  return [...new Set(kinds)]
    .sort((a, b) => a.localeCompare(b))
    .join(", ");
}

function isMatchFinished(match: SimulationEditionMatch): boolean {
  return (
    match.homeGoals != null &&
    match.awayGoals != null &&
    Boolean(match.homeTeamId) &&
    Boolean(match.awayTeamId)
  );
}

function hasAnyResolvedFields(match: SimulationEditionMatch): boolean {
  return (
    match.homeGoals != null ||
    match.awayGoals != null ||
    match.homePenalties != null ||
    match.awayPenalties != null ||
    match.winnerTeamId != null
  );
}

function simulatedPatch(match: SimulationGeneratedMatch): OfficialMatchScorePatch {
  return {
    matchCode: match.matchCode,
    homeGoals: match.homeGoals,
    awayGoals: match.awayGoals,
    homePenalties: match.homePenalties,
    awayPenalties: match.awayPenalties,
    status: "finished",
  };
}

function pairCode(prefix: string, index: number): string {
  return `WC2026-SIM-${prefix}-${String(index).padStart(2, "0")}`;
}

function buildKnockoutSeedRows(
  slotTeamIdByKey: Readonly<Record<string, string>>,
): FullTournamentSimulationKnockoutMatchRow[] {
  const rows: KnockoutSeedRow[] = [];
  const r32Codes: string[] = [];
  const r16Codes: string[] = [];
  const quarterfinalCodes: string[] = [];
  const semifinalCodes: string[] = [];

  for (let index = 1; index <= 16; index += 1) {
    const matchCode = pairCode("R32", index);
    r32Codes.push(matchCode);
    const topSlot = String(index * 2 - 1);
    const bottomSlot = String(index * 2);
    rows.push({
      matchCode,
      stageCode: "round_of_32",
      roundIndex: index - 1,
      homeTeamId: slotTeamIdByKey[topSlot] ?? null,
      awayTeamId: slotTeamIdByKey[bottomSlot] ?? null,
      homeAdvanceFromMatchCode: null,
      awayAdvanceFromMatchCode: null,
      scoringResultKind: "round_of_16",
      scoringSlotKey: String(index),
      scoringStageCode: "round_of_16",
    });
  }

  for (let index = 1; index <= 8; index += 1) {
    const matchCode = pairCode("R16", index);
    r16Codes.push(matchCode);
    rows.push({
      matchCode,
      stageCode: "round_of_16",
      roundIndex: index - 1,
      homeTeamId: null,
      awayTeamId: null,
      homeAdvanceFromMatchCode: r32Codes[(index - 1) * 2] ?? null,
      awayAdvanceFromMatchCode: r32Codes[(index - 1) * 2 + 1] ?? null,
      scoringResultKind: "quarterfinalist",
      scoringSlotKey: String(index),
      scoringStageCode: "quarterfinal",
    });
  }

  for (let index = 1; index <= 4; index += 1) {
    const matchCode = pairCode("QF", index);
    quarterfinalCodes.push(matchCode);
    rows.push({
      matchCode,
      stageCode: "quarterfinal",
      roundIndex: index - 1,
      homeTeamId: null,
      awayTeamId: null,
      homeAdvanceFromMatchCode: r16Codes[(index - 1) * 2] ?? null,
      awayAdvanceFromMatchCode: r16Codes[(index - 1) * 2 + 1] ?? null,
      scoringResultKind: "semifinalist",
      scoringSlotKey: String(index),
      scoringStageCode: "semifinal",
    });
  }

  for (let index = 1; index <= 2; index += 1) {
    const matchCode = pairCode("SF", index);
    semifinalCodes.push(matchCode);
    rows.push({
      matchCode,
      stageCode: "semifinal",
      roundIndex: index - 1,
      homeTeamId: null,
      awayTeamId: null,
      homeAdvanceFromMatchCode: quarterfinalCodes[(index - 1) * 2] ?? null,
      awayAdvanceFromMatchCode: quarterfinalCodes[(index - 1) * 2 + 1] ?? null,
      scoringResultKind: "finalist",
      scoringSlotKey: String(index),
      scoringStageCode: "final",
    });
  }

  rows.push({
    matchCode: pairCode("FINAL", 1),
    stageCode: "final",
    roundIndex: 0,
    homeTeamId: null,
    awayTeamId: null,
    homeAdvanceFromMatchCode: semifinalCodes[0] ?? null,
    awayAdvanceFromMatchCode: semifinalCodes[1] ?? null,
    scoringResultKind: "champion",
    scoringSlotKey: null,
    scoringStageCode: "final",
  });

  return rows;
}

function existingResultTeamByKey(
  results: SimulationResultRow[],
  kind: Result["kind"],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of results) {
    if (row.kind !== kind || !row.teamId) continue;
    const key = row.slotKey ?? row.groupCode ?? "";
    if (!key) continue;
    out[key] = row.teamId;
  }
  return out;
}

function sameSlotMap(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys.every((key) => (a[key] ?? "") === (b[key] ?? ""));
}

function teamName(teamsById: Map<string, Team>, teamId: string | null): string | null {
  if (!teamId) return null;
  return teamsById.get(teamId)?.name ?? null;
}

function buildCandidate(
  matchCode: string,
  stageCode: string,
  kickoffAt: string | null,
  homeTeamId: string,
  awayTeamId: string,
  teamsById: Map<string, Team>,
  groupCode: string | null = null,
): SimulationMatchCandidate | null {
  const homeTeam = teamsById.get(homeTeamId);
  const awayTeam = teamsById.get(awayTeamId);
  if (!homeTeam || !awayTeam) return null;
  return {
    id: matchCode,
    matchCode,
    stageCode,
    groupCode,
    kickoffAt,
    homeTeamId,
    awayTeamId,
    homeTeamName: homeTeam.name,
    awayTeamName: awayTeam.name,
  };
}

function existingKnockoutWinner(
  match: SimulationEditionMatch,
  homeTeamId: string,
  awayTeamId: string,
): string | null {
  return winnerFromMatchScores({
    homeTeamId,
    awayTeamId,
    homeGoals: match.homeGoals,
    awayGoals: match.awayGoals,
    homePenalties: match.homePenalties,
    awayPenalties: match.awayPenalties,
  });
}

export function buildFullTournamentSimulationPlan(input: {
  editionCode: string;
  editionId: string;
  matches: SimulationEditionMatch[];
  results: SimulationResultRow[];
  teamsById: Map<string, Team>;
  stageIdByCode: Partial<Record<TournamentStageCode, string>>;
}): FullTournamentSimulationPlan {
  const { editionCode, editionId, matches, results, teamsById, stageIdByCode } = input;
  const blockers: string[] = [];

  for (const stageCode of ["group", ...KNOCKOUT_STAGE_CODES] as const) {
    if (!stageIdByCode[stageCode]) {
      blockers.push(`Missing tournament stage "${stageCode}" for this edition.`);
    }
  }

  const lockedRows = results.filter(
    (row) => row.locked === true && AUTOMATION_RESULT_KINDS.has(row.kind as EditableAutomationResultKind),
  );
  if (lockedRows.length > 0) {
    blockers.push(
      `Locked manual result rows exist for ${summarizeKinds(lockedRows.map((row) => row.kind))}. Clear them or use a fresh simulation edition before running a full tournament simulation.`,
    );
  }

  const groupMatches = matches.filter((match) => match.stageCode === "group");
  const remainingGroupMatches: SimulationGeneratedMatch[] = [];
  const groupPreviewByCode = new Map<string, SimulationGeneratedMatch>();

  for (const match of [...groupMatches].sort(compareCandidateMatches)) {
    if (isMatchFinished(match)) {
      if (match.homePenalties != null || match.awayPenalties != null) {
        blockers.push(`Group match ${match.matchCode} has penalties recorded, which is not supported.`);
      }
      continue;
    }

    if (hasAnyResolvedFields(match)) {
      blockers.push(
        `Group match ${match.matchCode} has a partial result saved and cannot be auto-simulated safely.`,
      );
      continue;
    }
    if (match.syncLocked) {
      blockers.push(`Group match ${match.matchCode} is locked and cannot be auto-simulated.`);
      continue;
    }
    if (match.status !== "scheduled") {
      blockers.push(
        `Group match ${match.matchCode} has status "${match.status}" and cannot be auto-simulated safely.`,
      );
      continue;
    }
    if (!match.homeTeamId || !match.awayTeamId) {
      blockers.push(`Group match ${match.matchCode} is missing one or both teams.`);
      continue;
    }

    const candidate = buildCandidate(
      match.matchCode,
      match.stageCode,
      match.kickoffAt,
      match.homeTeamId,
      match.awayTeamId,
      teamsById,
      match.groupCode,
    );
    if (!candidate) {
      blockers.push(`Group match ${match.matchCode} references a team that could not be loaded.`);
      continue;
    }
    const simulated = generateSimulationMatch(candidate, teamsById, {
      seedKey: `full:${editionCode}:${candidate.matchCode}`,
    });
    remainingGroupMatches.push(simulated);
    groupPreviewByCode.set(match.matchCode, simulated);
  }

  const groupWinnerTeamIdByLetter: Record<string, string> = {};
  const groupRunnerUpTeamIdByLetter: Record<string, string> = {};
  const thirdPlaceCandidates: Array<GroupStanding & { groupCode: string }> = [];

  for (const groupLetter of WC2026_GROUP_CODES) {
    const letter = groupLetter.toUpperCase();
    const groupRows = groupMatches.filter(
      (match) => (match.groupCode ?? "").toUpperCase() === letter,
    );
    if (groupRows.length !== 6) {
      blockers.push(`Group ${letter} does not have the expected six scheduled matches.`);
      continue;
    }

    const finished = groupRows.flatMap((match) => {
      const simulated = groupPreviewByCode.get(match.matchCode);
      if (simulated) {
        return [
          {
            homeTeamId: simulated.homeTeamId,
            awayTeamId: simulated.awayTeamId,
            homeGoals: simulated.homeGoals,
            awayGoals: simulated.awayGoals,
          },
        ];
      }
      if (
        match.homeTeamId &&
        match.awayTeamId &&
        match.homeGoals != null &&
        match.awayGoals != null
      ) {
        return [
          {
            homeTeamId: match.homeTeamId,
            awayTeamId: match.awayTeamId,
            homeGoals: match.homeGoals,
            awayGoals: match.awayGoals,
          },
        ];
      }
      return [];
    });

    const teamIds = [
      ...new Set(
        groupRows.flatMap((match) =>
          [match.homeTeamId, match.awayTeamId].filter((teamId): teamId is string => Boolean(teamId)),
        ),
      ),
    ];

    const standings = computeGroupStandings(teamIds, finished);
    if (!standings || standings.length < 3) {
      blockers.push(`Group ${letter} could not be resolved from the current and simulated scores.`);
      continue;
    }
    groupWinnerTeamIdByLetter[letter] = standings[0]!.teamId;
    groupRunnerUpTeamIdByLetter[letter] = standings[1]!.teamId;
    thirdPlaceCandidates.push({ ...standings[2]!, groupCode: letter });
  }

  thirdPlaceCandidates.sort((a, b) => compareStandings(a, b));
  const bestThirds = thirdPlaceCandidates.slice(0, 8);
  if (bestThirds.length !== 8) {
    blockers.push("Could not determine all eight third-place advancers.");
  }

  const thirdPlaceTeamIdByGroupLetter = Object.fromEntries(
    bestThirds.map((standing) => [standing.groupCode, standing.teamId]),
  );

  const roundOf32Resolution = resolveWc2026RoundOf32SlotTeamIds({
    groupWinnerTeamIdByLetter,
    groupRunnerUpTeamIdByLetter,
    thirdPlaceTeamIdByGroupLetter,
  });
  if (!roundOf32Resolution.ok) {
    blockers.push(roundOf32Resolution.error);
  }

  const groupPatches = remainingGroupMatches.map(simulatedPatch);
  const resultRows: FullTournamentSimulationResultRow[] = [];
  const knockoutMatchRows = roundOf32Resolution.ok
    ? buildKnockoutSeedRows(roundOf32Resolution.slotTeamIdByKey)
    : [];

  const expectedThirdBySlot: Record<string, string> = {};
  bestThirds.forEach((standing, index) => {
    const stageId = stageIdByCode.round_of_32;
    if (!stageId) return;
    const slotKey = String(index + 1);
    expectedThirdBySlot[slotKey] = standing.teamId;
    resultRows.push({
      tournament_stage_id: stageId,
      kind: "third_place_qualifier",
      team_id: standing.teamId,
      group_code: null,
      slot_key: slotKey,
      resolved_at: new Date().toISOString(),
      source: "manual",
      locked: false,
    });
  });

  const expectedRoundOf32BySlot: Record<string, string> = {};
  if (roundOf32Resolution.ok) {
    const stageId = stageIdByCode.round_of_32;
    if (stageId) {
      for (let slot = 1; slot <= 32; slot += 1) {
        const slotKey = String(slot);
        const teamId = roundOf32Resolution.slotTeamIdByKey[slotKey];
        if (!teamId) continue;
        expectedRoundOf32BySlot[slotKey] = teamId;
        resultRows.push({
          tournament_stage_id: stageId,
          kind: "round_of_32",
          team_id: teamId,
          group_code: null,
          slot_key: slotKey,
          resolved_at: new Date().toISOString(),
          source: "manual",
          locked: false,
        });
      }
    }
  }

  const willGenerateRoundOf32 =
    !sameSlotMap(existingResultTeamByKey(results, "third_place_qualifier"), expectedThirdBySlot) ||
    !sameSlotMap(existingResultTeamByKey(results, "round_of_32"), expectedRoundOf32BySlot);

  const canonicalKnockoutCodes = new Set(knockoutMatchRows.map((row) => row.matchCode));
  const unknownKnockoutRows = matches.filter(
    (match) =>
      KNOCKOUT_STAGE_CODES.includes(match.stageCode as (typeof KNOCKOUT_STAGE_CODES)[number]) &&
      !canonicalKnockoutCodes.has(match.matchCode),
  );
  if (unknownKnockoutRows.length > 0) {
    blockers.push(
      `Found knockout match rows outside the simulation scaffold (${unknownKnockoutRows[0]!.matchCode}). Use a fresh simulation edition before running a full tournament simulation.`,
    );
  }

  const knockoutPreviewMatches: SimulationGeneratedMatch[] = [];
  const knockoutPatches: OfficialMatchScorePatch[] = [];
  const existingKnockoutByCode = new Map(
    matches
      .filter((match) => canonicalKnockoutCodes.has(match.matchCode))
      .map((match) => [match.matchCode, match]),
  );
  const winnerByMatchCode = new Map<string, string>();

  for (const row of knockoutMatchRows) {
    const derivedHomeTeamId =
      row.homeTeamId ??
      (row.homeAdvanceFromMatchCode ? (winnerByMatchCode.get(row.homeAdvanceFromMatchCode) ?? null) : null);
    const derivedAwayTeamId =
      row.awayTeamId ??
      (row.awayAdvanceFromMatchCode ? (winnerByMatchCode.get(row.awayAdvanceFromMatchCode) ?? null) : null);
    const existing = existingKnockoutByCode.get(row.matchCode);
    const kickoffAt = existing?.kickoffAt ?? null;

    if (!derivedHomeTeamId || !derivedAwayTeamId) {
      blockers.push(`Knockout match ${row.matchCode} could not be populated from earlier winners.`);
      continue;
    }

    if (existing && !isMatchFinished(existing) && hasAnyResolvedFields(existing)) {
      blockers.push(
        `Knockout match ${row.matchCode} has a partial result saved and cannot be auto-simulated safely.`,
      );
      continue;
    }
    if (existing && !isMatchFinished(existing) && existing.status !== "scheduled") {
      blockers.push(
        `Knockout match ${row.matchCode} has status "${existing.status}" and cannot be auto-simulated safely.`,
      );
      continue;
    }
    if (existing?.syncLocked && !isMatchFinished(existing)) {
      blockers.push(`Knockout match ${row.matchCode} is locked and cannot be auto-simulated.`);
      continue;
    }

    if (existing && isMatchFinished(existing)) {
      if (
        existing.homeTeamId !== derivedHomeTeamId ||
        existing.awayTeamId !== derivedAwayTeamId
      ) {
        blockers.push(
          `Finished knockout match ${row.matchCode} no longer matches the currently resolved bracket participants.`,
        );
        continue;
      }
      const winnerTeamId = existingKnockoutWinner(existing, derivedHomeTeamId, derivedAwayTeamId);
      if (!winnerTeamId) {
        blockers.push(`Finished knockout match ${row.matchCode} does not resolve a winner.`);
        continue;
      }
      winnerByMatchCode.set(row.matchCode, winnerTeamId);
      continue;
    }

    const candidate = buildCandidate(
      row.matchCode,
      row.stageCode,
      kickoffAt,
      derivedHomeTeamId,
      derivedAwayTeamId,
      teamsById,
    );
    if (!candidate) {
      blockers.push(`Knockout match ${row.matchCode} references a team that could not be loaded.`);
      continue;
    }
    const simulated = generateSimulationMatch(candidate, teamsById, {
      seedKey: `full:${editionCode}:${candidate.matchCode}`,
    });
    knockoutPreviewMatches.push(simulated);
    knockoutPatches.push(simulatedPatch(simulated));
    if (simulated.winnerTeamId) {
      winnerByMatchCode.set(row.matchCode, simulated.winnerTeamId);
    } else {
      blockers.push(`Knockout match ${row.matchCode} did not produce a winner.`);
    }
  }

  const finalWinner = winnerByMatchCode.get(pairCode("FINAL", 1)) ?? null;
  const previewMatches = [...remainingGroupMatches, ...knockoutPreviewMatches].sort(
    compareCandidateMatches,
  );
  const stagesIncluded = [
    ...new Set(previewMatches.map((match) => match.stageCode)),
  ].sort((a, b) => stageSortValue(a) - stageSortValue(b) || a.localeCompare(b));

  if (previewMatches.length === 0 && blockers.length === 0) {
    blockers.push("This simulation edition already has no remaining unplayed matches.");
  }

  return {
    preview: {
      matchCount: previewMatches.length,
      stagesIncluded,
      groupsResolved: Object.keys(groupWinnerTeamIdByLetter).length,
      thirdPlaceAdvancersResolved: bestThirds.length,
      willGenerateRoundOf32,
      knockoutFullySimulatable: blockers.length === 0,
      tournamentWillFinish: blockers.length === 0 && Boolean(finalWinner),
      blockers,
      championTeamId: finalWinner,
      championTeamName: teamName(teamsById, finalWinner),
      matches: previewMatches,
    },
    groupPatches,
    knockoutPatches,
    resultRows,
    knockoutMatchRows,
  };
}
