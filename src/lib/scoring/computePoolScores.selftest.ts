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

// Repeated recompute must not increase third-place totals (idempotent replace semantics).
const thirdOutcomeAgain = computePoolScores({
  poolId,
  predictions: thirdPreds,
  results: thirdResults,
  scoringRules: thirdRules,
});
assert.deepEqual(thirdOutcomeAgain.ledgerLines, thirdOutcome.ledgerLines);
assert.equal(thirdOutcomeAgain.totalsByParticipantId[alice], 2);

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

assert.equal(r32AdvanceOutcome.totalsByParticipantId[carol] ?? 0, 0);
assert.equal(
  r32AdvanceOutcome.ledgerLines.length,
  0,
  "R32-only prediction does not unlock round_of_16 points (depth cap)",
);

// With an explicit round_of_16 pick, official R16 advancement scores once.
const r32AndR16Preds: Prediction[] = [
  ...r32AdvancePreds,
  {
    id: "pred-carol-r16-winner",
    poolId,
    participantId: carol,
    predictionKind: "round_of_16",
    teamId: teamWinner,
    tournamentStageId: stageR16Adv,
    groupCode: null,
    slotKey: "4",
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
];
const r32AndR16Outcome = computePoolScores({
  poolId,
  predictions: r32AndR16Preds,
  results: r32AdvanceResults,
  scoringRules: r32AdvanceRules,
});
assert.equal(r32AndR16Outcome.totalsByParticipantId[carol], 4);
assert.equal(r32AndR16Outcome.ledgerLines.length, 1);
assert.equal(r32AndR16Outcome.ledgerLines[0]?.predictionKind, "round_of_16");
// Representative owner is lowest id among team picks (R16 id sorts before R32 id here).
assert.equal(r32AndR16Outcome.ledgerLines[0]?.predictionId, "pred-carol-r16-winner");

// Duplicate sources: existing round_of_32 row + round_of_16 advancement still score once.
const r32AdvanceAgain = computePoolScores({
  poolId,
  predictions: r32AndR16Preds,
  results: r32AdvanceResults,
  scoringRules: r32AdvanceRules,
});
assert.deepEqual(r32AdvanceAgain.ledgerLines, r32AndR16Outcome.ledgerLines);

console.log("scoring selftest r32 advancement via round_of_16 result: ok");

// --- Knockout once-per-team with prediction-depth cap ---

const teamNed = "team-ned-0001-0000-0000-000000000001";
const teamMar = "team-mar-0001-0000-0000-000000000001";
const teamCan = "team-can-0001-0000-0000-000000000001";
const teamCro = "team-cro-0001-0000-0000-000000000001";
const teamEng = "team-eng-0001-0000-0000-000000000001";
const teamSui = "team-sui-0001-0000-0000-000000000001";
const teamNor = "team-nor-0001-0000-0000-000000000001";
const teamMex = "team-mex-0001-0000-0000-000000000001";
const teamEsp = "team-esp-0001-0000-0000-000000000001";
const dave = "part-dave-0001-0000-0000-000000000001";
const arjie = "part-arjie-0001-0000-0000-000000000001";
const wwcd = "part-wwcd-0001-0000-0000-000000000001";

const stageR32Ko = "stage-r32-ko-0001-0000-000000000001";
const stageR16Ko = "stage-r16-ko-0001-0000-000000000001";
const stageQfKo = "stage-qf-ko-0001-0000-000000000001";
const stageSfKo = "stage-sf-ko-0001-0000-000000000001";
const stageFinalKo = "stage-final-ko-0001-0000-000000000001";

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
  {
    id: "rule-ko-finalist",
    poolId,
    predictionKind: "finalist",
    bonusKey: null,
    points: 24,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "rule-ko-champ",
    poolId,
    predictionKind: "champion",
    bonusKey: null,
    points: 32,
    createdAt: now,
    updatedAt: now,
  },
];

