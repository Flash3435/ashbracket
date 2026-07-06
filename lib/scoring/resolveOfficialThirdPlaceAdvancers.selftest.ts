/**
 * Run: npx tsx lib/scoring/resolveOfficialThirdPlaceAdvancers.selftest.ts
 */
import assert from "node:assert/strict";
import type { Result } from "../../src/types/domain";
import {
  resolveOfficialThirdPlaceAdvancers,
  thirdPlaceAdvancersFromR32Fixtures,
} from "./resolveOfficialThirdPlaceAdvancers";
import { computePoolScores } from "../../src/lib/scoring/computePoolScores";
import type { Prediction, ScoringRule } from "../../src/types/domain";

const now = "2026-06-30T12:00:00.000Z";
const stageR32 = "stage-r32-test-0001-0000-0000-000000000001";
const poolId = "pool-test-0001-0000-0000-000000000001";
const alice = "part-alice-0001-0000-0000-000000000001";

const thirdTeams = [
  "team-tpq-1",
  "team-tpq-2",
  "team-tpq-3",
  "team-tpq-4",
  "team-tpq-5",
  "team-tpq-6",
  "team-tpq-7",
  "team-tpq-8",
];

const fixtures = [
  { matchCode: "M74", homeTeamId: "gw-e", awayTeamId: thirdTeams[0] },
  { matchCode: "M77", homeTeamId: "gw-i", awayTeamId: thirdTeams[1] },
  { matchCode: "M79", homeTeamId: "gw-a", awayTeamId: thirdTeams[2] },
  { matchCode: "M80", homeTeamId: "gw-l", awayTeamId: thirdTeams[3] },
  { matchCode: "M81", homeTeamId: "gw-d", awayTeamId: thirdTeams[4] },
  { matchCode: "M82", homeTeamId: "gw-g", awayTeamId: thirdTeams[5] },
  { matchCode: "M85", homeTeamId: "gw-b", awayTeamId: thirdTeams[6] },
  { matchCode: "M87", homeTeamId: "gw-k", awayTeamId: thirdTeams[7] },
];

const fromFixtures = thirdPlaceAdvancersFromR32Fixtures(fixtures);
assert.ok(fromFixtures);
assert.equal(fromFixtures!.length, 8);
assert.deepEqual(
  new Set(fromFixtures!.map((row) => row.teamId)),
  new Set(thirdTeams),
);

const resolution = resolveOfficialThirdPlaceAdvancers({
  results: [],
  roundOf32StageId: stageR32,
  r32Fixtures: fixtures,
});
assert.equal(resolution.settled, true);
assert.equal(resolution.source, "r32_fixtures");
assert.equal(resolution.advancers.length, 8);

const explicitResults: Result[] = thirdTeams.map((teamId, index) => ({
  id: `res-tpq-${index + 1}`,
  tournamentStageId: stageR32,
  kind: "third_place_qualifier",
  teamId,
  groupCode: null,
  slotKey: String(index + 1),
  valueText: null,
  resolvedAt: now,
  createdAt: now,
}));

const explicitResolution = resolveOfficialThirdPlaceAdvancers({
  results: explicitResults,
  roundOf32StageId: stageR32,
  r32Fixtures: fixtures,
});
assert.equal(explicitResolution.source, "explicit_results");

const thirdRules: ScoringRule[] = [
  {
    id: "rule-tpq",
    poolId,
    predictionKind: "third_place_qualifier",
    bonusKey: null,
    points: 4,
    createdAt: now,
    updatedAt: now,
  },
];

const thirdPreds: Prediction[] = [
  ...thirdTeams.slice(0, 5).map((teamId, index) => ({
    id: `pred-tpq-${index + 1}`,
    poolId,
    participantId: alice,
    predictionKind: "third_place_qualifier" as const,
    teamId,
    tournamentStageId: stageR32,
    groupCode: String.fromCharCode(65 + index),
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  })),
  {
    id: "pred-tpq-wrong",
    poolId,
    participantId: alice,
    predictionKind: "third_place_qualifier",
    teamId: "team-not-advancing",
    tournamentStageId: stageR32,
    groupCode: "J",
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
];

const scored = computePoolScores({
  poolId,
  predictions: thirdPreds,
  results: explicitResults,
  scoringRules: thirdRules,
});
assert.equal(scored.ledgerLines.length, 5);
assert.equal(scored.totalsByParticipantId[alice], 20);

const unsettled = resolveOfficialThirdPlaceAdvancers({
  results: [],
  roundOf32StageId: stageR32,
});
assert.equal(unsettled.settled, false);
assert.equal(unsettled.advancers.length, 0);

console.log("resolveOfficialThirdPlaceAdvancers selftest: ok");
