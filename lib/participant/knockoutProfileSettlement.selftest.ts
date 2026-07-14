/**
 * Run: npx tsx lib/participant/knockoutProfileSettlement.selftest.ts
 */
import assert from "node:assert/strict";
import {
  buildKnockoutProfileSettlementContext,
  buildKnockoutResultCounts,
  buildKnockoutTeamAwardMap,
  isAtLeastKnockoutDepth,
  knockoutProgressionRank,
  resolveKnockoutPickOutcome,
} from "./knockoutProfileSettlement";

assert.ok(knockoutProgressionRank("champion") > knockoutProgressionRank("finalist"));
assert.ok(knockoutProgressionRank("finalist") > knockoutProgressionRank("semifinalist"));
assert.equal(isAtLeastKnockoutDepth("semifinalist", "round_of_16"), true);
assert.equal(isAtLeastKnockoutDepth("round_of_16", "semifinalist"), false);
assert.equal(isAtLeastKnockoutDepth(null, "round_of_16"), false);

const teamFra = "team-fra";
const teamEng = "team-eng";
const teamBra = "team-bra";
const teamArg = "team-arg";

const results = [
  { kind: "round_of_16", team_id: teamFra },
  { kind: "quarterfinalist", team_id: teamFra },
  { kind: "semifinalist", team_id: teamFra },
  { kind: "round_of_16", team_id: teamEng },
  { kind: "quarterfinalist", team_id: teamEng },
  { kind: "semifinalist", team_id: teamEng },
  { kind: "round_of_16", team_id: teamBra },
  { kind: "finalist", team_id: "team-esp" },
  { kind: "semifinalist", team_id: "team-esp" },
  { kind: "semifinalist", team_id: teamArg },
  { kind: "quarterfinalist", team_id: teamArg },
  { kind: "round_of_16", team_id: teamArg },
];

const matches = [
  {
    stage_code: "semifinal",
    home_team_id: teamFra,
    away_team_id: "team-esp",
    winner_team_id: "team-esp",
    status: "finished",
  },
  {
    stage_code: "semifinal",
    home_team_id: teamEng,
    away_team_id: teamArg,
    winner_team_id: null,
    status: "scheduled",
  },
  {
    stage_code: "round_of_16",
    home_team_id: teamBra,
    away_team_id: "team-por",
    winner_team_id: "team-por",
    status: "finished",
  },
];

// Pad R32 finished matches for field-complete edge cases in other tests — not needed here.
const context = buildKnockoutProfileSettlementContext({
  results,
  matches,
  picks: [
    { predictionId: "pred-fra-r32", predictionKind: "round_of_32", teamId: teamFra },
    { predictionId: "pred-fra-r16", predictionKind: "round_of_16", teamId: teamFra },
    { predictionId: "pred-fra-sf", predictionKind: "semifinalist", teamId: teamFra },
    { predictionId: "pred-fra-final", predictionKind: "finalist", teamId: teamFra },
    { predictionId: "pred-fra-champ", predictionKind: "champion", teamId: teamFra },
    { predictionId: "pred-eng-r16", predictionKind: "round_of_16", teamId: teamEng },
    { predictionId: "pred-arg-final", predictionKind: "finalist", teamId: teamArg },
    { predictionId: "pred-bra-qf", predictionKind: "quarterfinalist", teamId: teamBra },
  ],
  ledger: [
    {
      predictionId: "pred-fra-r32",
      pointsDelta: 16,
      predictionKind: "semifinalist",
    },
  ],
  kindsWithPositivePoints: [
    "round_of_16",
    "quarterfinalist",
    "semifinalist",
    "finalist",
    "champion",
  ],
});

const resultCounts = buildKnockoutResultCounts(results);

assert.equal(
  resolveKnockoutPickOutcome({
    predictionId: "pred-fra-r32",
    predictionKind: "round_of_32",
    teamId: teamFra,
    hasLedgerOnThisPrediction: true,
    context,
    resultCounts,
  }),
  "awarded",
);

assert.equal(
  resolveKnockoutPickOutcome({
    predictionId: "pred-fra-r16",
    predictionKind: "round_of_16",
    teamId: teamFra,
    hasLedgerOnThisPrediction: false,
    context,
    resultCounts,
  }),
  "satisfied",
);

assert.equal(
  resolveKnockoutPickOutcome({
    predictionId: "pred-fra-sf",
    predictionKind: "semifinalist",
    teamId: teamFra,
    hasLedgerOnThisPrediction: false,
    context,
    resultCounts,
  }),
  "satisfied",
);

assert.equal(
  resolveKnockoutPickOutcome({
    predictionId: "pred-fra-final",
    predictionKind: "finalist",
    teamId: teamFra,
    hasLedgerOnThisPrediction: false,
    context,
    resultCounts,
  }),
  "missed",
  "France lost SF → finalist missed",
);

assert.equal(
  resolveKnockoutPickOutcome({
    predictionId: "pred-fra-champ",
    predictionKind: "champion",
    teamId: teamFra,
    hasLedgerOnThisPrediction: false,
    context,
    resultCounts,
  }),
  "missed",
  "France eliminated → champion missed",
);

assert.equal(
  resolveKnockoutPickOutcome({
    predictionId: "pred-arg-final",
    predictionKind: "finalist",
    teamId: teamArg,
    hasLedgerOnThisPrediction: false,
    context,
    resultCounts,
  }),
  "awaiting",
  "Argentina SF unfinished → finalist awaiting",
);

assert.equal(
  resolveKnockoutPickOutcome({
    predictionId: "pred-bra-qf",
    predictionKind: "quarterfinalist",
    teamId: teamBra,
    hasLedgerOnThisPrediction: false,
    context,
    resultCounts,
  }),
  "missed",
  "Brazil eliminated in R16 → QF missed",
);

// Consistency: reached depth with scoring rule but no award
const broken = buildKnockoutProfileSettlementContext({
  results: [{ kind: "round_of_16", team_id: teamEng }],
  matches: [],
  picks: [
    { predictionId: "pred-eng-r16", predictionKind: "round_of_16", teamId: teamEng },
  ],
  ledger: [],
  kindsWithPositivePoints: ["round_of_16"],
});
assert.equal(
  resolveKnockoutPickOutcome({
    predictionId: "pred-eng-r16",
    predictionKind: "round_of_16",
    teamId: teamEng,
    hasLedgerOnThisPrediction: false,
    context: broken,
    resultCounts: buildKnockoutResultCounts([{ kind: "round_of_16", team_id: teamEng }]),
  }),
  "consistency_error",
);

const awards = buildKnockoutTeamAwardMap({
  picks: [
    { predictionId: "a", predictionKind: "round_of_16", teamId: teamFra },
    { predictionId: "b", predictionKind: "semifinalist", teamId: teamFra },
  ],
  ledger: [
    { predictionId: "a", pointsDelta: 16, predictionKind: "semifinalist" },
  ],
});
assert.equal(awards.get(teamFra)?.representativePredictionId, "a");
assert.equal(awards.get(teamFra)?.points, 16);

console.log("knockoutProfileSettlement selftest: ok");