function koPred(
  id: string,
  participantId: string,
  kind: Prediction["predictionKind"],
  teamId: string,
  slotKey: string | null,
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
  slotKey: string | null,
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

const spainToFinalResults = [
  koResult("res-esp-r16", "round_of_16", teamEsp, "12", stageR16Ko),
  koResult("res-esp-qf", "quarterfinalist", teamEsp, "5", stageQfKo),
  koResult("res-esp-sf", "semifinalist", teamEsp, "2", stageSfKo),
  koResult("res-esp-finalist", "finalist", teamEsp, "1", stageFinalKo),
];

// 1. Spain predicted through SF; Spain reaches Final → capped at semifinalist 16.
{
  const preds = [
    koPred("pred-wwcd-esp-r16", wwcd, "round_of_16", teamEsp, "12", stageR16Ko),
    koPred("pred-wwcd-esp-qf", wwcd, "quarterfinalist", teamEsp, "5", stageQfKo),
    koPred("pred-wwcd-esp-sf", wwcd, "semifinalist", teamEsp, "2", stageSfKo),
    koPred("pred-wwcd-fra-finalist", wwcd, "finalist", teamEng, "1", stageFinalKo),
  ];
  const outcome = computePoolScores({
    poolId,
    predictions: preds,
    results: spainToFinalResults,
    scoringRules: koCarryRules,
  });
  const espLine = outcome.ledgerLines.find(
    (l) => l.participantId === wwcd && l.resultId === "res-esp-sf",
  );
  assert.ok(espLine, "Spain award uses semifinalist result");
  assert.equal(espLine.predictionKind, "semifinalist");
  assert.equal(espLine.pointsDelta, 16);
  assert.ok(
    outcome.ledgerLines.every(
      (l) => !(l.participantId === wwcd && l.predictionKind === "finalist"),
    ),
    "Spain predicted only through SF must not receive finalist points",
  );
}

// 2. Spain predicted as finalist; Spain reaches Final → finalist 24.
{
  const preds = [
    koPred("pred-a-esp-sf", arjie, "semifinalist", teamEsp, "2", stageSfKo),
    koPred("pred-a-esp-finalist", arjie, "finalist", teamEsp, "1", stageFinalKo),
  ];
  const outcome = computePoolScores({
    poolId,
    predictions: preds,
    results: spainToFinalResults,
    scoringRules: koCarryRules,
  });
  assert.equal(outcome.totalsByParticipantId[arjie], 24);
  assert.equal(outcome.ledgerLines[0]?.predictionKind, "finalist");
  assert.equal(outcome.ledgerLines[0]?.pointsDelta, 24);
}

// 3. Spain predicted as champion; Spain reaches Final (not champion) → finalist 24.
{
  const preds = [
    koPred("pred-d-esp-champ", dave, "champion", teamEsp, null, stageFinalKo),
  ];
  const outcome = computePoolScores({
    poolId,
    predictions: preds,
    results: spainToFinalResults,
    scoringRules: koCarryRules,
  });
  assert.equal(outcome.totalsByParticipantId[dave], 24);
  assert.equal(outcome.ledgerLines[0]?.predictionKind, "finalist");
}

// 4. Spain predicted only through QF; Spain reaches Final → quarterfinalist 8.
{
  const preds = [
    koPred("pred-a-esp-qf-only", arjie, "quarterfinalist", teamEsp, "5", stageQfKo),
  ];
  const outcome = computePoolScores({
    poolId,
    predictions: preds,
    results: spainToFinalResults,
    scoringRules: koCarryRules,
  });
  assert.equal(outcome.totalsByParticipantId[arjie], 8);
  assert.equal(outcome.ledgerLines[0]?.predictionKind, "quarterfinalist");
}

// 5. Team predicted champion and officially becomes champion → champion 32.
{
  const preds = [
    koPred("pred-d-esp-champ2", dave, "champion", teamEsp, null, stageFinalKo),
  ];
  const results = [
    ...spainToFinalResults,
    koResult("res-esp-champ", "champion", teamEsp, null, stageFinalKo),
  ];
  const outcome = computePoolScores({
    poolId,
    predictions: preds,
    results,
    scoringRules: koCarryRules,
  });
  assert.equal(outcome.totalsByParticipantId[dave], 32);
  assert.equal(outcome.ledgerLines[0]?.predictionKind, "champion");
}

// 6. Multiple predictions for one team → max predicted depth; exactly one ledger row.
{
  const preds = [
    koPred("pred-multi-r16", dave, "round_of_16", teamEsp, "12", stageR16Ko),
    koPred("pred-multi-qf", dave, "quarterfinalist", teamEsp, "5", stageQfKo),
    koPred("pred-multi-sf", dave, "semifinalist", teamEsp, "2", stageSfKo),
  ];
  const outcome = computePoolScores({
    poolId,
    predictions: preds,
    results: spainToFinalResults,
    scoringRules: koCarryRules,
  });
  const espLines = outcome.ledgerLines.filter((l) => l.participantId === dave);
  assert.equal(espLines.length, 1);
  assert.equal(espLines[0]?.predictionKind, "semifinalist");
  assert.equal(espLines[0]?.pointsDelta, 16);
}

// 7. Representative owner is earlier prediction id; ownership does not unlock deeper scoring.
{
  const preds = [
    koPred("pred-own-aaa", dave, "round_of_16", teamEsp, "12", stageR16Ko),
    koPred("pred-own-zzz", dave, "semifinalist", teamEsp, "2", stageSfKo),
  ];
  const outcome = computePoolScores({
    poolId,
    predictions: preds,
    results: spainToFinalResults,
    scoringRules: koCarryRules,
  });
  assert.equal(outcome.ledgerLines[0]?.predictionId, "pred-own-aaa");
  assert.equal(outcome.ledgerLines[0]?.predictionKind, "semifinalist");
  assert.equal(outcome.ledgerLines[0]?.pointsDelta, 16);
}

// 8. Locked-out/stale pick still counts toward max predicted depth (locked original-pick policy).
{
  const outValueText = encodeKnockoutPickStatusMetadata({
    v: 1,
    status: "out",
    reason: "not_in_official_matchup",
    invalidatedAt: now,
  });
  const preds = [
    koPred("pred-out-esp-sf", dave, "semifinalist", teamEsp, "2", stageSfKo, outValueText),
  ];
  const outcome = computePoolScores({
    poolId,
    predictions: preds,
    results: spainToFinalResults,
    scoringRules: koCarryRules,
  });
  assert.equal(outcome.totalsByParticipantId[dave], 16);
  assert.equal(outcome.ledgerLines[0]?.predictionKind, "semifinalist");
}

// Locked-out pick for a team that did not advance still scores zero.
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

// M75: Netherlands picked to win M75 over Morocco; official MAR advances — no NED points.
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
}

