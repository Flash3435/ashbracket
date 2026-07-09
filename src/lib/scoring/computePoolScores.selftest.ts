/**
 * Run: npm run test:scoring
 * Small deterministic check for computePoolScores (no DB).
 */
import assert from "node:assert/strict";
import type { Prediction, Result, ScoringRule } from "../../types/domain";
import { encodeKnockoutPickStatusMetadata } from "../../../lib/predictions/knockoutPickStatus";
import { computePoolScores } from "./computePoolScores";

const poolId = "pool-1111-1111-1111-111111111111";
const stageFinal = "stage-final-0001-0000-0000-000000000001";
const stageQf = "stage-qf-0001-0000-0000-000000000001";
const stageGroup = "stage-group-0001-0000-0000-000000000001";
const teamBr = "team-br-0001-0000-0000-000000000001";
const teamAr = "team-ar-0001-0000-0000-000000000001";
const teamMx = "team-mx-0001-0000-0000-000000000001";
const alice = "part-alice-0001-0000-0000-000000000001";
const bob = "part-bob-0001-0000-0000-000000000001";

const now = "2026-01-01T00:00:00.000Z";

const rules: ScoringRule[] = [
  {
    id: "rule-1",
    poolId,
    predictionKind: "champion",
    bonusKey: null,
    points: 25.5,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "rule-2",
    poolId,
    predictionKind: "quarterfinalist",
    bonusKey: null,
    points: 5,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "rule-3",
    poolId,
    predictionKind: "bonus_pick",
    bonusKey: "most_goals",
    points: 50,
    createdAt: now,
    updatedAt: now,
  },
];

const results: Result[] = [
  {
    id: "res-champ",
    tournamentStageId: stageFinal,
    kind: "champion",
    teamId: teamBr,
    groupCode: null,
    slotKey: null,
    valueText: null,
    resolvedAt: now,
    createdAt: now,
  },
  {
    id: "res-qf1",
    tournamentStageId: stageQf,
    kind: "quarterfinalist",
    teamId: teamBr,
    groupCode: null,
    slotKey: "1",
    valueText: null,
    resolvedAt: now,
    createdAt: now,
  },
  {
    id: "res-goals",
    tournamentStageId: stageGroup,
    kind: "bonus_pick",
    teamId: teamMx,
    groupCode: null,
    slotKey: "most_goals",
    valueText: null,
    resolvedAt: now,
    createdAt: now,
  },
  {
    id: "res-gw-a",
    tournamentStageId: stageGroup,
    kind: "group_winner",
    teamId: teamAr,
    groupCode: "A",
    slotKey: null,
    valueText: null,
    resolvedAt: now,
    createdAt: now,
  },
  {
    id: "res-gr-a",
    tournamentStageId: stageGroup,
    kind: "group_runner_up",
    teamId: teamBr,
    groupCode: "A",
    slotKey: null,
    valueText: null,
    resolvedAt: now,
    createdAt: now,
  },
];

