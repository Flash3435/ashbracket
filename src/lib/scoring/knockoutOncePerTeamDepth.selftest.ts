/**
 * Run: npx tsx src/lib/scoring/knockoutOncePerTeamDepth.selftest.ts
 */
import assert from "node:assert/strict";
import {
  cappedKnockoutAwardKind,
  participantMaximumPredictedDepthForTeam,
} from "./knockoutOncePerTeamDepth";
import { computePoolScores } from "./computePoolScores";
import type { Prediction, Result, ScoringRule } from "../../types/domain";

const now = "2026-07-14T00:00:00.000Z";
const poolId = "pool-depth-0001-0000-0000-000000000001";
const part = "part-depth-0001-0000-0000-000000000001";
const spain = "team-esp-depth-0001-0000-000000000001";
const france = "team-fra-depth-0001-0000-000000000001";

const rules: ScoringRule[] = [
  {
    id: "r-r16",
    poolId,
    predictionKind: "round_of_16",
    bonusKey: null,
    points: 4,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "r-qf",
    poolId,
    predictionKind: "quarterfinalist",
    bonusKey: null,
    points: 8,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "r-sf",
    poolId,
    predictionKind: "semifinalist",
    bonusKey: null,
    points: 16,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "r-fin",
    poolId,
    predictionKind: "finalist",
    bonusKey: null,
    points: 24,
    createdAt: now,
    updatedAt: now,
  },
];

function pred(
  id: string,
  kind: Prediction["predictionKind"],
  teamId: string,
): Prediction {
  return {
    id,
    poolId,
    participantId: part,
    predictionKind: kind,
    teamId,
    tournamentStageId: "stage",
    groupCode: null,
    slotKey: "1",
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  };
}

function res(
  id: string,
  kind: Result["kind"],
  teamId: string,
): Result {
  return {
    id,
    tournamentStageId: "stage",
    kind,
    teamId,
    groupCode: null,
    slotKey: "1",
    valueText: null,
    resolvedAt: now,
    createdAt: now,
  };
}

// Genuine saved picks only raise depth.
assert.equal(
  participantMaximumPredictedDepthForTeam(
    [
      { predictionKind: "round_of_16", teamId: spain },
      { predictionKind: "semifinalist", teamId: spain },
    ],
    spain,
  ),
  "semifinalist",
);

// Non-knockout kinds (group, third-place, bonus) never inflate depth.
assert.equal(
  participantMaximumPredictedDepthForTeam(
    [
      { predictionKind: "round_of_16", teamId: spain },
      { predictionKind: "group_winner", teamId: spain },
      { predictionKind: "third_place_qualifier", teamId: spain },
      { predictionKind: "bonus_pick", teamId: spain },
    ],
    spain,
  ),
  "round_of_16",
);

// Empty / other-team rows ignored.
assert.equal(
  participantMaximumPredictedDepthForTeam(
    [
      { predictionKind: "champion", teamId: "" },
      { predictionKind: "champion", teamId: null },
      { predictionKind: "finalist", teamId: france },
    ],
    spain,
  ),
  null,
);

assert.equal(
  cappedKnockoutAwardKind("finalist", "semifinalist"),
  "semifinalist",
);
assert.equal(cappedKnockoutAwardKind("semifinalist", "finalist"), "semifinalist");

// Official results / feeder "sides" must not inflate predicted depth even if
// someone mistakenly shapes them like picks — computePoolScores only passes
// predictions table rows. Inject deep official results with shallow picks.
{
  const predictions = [
    pred("p-esp-sf", "semifinalist", spain),
    pred("p-fra-fin", "finalist", france),
  ];
  const officialDeep = [
    res("r-esp-r16", "round_of_16", spain),
    res("r-esp-qf", "quarterfinalist", spain),
    res("r-esp-sf", "semifinalist", spain),
    res("r-esp-fin", "finalist", spain),
    // Misleading: France also has official finalist, but participant picked France deeper.
    res("r-fra-sf", "semifinalist", france),
  ];
  const outcome = computePoolScores({
    poolId,
    predictions,
    results: officialDeep,
    scoringRules: rules,
  });
  const esp = outcome.ledgerLines.find((l) => l.resultId === "r-esp-sf");
  assert.ok(esp);
  assert.equal(esp.predictionKind, "semifinalist");
  assert.equal(esp.pointsDelta, 16);
  assert.ok(
    outcome.ledgerLines.every((l) => l.predictionKind !== "finalist"),
    "official finalist result must not unlock finalist points without a Spain finalist pick",
  );
}

// Injecting objects that look like official matchup / promotion rows into the
// depth helper input must not count unless they are knockout prediction kinds
// with the participant's teamId (they are not — match sides use other shapes).
{
  const misleading = [
    { predictionKind: "official_matchup_side", teamId: spain },
    { predictionKind: "feeder_winner", teamId: spain },
    { predictionKind: "bracket_promotion", teamId: spain },
    { predictionKind: "auto_carried_semifinalist", teamId: spain },
    // Only genuine kind counts:
    { predictionKind: "quarterfinalist", teamId: spain },
  ];
  assert.equal(
    participantMaximumPredictedDepthForTeam(misleading, spain),
    "quarterfinalist",
  );
}

// Duplicate saved progressive picks: max depth only, still one award via scoring.
{
  const predictions = [
    pred("p1", "round_of_16", spain),
    pred("p2", "round_of_16", spain),
    pred("p3", "quarterfinalist", spain),
  ];
  assert.equal(
    participantMaximumPredictedDepthForTeam(predictions, spain),
    "quarterfinalist",
  );
  const outcome = computePoolScores({
    poolId,
    predictions,
    results: [
      res("r-esp-r16", "round_of_16", spain),
      res("r-esp-qf", "quarterfinalist", spain),
      res("r-esp-sf", "semifinalist", spain),
      res("r-esp-fin", "finalist", spain),
    ],
    scoringRules: rules,
  });
  assert.equal(outcome.ledgerLines.length, 1);
  assert.equal(outcome.ledgerLines[0]?.predictionKind, "quarterfinalist");
  assert.equal(outcome.ledgerLines[0]?.pointsDelta, 8);
}

console.log("knockoutOncePerTeamDepth.selftest.ts: ok");