// M73: Canada R32 + R16 picks; Canada wins — R16 points.
{
  const officialM73 = [
    koResult("res-m73-r32-can", "round_of_32", teamCan, "2", stageR32Ko),
    koResult("res-m73-r16-can", "round_of_16", teamCan, "1", stageR16Ko),
  ];
  const preds = [
    koPred("pred-dave-r32-can-m73", dave, "round_of_32", teamCan, "2", stageR32Ko),
    koPred("pred-dave-r16-can-m73", dave, "round_of_16", teamCan, "1", stageR16Ko),
  ];
  const outcome = computePoolScores({
    poolId,
    predictions: preds,
    results: officialM73,
    scoringRules: koCarryRules,
  });
  assert.equal(outcome.totalsByParticipantId[dave], 4);
  assert.equal(outcome.ledgerLines.length, 1);
  assert.equal(outcome.ledgerLines[0]?.predictionKind, "round_of_16");
}

// Canada R32-only when Canada reaches R16 → no scored kind at predicted depth.
{
  const officialM73 = [
    koResult("res-m73-r32-can", "round_of_32", teamCan, "2", stageR32Ko),
    koResult("res-m73-r16-can", "round_of_16", teamCan, "1", stageR16Ko),
  ];
  const preds = [
    koPred("pred-dave-r32-can-only", dave, "round_of_32", teamCan, "2", stageR32Ko),
  ];
  const outcome = computePoolScores({
    poolId,
    predictions: preds,
    results: officialM73,
    scoringRules: koCarryRules,
  });
  assert.equal(outcome.totalsByParticipantId[dave] ?? 0, 0);
}

// Netherlands picked as R16 winner but eliminated in R32 — no R16 points.
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

// England picked as R16 winner; official ENG advances — points despite wrong opponent path.
{
  const officialM80 = [
    koResult("res-m80-r16-eng", "round_of_16", teamEng, "8", stageR16Ko),
  ];
  const preds = [
    koPred("pred-dave-r16-eng", dave, "round_of_16", teamEng, "8", stageR16Ko),
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

// Missing knockout picks score zero.
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

// 10. Recompute is idempotent and does not mutate picks.
{
  const preds = [
    koPred("pred-dave-r32-can-m73", dave, "round_of_32", teamCan, "2", stageR32Ko),
    koPred("pred-dave-r16-can-m73b", dave, "round_of_16", teamCan, "1", stageR16Ko),
  ];
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

// QF-only Norway when Norway reaches SF → capped at quarterfinalist (no SF unlock).
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
  assert.equal(outcome.totalsByParticipantId[arjie], 8);
  assert.equal(outcome.ledgerLines[0]?.predictionKind, "quarterfinalist");
  assert.equal(outcome.ledgerLines[0]?.pointsDelta, 8);
}

// QF Norway eliminated; QF points only.
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

// Saved semifinalist England pick scores SF when England wins.
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

console.log("scoring selftest knockout prediction-depth cap: ok");