const predictions: Prediction[] = [
  {
    id: "pred-alice-champ",
    poolId,
    participantId: alice,
    predictionKind: "champion",
    teamId: teamBr,
    tournamentStageId: stageFinal,
    groupCode: null,
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "pred-bob-champ",
    poolId,
    participantId: bob,
    predictionKind: "champion",
    teamId: teamAr,
    tournamentStageId: stageFinal,
    groupCode: null,
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "pred-alice-qf",
    poolId,
    participantId: alice,
    predictionKind: "quarterfinalist",
    teamId: teamBr,
    tournamentStageId: stageQf,
    groupCode: null,
    slotKey: "1",
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "pred-alice-goals",
    poolId,
    participantId: alice,
    predictionKind: "bonus_pick",
    teamId: teamMx,
    tournamentStageId: stageGroup,
    groupCode: null,
    slotKey: null,
    bonusKey: "most_goals",
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "pred-alice-gw-wrong",
    poolId,
    participantId: alice,
    predictionKind: "group_winner",
    teamId: teamBr,
    tournamentStageId: stageGroup,
    groupCode: "A",
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "pred-bob-gr-exact",
    poolId,
    participantId: bob,
    predictionKind: "group_runner_up",
    teamId: teamBr,
    tournamentStageId: stageGroup,
    groupCode: "A",
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
];

const outcome = computePoolScores({
  poolId,
  predictions,
  results,
  scoringRules: rules,
  groupStageScoring: {
    groupStageId: stageGroup,
    exactPoints: 5,
    wrongSlotPoints: 2.5,
  },
});

assert.deepEqual(outcome.totalsByParticipantId, {
  [alice]: 25.5 + 50 + 2.5,
  [bob]: 5,
});
assert.equal(outcome.ledgerLines.length, 4);

const again = computePoolScores({
  poolId,
  predictions,
  results,
  scoringRules: rules,
  groupStageScoring: {
    groupStageId: stageGroup,
    exactPoints: 5,
    wrongSlotPoints: 2.5,
  },
});
assert.deepEqual(again.ledgerLines, outcome.ledgerLines);

console.log("scoring selftest: ok");

// Third-place qualifiers: set-based match (official slot order does not matter)
const stageR32 = "stage-r32-0001-0000-0000-000000000001";
const teamThirdA = "team-third-a-0001-0000-0000-000000000001";
const teamThirdB = "team-third-b-0001-0000-0000-000000000001";

const thirdRules: ScoringRule[] = [
  {
    id: "rule-tpq",
    poolId,
    predictionKind: "third_place_qualifier",
    bonusKey: null,
    points: 2,
    createdAt: now,
    updatedAt: now,
  },
];

const thirdResults: Result[] = [
  {
    id: "res-tpq-slot3",
    tournamentStageId: stageR32,
    kind: "third_place_qualifier",
    teamId: teamThirdA,
    groupCode: null,
    slotKey: "3",
    valueText: null,
    resolvedAt: now,
    createdAt: now,
  },
  {
    id: "res-tpq-slot1",
    tournamentStageId: stageR32,
    kind: "third_place_qualifier",
    teamId: teamThirdB,
    groupCode: null,
    slotKey: "1",
    valueText: null,
    resolvedAt: now,
    createdAt: now,
  },
];

const thirdPreds: Prediction[] = [
  {
    id: "pred-tpq-user-slot7",
    poolId,
    participantId: alice,
    predictionKind: "third_place_qualifier",
    teamId: teamThirdA,
    tournamentStageId: stageR32,
    groupCode: null,
    slotKey: "7",
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
];

const thirdOutcome = computePoolScores({
  poolId,
  predictions: thirdPreds,
  results: thirdResults,
  scoringRules: thirdRules,
});

assert.equal(thirdOutcome.totalsByParticipantId[alice], 2);
assert.equal(thirdOutcome.ledgerLines.length, 1);
assert.equal(thirdOutcome.ledgerLines[0]?.resultId, "res-tpq-slot3");

console.log("scoring selftest third-place set match: ok");

// Round of 32 pick scores when the team officially advances (via round_of_16 result from R32 win).
const stageR32Pick = "stage-r32-pick-0001-0000-000000000001";
const stageR16Adv = "stage-r16-adv-0001-0000-000000000001";
const teamWinner = "team-winner-0001-0000-000000000001";
const teamLoser = "team-loser-0001-0000-000000000001";
const carol = "part-carol-0001-0000-0000-000000000001";

const r32AdvanceRules: ScoringRule[] = [
  {
    id: "rule-r16",
    poolId,
    predictionKind: "round_of_16",
    bonusKey: null,
    points: 4,
    createdAt: now,
    updatedAt: now,
  },
];

const r32AdvanceResults: Result[] = [
  {
    id: "res-r32-winner-slot",
    tournamentStageId: stageR32Pick,
    kind: "round_of_32",
    teamId: teamWinner,
    groupCode: null,
    slotKey: "7",
    valueText: null,
    resolvedAt: now,
    createdAt: now,
  },
  {
    id: "res-r16-from-r32",
    tournamentStageId: stageR16Adv,
    kind: "round_of_16",
    teamId: teamWinner,
    groupCode: null,
    slotKey: "4",
    valueText: null,
    resolvedAt: now,
    createdAt: now,
  },
];

const r32AdvancePreds: Prediction[] = [
  {
    id: "pred-carol-r32-winner",
    poolId,
    participantId: carol,
    predictionKind: "round_of_32",
    teamId: teamWinner,
    tournamentStageId: stageR32Pick,
    groupCode: null,
    slotKey: "7",
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "pred-carol-r32-loser",
    poolId,
    participantId: carol,
    predictionKind: "round_of_32",
    teamId: teamLoser,
    tournamentStageId: stageR32Pick,
    groupCode: null,
    slotKey: "8",
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
];

const r32AdvanceOutcome = computePoolScores({
  poolId,
  predictions: r32AdvancePreds,
  results: r32AdvanceResults,
  scoringRules: r32AdvanceRules,
});

assert.equal(r32AdvanceOutcome.totalsByParticipantId[carol], 4);
assert.equal(r32AdvanceOutcome.ledgerLines.length, 1);
assert.equal(r32AdvanceOutcome.ledgerLines[0]?.predictionId, "pred-carol-r32-winner");
assert.equal(r32AdvanceOutcome.ledgerLines[0]?.predictionKind, "round_of_16");

// Duplicate sources: existing round_of_32 row + round_of_16 advancement still score once.
const r32AdvanceAgain = computePoolScores({
  poolId,
  predictions: r32AdvancePreds,
  results: r32AdvanceResults,
  scoringRules: r32AdvanceRules,
});
assert.deepEqual(r32AdvanceAgain.ledgerLines, r32AdvanceOutcome.ledgerLines);

console.log("scoring selftest r32 advancement via round_of_16 result: ok");

// --- Knockout carry-forward: score by team advancement, not predicted matchup ---

const teamNed = "team-ned-0001-0000-0000-000000000001";
const teamMar = "team-mar-0001-0000-0000-000000000001";
const teamCan = "team-can-0001-0000-0000-000000000001";
const teamCro = "team-cro-0001-0000-0000-000000000001";
const teamEng = "team-eng-0001-0000-0000-000000000001";
const teamSui = "team-sui-0001-0000-0000-000000000001";
const teamNor = "team-nor-0001-0000-0000-000000000001";
const teamMex = "team-mex-0001-0000-0000-000000000001";
const dave = "part-dave-0001-0000-0000-000000000001";
const arjie = "part-arjie-0001-0000-0000-000000000001";

const stageR32Ko = "stage-r32-ko-0001-0000-000000000001";
const stageR16Ko = "stage-r16-ko-0001-0000-000000000001";
const stageQfKo = "stage-qf-ko-0001-0000-000000000001";
const stageSfKo = "stage-sf-ko-0001-0000-000000000001";

const koCarryRules: ScoringRule[] = [
  {
    id: "rule-ko-r16",
    poolId,
    predictionKind: "round_of_16",
    bonusKey: null,
    points: 4,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "rule-ko-qf",
    poolId,
    predictionKind: "quarterfinalist",
    bonusKey: null,
    points: 8,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "rule-ko-sf",
    poolId,
    predictionKind: "semifinalist",
    bonusKey: null,
    points: 16,
    createdAt: now,
    updatedAt: now,
  },
];

function koPred(
  id: string,
  participantId: string,
  kind: Prediction["predictionKind"],
  teamId: string,
  slotKey: string,
  stageId: string,
  valueText: string | null = null,
): Prediction {
  return {
    id,
    poolId,
    participantId,
    predictionKind: kind,
    teamId,
    tournamentStageId: stageId,
    groupCode: null,
    slotKey,
    bonusKey: null,
    valueText,
    createdAt: now,
    updatedAt: now,
  };
}

function koResult(
  id: string,
  kind: Result["kind"],
  teamId: string,
  slotKey: string,
  stageId: string,
): Result {
  return {
    id,
    tournamentStageId: stageId,
    kind,
    teamId,
    groupCode: null,
    slotKey,
    valueText: null,
    resolvedAt: now,
    createdAt: now,
  };
}

// M75 (R32 slots 5/6, R16 slot 3): Netherlands picked to win M75 over Morocco; official MAR vs POR, MAR wins.
{
  const officialM75 = [
    koResult("res-m75-r32-mar", "round_of_32", teamMar, "5", stageR32Ko),
    koResult("res-m75-r16-mar", "round_of_16", teamMar, "3", stageR16Ko),
  ];
  const preds = [
    koPred("pred-dave-r32-ned-m75", dave, "round_of_32", teamNed, "5", stageR32Ko),
  ];
  const outcome = computePoolScores({
    poolId,
    predictions: preds,
    results: officialM75,
    scoringRules: koCarryRules,
  });
  assert.equal(outcome.totalsByParticipantId[dave] ?? 0, 0);
  assert.equal(
    outcome.ledgerLines.filter((l) => l.participantId === dave).length,
    0,
    "Netherlands R32 winner pick earns no M75 points when NED did not advance",
  );
}

// M73 (R32 slots 1/2, R16 slot 1): Canada picked in R32; Canada wins official M73.
{
  const officialM73 = [
    koResult("res-m73-r32-can", "round_of_32", teamCan, "2", stageR32Ko),
    koResult("res-m73-r16-can", "round_of_16", teamCan, "1", stageR16Ko),
  ];
  const preds = [
    koPred("pred-dave-r32-can-m73", dave, "round_of_32", teamCan, "2", stageR32Ko),
  ];
  const outcome = computePoolScores({
    poolId,
    predictions: preds,
    results: officialM73,
    scoringRules: koCarryRules,
  });
  assert.equal(outcome.totalsByParticipantId[dave], 4);
  assert.equal(outcome.ledgerLines.length, 1);
  assert.equal(outcome.ledgerLines[0]?.predictionId, "pred-dave-r32-can-m73");
  assert.equal(outcome.ledgerLines[0]?.predictionKind, "round_of_16");
}

// Netherlands picked as R16 winner (slot 3) but eliminated in R32 — no R16 points.
{
  const officialNoNed = [
    koResult("res-m75-r32-mar", "round_of_32", teamMar, "5", stageR32Ko),
    koResult("res-m75-r16-mar", "round_of_16", teamMar, "3", stageR16Ko),
  ];
  const preds = [
    koPred("pred-dave-r16-ned", dave, "round_of_16", teamNed, "3", stageR16Ko),
  ];
  const outcome = computePoolScores({
    poolId,
    predictions: preds,
    results: officialNoNed,
    scoringRules: koCarryRules,
  });
  assert.equal(outcome.totalsByParticipantId[dave] ?? 0, 0);
}

// Locked-out R16 Netherlands pick must not score even if a stale path existed.
{
  const outValueText = encodeKnockoutPickStatusMetadata({
    v: 1,
    status: "out",
    reason: "not_in_official_matchup",
    invalidatedAt: now,
  });
  const preds = [
    koPred(
      "pred-dave-r16-ned-out",
      dave,
      "round_of_16",
      teamNed,
      "3",
      stageR16Ko,
      outValueText,
    ),
  ];
  const outcome = computePoolScores({
    poolId,
    predictions: preds,
    results: [koResult("res-m75-r16-mar", "round_of_16", teamMar, "3", stageR16Ko)],
    scoringRules: koCarryRules,
  });
  assert.equal(outcome.totalsByParticipantId[dave] ?? 0, 0);
}

// M80 (R16 slot 8): England picked as R16 winner; official ENG vs CRO, ENG wins — points despite wrong opponent path.
{
  const officialM80 = [
    koResult("res-m80-r16-eng", "round_of_16", teamEng, "8", stageR16Ko),
  ];
  const preds = [
    koPred("pred-dave-r16-eng", dave, "round_of_16", teamEng, "8", stageR16Ko),
    // Participant's bracket story had Switzerland, not Croatia, in this path.
    koPred("pred-dave-r32-sui", dave, "round_of_32", teamSui, "15", stageR32Ko),
    koPred("pred-dave-r32-cro", dave, "round_of_32", teamCro, "16", stageR32Ko),
  ];
  const outcome = computePoolScores({
    poolId,
    predictions: preds,
    results: officialM80,
    scoringRules: koCarryRules,
  });
  assert.equal(outcome.totalsByParticipantId[dave], 4);
  assert.equal(outcome.ledgerLines[0]?.predictionId, "pred-dave-r16-eng");
  assert.equal(outcome.ledgerLines[0]?.resultId, "res-m80-r16-eng");
}

// Missing knockout picks score zero (no teamId rows persisted).
{
  const outcome = computePoolScores({
    poolId,
    predictions: [],
    results: [koResult("res-m73-r16-can", "round_of_16", teamCan, "1", stageR16Ko)],
    scoringRules: koCarryRules,
  });
  assert.deepEqual(outcome.totalsByParticipantId, {});
  assert.equal(outcome.ledgerLines.length, 0);
}

// Saved predictions are scoring input only — recompute is idempotent and does not mutate picks.
{
  const preds = [koPred("pred-dave-r32-can-m73", dave, "round_of_32", teamCan, "2", stageR32Ko)];
  const results = [
    koResult("res-m73-r16-can", "round_of_16", teamCan, "1", stageR16Ko),
  ];
  const first = computePoolScores({
    poolId,
    predictions: preds,
    results,
    scoringRules: koCarryRules,
  });
  const second = computePoolScores({
    poolId,
    predictions: preds,
    results,
    scoringRules: koCarryRules,
  });
  assert.deepEqual(second, first);
  assert.equal(preds[0]?.teamId, teamCan, "predictions unchanged after scoring recompute");
}

// M99 auto-carried Norway (QF slots only, missing semifinalist|3): semifinalist points when Norway wins.
{
  const preds = [
    koPred("pred-arjie-qf-nor", arjie, "quarterfinalist", teamNor, "3", stageR16Ko),
    koPred("pred-arjie-qf-mex", arjie, "quarterfinalist", teamMex, "4", stageR16Ko),
  ];
  const norWinsM99 = [
    koResult("res-nor-qf", "quarterfinalist", teamNor, "3", stageQfKo),
    koResult("res-nor-sf", "semifinalist", teamNor, "3", stageSfKo),
  ];
  const outcome = computePoolScores({
    poolId,
    predictions: preds,
    results: norWinsM99,
    scoringRules: koCarryRules,
  });
  assert.equal(outcome.totalsByParticipantId[arjie], 16);
  assert.equal(outcome.ledgerLines[0]?.predictionKind, "semifinalist");
  assert.equal(outcome.ledgerLines[0]?.pointsDelta, 16);
}

// M99 auto-carried Norway: no semifinalist points when England wins (QF points only).
{
  const preds = [
    koPred("pred-arjie-qf-nor", arjie, "quarterfinalist", teamNor, "3", stageR16Ko),
    koPred("pred-arjie-qf-mex", arjie, "quarterfinalist", teamMex, "4", stageR16Ko),
  ];
  const engWinsM99 = [
    koResult("res-nor-qf", "quarterfinalist", teamNor, "3", stageQfKo),
    koResult("res-eng-sf", "semifinalist", teamEng, "3", stageSfKo),
  ];
  const outcome = computePoolScores({
    poolId,
    predictions: preds,
    results: engWinsM99,
    scoringRules: koCarryRules,
  });
  assert.equal(outcome.totalsByParticipantId[arjie], 8);
  assert.ok(
    outcome.ledgerLines.every((line) => line.predictionKind !== "semifinalist"),
    "Norway earns no semifinalist points when England wins M99",
  );
}

// Saved semifinalist pick overrides auto-carry for scoring (England saved, England wins).
{
  const preds = [
    koPred("pred-arjie-qf-nor", arjie, "quarterfinalist", teamNor, "3", stageR16Ko),
    koPred("pred-arjie-qf-mex", arjie, "quarterfinalist", teamMex, "4", stageR16Ko),
    koPred("pred-arjie-sf-eng", arjie, "semifinalist", teamEng, "3", stageSfKo),
  ];
  const engWinsM99 = [
    koResult("res-nor-qf", "quarterfinalist", teamNor, "3", stageQfKo),
    koResult("res-eng-sf", "semifinalist", teamEng, "3", stageSfKo),
  ];
  const outcome = computePoolScores({
    poolId,
    predictions: preds,
    results: engWinsM99,
    scoringRules: koCarryRules,
  });
  assert.equal(outcome.totalsByParticipantId[arjie], 24);
  assert.ok(
    outcome.ledgerLines.some(
      (line) =>
        line.predictionKind === "semifinalist" &&
        line.predictionId === "pred-arjie-sf-eng",
    ),
    "saved England semifinalist pick scores when England wins",
  );
}

console.log("scoring selftest knockout carry-forward by team: ok");
