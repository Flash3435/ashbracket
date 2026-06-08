import { buildGeneratedSimulationScores } from "./simulationGeneratedScores";
import type { Team, TournamentStage } from "../../src/types/domain";

let failed = 0;

function t(condition: boolean, message: string): void {
  if (!condition) {
    failed += 1;
    console.error("FAIL:", message);
  }
}

function team(id: string, name: string): Team {
  return {
    id,
    name,
    countryCode: name.slice(0, 3).toUpperCase(),
    fifaCode: null,
    fifaRank: null,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  };
}

function stage(code: TournamentStage["code"], label: string): TournamentStage {
  return {
    id: code,
    code,
    label,
    sortOrder: 0,
    startsAt: null,
    endsAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

const teamsById = new Map<string, Team>([
  ["a", team("a", "Argentina")],
  ["b", team("b", "Brazil")],
  ["c", team("c", "Canada")],
  ["d", team("d", "Denmark")],
]);

const stageByCode = {
  group: stage("group", "Group stage"),
  quarterfinal: stage("quarterfinal", "Quarterfinal"),
};

const rows = buildGeneratedSimulationScores({
  matches: [
    {
      id: "2",
      matchCode: "M2",
      stageCode: "quarterfinal",
      groupCode: null,
      kickoffAt: "2026-07-01T20:00:00.000Z",
      status: "finished",
      homeTeamId: "c",
      awayTeamId: "d",
      homeGoals: 1,
      awayGoals: 1,
      homePenalties: 4,
      awayPenalties: 2,
      winnerTeamId: "c",
      lastSyncAt: "2026-07-01T22:00:00.000Z",
    },
    {
      id: "1",
      matchCode: "M1",
      stageCode: "group",
      groupCode: "A",
      kickoffAt: "2026-06-11T18:00:00.000Z",
      status: "finished",
      homeTeamId: "a",
      awayTeamId: "b",
      homeGoals: 2,
      awayGoals: 2,
      homePenalties: null,
      awayPenalties: null,
      winnerTeamId: null,
      lastSyncAt: "2026-06-11T20:00:00.000Z",
    },
    {
      id: "3",
      matchCode: "M3",
      stageCode: "group",
      groupCode: "A",
      kickoffAt: "2026-06-12T18:00:00.000Z",
      status: "scheduled",
      homeTeamId: "a",
      awayTeamId: "c",
      homeGoals: null,
      awayGoals: null,
      homePenalties: null,
      awayPenalties: null,
      winnerTeamId: null,
      lastSyncAt: null,
    },
  ],
  teamsById,
  stageByCode,
});

t(rows.length === 2, "only matches with applied scores should appear");
t(rows[0]?.matchCode === "M1", "rows should sort by kickoff first");
t(rows[0]?.outcomeLabel === "Draw", "group draws should remain draws");
t(
  rows[1]?.outcomeLabel === "Canada on penalties",
  "knockout ties with penalties should show winner on penalties",
);
t(rows[1]?.stageLabel === "Quarterfinal", "stage labels should use resolved labels");

if (failed > 0) {
  process.exit(1);
}

console.log("simulationGeneratedScores.selftest: ok");
