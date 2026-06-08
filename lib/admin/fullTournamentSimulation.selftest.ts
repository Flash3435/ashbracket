/**
 * Full tournament simulation orchestration checks.
 * Run: `npx tsx lib/admin/fullTournamentSimulation.selftest.ts`
 */
import type { Result, Team } from "../../src/types/domain";
import { buildFullTournamentSimulationPlan } from "./fullTournamentSimulation";
import { WC2026_GROUP_CODES } from "../tournament/wc2026GroupCodes";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function team(groupLetter: string, slot: number): Team {
  const code = `${groupLetter}${slot}`;
  return {
    id: `team-${code}`,
    name: `Team ${code}`,
    countryCode: code,
    fifaCode: code,
    fifaRank: slot,
    fifaRankAsOf: "2026-01-01",
    createdAt: "",
    updatedAt: "",
  };
}

function groupFixtures(teamIds: string[]): Array<{ home: string; away: string }> {
  return [
    { home: teamIds[0]!, away: teamIds[1]! },
    { home: teamIds[2]!, away: teamIds[3]! },
    { home: teamIds[0]!, away: teamIds[2]! },
    { home: teamIds[1]!, away: teamIds[3]! },
    { home: teamIds[0]!, away: teamIds[3]! },
    { home: teamIds[1]!, away: teamIds[2]! },
  ];
}

const teams = WC2026_GROUP_CODES.flatMap((groupLetter) => [
  team(groupLetter.toUpperCase(), 1),
  team(groupLetter.toUpperCase(), 2),
  team(groupLetter.toUpperCase(), 3),
  team(groupLetter.toUpperCase(), 4),
]);
const teamsById = new Map(teams.map((entry) => [entry.id, entry]));

const matches = WC2026_GROUP_CODES.flatMap((groupLetter, groupIndex) => {
  const letter = groupLetter.toUpperCase();
  const teamIds = [1, 2, 3, 4].map((slot) => `team-${letter}${slot}`);
  return groupFixtures(teamIds).map((fixture, fixtureIndex) => ({
    id: `match-${letter}-${fixtureIndex + 1}`,
    matchCode: `WC2026-G-${letter}-${String(fixtureIndex + 1).padStart(2, "0")}`,
    stageCode: "group",
    groupCode: letter,
    kickoffAt: `2026-06-${String(groupIndex + 1).padStart(2, "0")}T1${fixtureIndex}:00:00.000Z`,
    status: "scheduled",
    homeTeamId: fixture.home,
    awayTeamId: fixture.away,
    homeGoals: null,
    awayGoals: null,
    homePenalties: null,
    awayPenalties: null,
    winnerTeamId: null,
    syncLocked: false,
  }));
});

const stageIdByCode = {
  group: "stage-group",
  round_of_32: "stage-r32",
  round_of_16: "stage-r16",
  quarterfinal: "stage-qf",
  semifinal: "stage-sf",
  final: "stage-final",
} as const;

const freshPlan = buildFullTournamentSimulationPlan({
  editionCode: "WC2026-SIM-TEST",
  editionId: "edition-sim-test",
  matches,
  results: [],
  teamsById,
  stageIdByCode,
});

assert(freshPlan.preview.blockers.length === 0, "fresh tournament should not be blocked");
assert(freshPlan.preview.matchCount === 103, "full fresh tournament should simulate 103 matches");
assert(
  freshPlan.preview.stagesIncluded.join(",") ===
    "group,round_of_32,round_of_16,quarterfinal,semifinal,final",
  "preview should include all tournament stages through the final",
);
assert(freshPlan.groupPatches.length === 72, "fresh plan should simulate all 72 group matches");
assert(freshPlan.knockoutPatches.length === 31, "fresh plan should simulate 31 knockout matches");
assert(freshPlan.resultRows.length === 40, "fresh plan should generate 8 thirds + 32 R32 rows");
assert(
  freshPlan.knockoutMatchRows.length === 31,
  "fresh plan should build 31 knockout scaffold matches",
);
assert(
  freshPlan.preview.thirdPlaceAdvancersResolved === 8,
  "fresh plan should resolve eight third-place advancers",
);
assert(Boolean(freshPlan.preview.championTeamName), "fresh plan should resolve a champion");

const lockedResults: Array<
  Pick<
    Result,
    "tournamentStageId" | "kind" | "teamId" | "groupCode" | "slotKey" | "source" | "locked"
  >
> = [
  {
    tournamentStageId: "stage-group",
    kind: "group_winner",
    teamId: "team-A1",
    groupCode: "A",
    slotKey: null,
    source: "manual",
    locked: true,
  },
];

const blockedPlan = buildFullTournamentSimulationPlan({
  editionCode: "WC2026-SIM-TEST",
  editionId: "edition-sim-test",
  matches,
  results: lockedResults,
  teamsById,
  stageIdByCode,
});

assert(
  blockedPlan.preview.blockers.some((line) => line.includes("Locked manual result rows")),
  "locked manual rows should block full simulation",
);

console.log("fullTournamentSimulation selftest: ok");
