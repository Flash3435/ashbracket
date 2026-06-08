/**
 * Full tournament simulation should yield scoreable result rows.
 * Run: `npx tsx lib/admin/fullTournamentSimulationScoring.selftest.ts`
 */
import assert from "node:assert/strict";
import { groupPublicLeaderboardByPool } from "../leaderboard/publicLeaderboard";
import {
  DEFAULT_WORLD_CUP_GROUP_ADVANCE_EXACT_POINTS,
  DEFAULT_WORLD_CUP_GROUP_ADVANCE_WRONG_SLOT_POINTS,
  DEFAULT_WORLD_CUP_SCORING_RULE_ROWS,
} from "../scoring/worldcupPoolDefaults";
import { computePoolScores } from "../../src/lib/scoring/computePoolScores";
import type { Prediction, Result, ScoringRule, Team } from "../../src/types/domain";
import { computeGroupStandings } from "../tournament/groupStandings";
import { WC2026_GROUP_CODES } from "../tournament/wc2026GroupCodes";
import { buildFullTournamentSimulationPlan } from "./fullTournamentSimulation";

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

const plan = buildFullTournamentSimulationPlan({
  editionCode: "WC2026-SIM-SCORING",
  editionId: "edition-sim-scoring",
  matches,
  results: [],
  teamsById,
  stageIdByCode,
});

assert.equal(plan.preview.blockers.length, 0);

const now = "2026-06-01T00:00:00.000Z";

function buildScoreableResults(): Result[] {
  const results: Result[] = [];

  for (const groupLetter of WC2026_GROUP_CODES) {
    const letter = groupLetter.toUpperCase();
    const groupMatches = plan.preview.matches.filter(
      (match) => match.stageCode === "group" && (match.groupCode ?? "").toUpperCase() === letter,
    );
    const finished = groupMatches.map((match) => ({
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      homeGoals: match.homeGoals,
      awayGoals: match.awayGoals,
    }));
    const teamIds = [1, 2, 3, 4].map((slot) => `team-${letter}${slot}`);
    const standings = computeGroupStandings(teamIds, finished);
    assert(standings && standings.length >= 2);
    results.push({
      id: `res-gw-${letter}`,
      tournamentStageId: stageIdByCode.group,
      kind: "group_winner",
      teamId: standings[0]!.teamId,
      groupCode: letter,
      slotKey: null,
      valueText: null,
      resolvedAt: now,
      createdAt: now,
    });
    results.push({
      id: `res-gr-${letter}`,
      tournamentStageId: stageIdByCode.group,
      kind: "group_runner_up",
      teamId: standings[1]!.teamId,
      groupCode: letter,
      slotKey: null,
      valueText: null,
      resolvedAt: now,
      createdAt: now,
    });
  }

  plan.resultRows.forEach((row, index) => {
    results.push({
      id: `res-manual-${index + 1}`,
      tournamentStageId: row.tournament_stage_id,
      kind: row.kind,
      teamId: row.team_id,
      groupCode: row.group_code,
      slotKey: row.slot_key,
      valueText: null,
      resolvedAt: row.resolved_at,
      createdAt: row.resolved_at,
      source: row.source,
      locked: row.locked,
    });
  });

  const knockoutPreviewByCode = new Map(
    plan.preview.matches
      .filter((match) => match.stageCode !== "group")
      .map((match) => [match.matchCode, match]),
  );

  plan.knockoutMatchRows.forEach((row, index) => {
    const previewMatch = knockoutPreviewByCode.get(row.matchCode);
    assert(previewMatch?.winnerTeamId, `expected knockout winner for ${row.matchCode}`);
    results.push({
      id: `res-ko-${index + 1}`,
      tournamentStageId: stageIdByCode[row.scoringStageCode],
      kind: row.scoringResultKind,
      teamId: previewMatch.winnerTeamId,
      groupCode: null,
      slotKey: row.scoringSlotKey,
      valueText: null,
      resolvedAt: now,
      createdAt: now,
    });
  });

  return results;
}

const results = buildScoreableResults();
assert.equal(results.filter((row) => row.kind === "group_winner").length, 12);
assert.equal(results.filter((row) => row.kind === "group_runner_up").length, 12);
assert.equal(results.filter((row) => row.kind === "third_place_qualifier").length, 8);
assert.equal(results.filter((row) => row.kind === "round_of_32").length, 32);
assert.equal(
  results.filter((row) =>
    ["round_of_16", "quarterfinalist", "semifinalist", "finalist", "champion"].includes(
      row.kind,
    ),
  ).length,
  31,
);

const actualChampion = results.find((row) => row.kind === "champion")!.teamId;
const actualGroupWinnerA = results.find(
  (row) => row.kind === "group_winner" && row.groupCode === "A",
)!.teamId;
const actualThirdA = results.find(
  (row) => row.kind === "third_place_qualifier" && row.teamId === "team-A3",
);

const poolId = "pool-sim-scoring";
const alice = "participant-alice";
const bob = "participant-bob";

const scoringRules: ScoringRule[] = DEFAULT_WORLD_CUP_SCORING_RULE_ROWS.map((row, index) => ({
  id: `rule-${index + 1}`,
  poolId,
  predictionKind: row.predictionKind,
  bonusKey: row.bonusKey,
  points: row.points,
  createdAt: now,
  updatedAt: now,
}));

const predictions: Prediction[] = [
  {
    id: "pred-alice-group-a",
    poolId,
    participantId: alice,
    predictionKind: "group_winner",
    teamId: actualGroupWinnerA,
    tournamentStageId: stageIdByCode.group,
    groupCode: "A",
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "pred-bob-group-a",
    poolId,
    participantId: bob,
    predictionKind: "group_winner",
    teamId: actualGroupWinnerA === "team-A1" ? "team-A2" : "team-A1",
    tournamentStageId: stageIdByCode.group,
    groupCode: "A",
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "pred-alice-third",
    poolId,
    participantId: alice,
    predictionKind: "third_place_qualifier",
    teamId: actualThirdA?.teamId ?? "team-A3",
    tournamentStageId: stageIdByCode.round_of_32,
    groupCode: "A",
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "pred-bob-third",
    poolId,
    participantId: bob,
    predictionKind: "third_place_qualifier",
    teamId: "team-B3",
    tournamentStageId: stageIdByCode.round_of_32,
    groupCode: "B",
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "pred-alice-champion",
    poolId,
    participantId: alice,
    predictionKind: "champion",
    teamId: actualChampion,
    tournamentStageId: stageIdByCode.final,
    groupCode: null,
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "pred-bob-champion",
    poolId,
    participantId: bob,
    predictionKind: "champion",
    teamId: actualChampion === "team-A1" ? "team-B1" : "team-A1",
    tournamentStageId: stageIdByCode.final,
    groupCode: null,
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
];

const scoringOutcome = computePoolScores({
  poolId,
  predictions,
  results,
  scoringRules,
  groupStageScoring: {
    groupStageId: stageIdByCode.group,
    exactPoints: DEFAULT_WORLD_CUP_GROUP_ADVANCE_EXACT_POINTS,
    wrongSlotPoints: DEFAULT_WORLD_CUP_GROUP_ADVANCE_WRONG_SLOT_POINTS,
  },
});

assert(scoringOutcome.ledgerLines.length > 0, "expected non-empty ledger lines");
assert(
  (scoringOutcome.totalsByParticipantId[alice] ?? 0) >
    (scoringOutcome.totalsByParticipantId[bob] ?? 0),
  "expected differing picks to create participant separation",
);
assert(
  (scoringOutcome.totalsByParticipantId[alice] ?? 0) > 0,
  "expected at least one non-zero participant total",
);

const leaderboardSections = groupPublicLeaderboardByPool([
  {
    poolId,
    poolName: "Simulation test pool",
    participantId: alice,
    displayName: "Alice",
    totalPoints: scoringOutcome.totalsByParticipantId[alice] ?? 0,
    rank: 1,
  },
  {
    poolId,
    poolName: "Simulation test pool",
    participantId: bob,
    displayName: "Bob",
    totalPoints: scoringOutcome.totalsByParticipantId[bob] ?? 0,
    rank: 2,
  },
]);

assert.equal(leaderboardSections.length, 1);
assert.equal(leaderboardSections[0]!.rows[0]!.participantId, alice);
assert(
  leaderboardSections[0]!.rows[0]!.totalPoints > leaderboardSections[0]!.rows[1]!.totalPoints,
  "public leaderboard should reflect non-zero separation",
);

console.log("fullTournamentSimulation scoring selftest: ok");
