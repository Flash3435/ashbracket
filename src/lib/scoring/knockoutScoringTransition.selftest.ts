/**
 * FIFA WC 2026 M101 knockout depth transition — unit tests.
 *
 * Cutover: grandfather uncapped once-per-team awards through M100 (max official
 * kind = semifinalist). Post-cutoff increments use prediction-depth caps.
 */
import assert from "node:assert/strict";
import { computePoolScores } from "./computePoolScores";
import {
  FIFA_WC_2026_M101_KNOCKOUT_TRANSITION,
  buildCutoffOfficialTeamFurthestKnockoutKind,
  computeKnockoutTeamAward,
  mergePreservedPreCutoffKnockoutLedger,
  postCutoffTeamIdsFromResults,
  resolveKnockoutScoringTransition,
} from "./knockoutScoringTransition";
import type { Prediction, Result, ScoringRule } from "../../types/domain";

const poolId = "pool-transition";
const stageKo = "stage-ko";
const now = "2026-07-14T00:00:00.000Z";
const teamEsp = "team-esp";
const teamEng = "team-eng";
const teamFra = "team-fra";
const teamBel = "team-bel";
const pSfOnly = "part-sf";
const pFinalist = "part-finalist";
const pChamp = "part-champ";
const pOverAward = "part-over";
const pEnglandSf = "part-eng-sf";
const pEnglandFinal = "part-eng-final";
const pFranceChamp = "part-fra-champ";

const transitional = {
  mode: "grandfathered_cutoff_then_capped_increment" as const,
  cutoffMaxOfficialKind: "semifinalist",
};

const rules: ScoringRule[] = [
  {
    id: "r1",
    poolId,
    predictionKind: "round_of_16",
    bonusKey: null,
    points: 4,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "r2",
    poolId,
    predictionKind: "quarterfinalist",
    bonusKey: null,
    points: 8,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "r3",
    poolId,
    predictionKind: "semifinalist",
    bonusKey: null,
    points: 16,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "r4",
    poolId,
    predictionKind: "finalist",
    bonusKey: null,
    points: 24,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "r5",
    poolId,
    predictionKind: "champion",
    bonusKey: null,
    points: 32,
    createdAt: now,
    updatedAt: now,
  },
];

function pred(
  id: string,
  participantId: string,
  kind: Prediction["predictionKind"],
  teamId: string,
  slotKey: string | null,
): Prediction {
  return {
    id,
    poolId,
    participantId,
    predictionKind: kind,
    teamId,
    tournamentStageId: stageKo,
    groupCode: null,
    slotKey,
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
  slotKey: string | null,
): Result {
  return {
    id,
    tournamentStageId: stageKo,
    kind,
    teamId,
    groupCode: null,
    slotKey,
    valueText: null,
    resolvedAt: now,
    createdAt: now,
  };
}

const spainThroughSf = [
  res("esp-r16", "round_of_16", teamEsp, "1"),
  res("esp-qf", "quarterfinalist", teamEsp, "1"),
  res("esp-sf", "semifinalist", teamEsp, "1"),
];

const spainThroughFinal = [
  ...spainThroughSf,
  res("esp-finalist", "finalist", teamEsp, "1"),
];

const spainChampion = [
  ...spainThroughFinal,
  res("esp-champ", "champion", teamEsp, null),
];

const englandThroughSf = [
  res("eng-r16", "round_of_16", teamEng, "2"),
  res("eng-qf", "quarterfinalist", teamEng, "2"),
  res("eng-sf", "semifinalist", teamEng, "2"),
];

const englandThroughFinal = [
  ...englandThroughSf,
  res("eng-finalist", "finalist", teamEng, "2"),
];

// Policy resolution
{
  assert.deepEqual(
    resolveKnockoutScoringTransition({
      editionCode: "fifa_wc_2026",
      isSimulation: false,
    }),
    FIFA_WC_2026_M101_KNOCKOUT_TRANSITION,
  );
  assert.equal(
    resolveKnockoutScoringTransition({
      editionCode: "fifa_wc_2026",
      isSimulation: true,
    }),
    null,
    "simulation editions must not use grandfathering",
  );
}

// Cutoff reconstruction is deterministic: finalist/champion excluded
{
  const cutoff = buildCutoffOfficialTeamFurthestKnockoutKind(
    spainChampion,
    "semifinalist",
  );
  assert.equal(cutoff.get(teamEsp), "semifinalist");
  const again = buildCutoffOfficialTeamFurthestKnockoutKind(
    spainChampion,
    "semifinalist",
  );
  assert.equal(again.get(teamEsp), "semifinalist");
}

const rulesMap = new Map(rules.map((r) => [r.predictionKind, r.points]));

// Pure award helper: SF-capped Spain at Final → incremental 0
{
  const award = computeKnockoutTeamAward({
    currentOfficialKind: "finalist",
    cutoffOfficialKind: "semifinalist",
    maxPredictedKind: "semifinalist",
    rulesMap,
    config: transitional,
  });
  assert.equal(award.grandfatheredPoints, 16);
  assert.equal(award.incrementalPoints, 0);
  assert.equal(award.points, 16);
}

// Pure award helper: finalist Spain at Final → +8
{
  const award = computeKnockoutTeamAward({
    currentOfficialKind: "finalist",
    cutoffOfficialKind: "semifinalist",
    maxPredictedKind: "finalist",
    rulesMap,
    config: transitional,
  });
  assert.equal(award.grandfatheredPoints, 16);
  assert.equal(award.incrementalPoints, 8);
  assert.equal(award.points, 24);
}

// 1. Historical pre-cutoff over-award remains unchanged (R32-only; team at SF by cutoff).
{
  const preds = [
    pred("over-r32", pOverAward, "round_of_32", teamBel, "x"),
  ];
  const preCutoffResults = [
    res("bel-r16", "round_of_16", teamBel, "x"),
    res("bel-qf", "quarterfinalist", teamBel, "x"),
    res("bel-sf", "semifinalist", teamBel, "x"),
  ];
  // Under old uncapped model at cutoff, Belgium SF → 16 even for R32-only pick.
  const uncappedCutoff = computePoolScores({
    poolId,
    predictions: preds,
    results: preCutoffResults,
    scoringRules: rules,
    knockoutScoring: { mode: "uncapped_once_per_team" },
  });
  assert.equal(uncappedCutoff.totalsByParticipantId[pOverAward], 16);

  // After M101 (Spain finalist elsewhere) transitional scoring still keeps 16.
  const after = computePoolScores({
    poolId,
    predictions: preds,
    results: [...preCutoffResults, ...spainThroughFinal],
    scoringRules: rules,
    knockoutScoring: transitional,
  });
  assert.equal(after.totalsByParticipantId[pOverAward], 16);
  assert.equal(
    after.ledgerLines.find((l) => l.participantId === pOverAward)?.predictionKind,
    "semifinalist",
  );
}

// 2. SF-capped Spain picker gets 0 from M101 (stays 16).
{
  const preds = [
    pred("sf-esp-sf", pSfOnly, "semifinalist", teamEsp, "1"),
  ];
  const before = computePoolScores({
    poolId,
    predictions: preds,
    results: spainThroughSf,
    scoringRules: rules,
    knockoutScoring: transitional,
  });
  const after = computePoolScores({
    poolId,
    predictions: preds,
    results: spainThroughFinal,
    scoringRules: rules,
    knockoutScoring: transitional,
  });
  assert.equal(before.totalsByParticipantId[pSfOnly], 16);
  assert.equal(after.totalsByParticipantId[pSfOnly], 16);
  assert.equal(after.ledgerLines[0]?.predictionKind, "semifinalist");
}

// 3. Spain finalist picker gets +8 from M101.
{
  const preds = [
    pred("fin-esp-sf", pFinalist, "semifinalist", teamEsp, "1"),
    pred("fin-esp-fin", pFinalist, "finalist", teamEsp, "1"),
  ];
  const before = computePoolScores({
    poolId,
    predictions: preds,
    results: spainThroughSf,
    scoringRules: rules,
    knockoutScoring: transitional,
  });
  const after = computePoolScores({
    poolId,
    predictions: preds,
    results: spainThroughFinal,
    scoringRules: rules,
    knockoutScoring: transitional,
  });
  assert.equal(before.totalsByParticipantId[pFinalist], 16);
  assert.equal(after.totalsByParticipantId[pFinalist], 24);
  assert.equal(after.ledgerLines[0]?.predictionKind, "finalist");
}

// 4. Spain champion picker gets +8 from M101 (finalist depth).
{
  const preds = [pred("ch-esp", pChamp, "champion", teamEsp, null)];
  const after = computePoolScores({
    poolId,
    predictions: preds,
    results: spainThroughFinal,
    scoringRules: rules,
    knockoutScoring: transitional,
  });
  assert.equal(after.totalsByParticipantId[pChamp], 24);
}

// 5. Previous R32/R16/QF historical awards are not removed by the transition.
{
  const preds = [
    pred("hist-r16", pOverAward, "round_of_16", teamBel, "x"),
    pred("hist-esp-sf", pSfOnly, "semifinalist", teamEsp, "1"),
  ];
  const results = [
    res("bel-r16b", "round_of_16", teamBel, "x"),
    res("bel-qfb", "quarterfinalist", teamBel, "x"),
    ...spainThroughFinal,
  ];
  const outcome = computePoolScores({
    poolId,
    predictions: preds,
    results,
    scoringRules: rules,
    knockoutScoring: transitional,
  });
  // Belgium QF at cutoff under old uncapped = 8 for R16 pick (official was QF).
  assert.equal(
    outcome.ledgerLines.find(
      (l) => l.participantId === pOverAward && l.predictionKind === "quarterfinalist",
    )?.pointsDelta,
    8,
  );
  assert.equal(outcome.totalsByParticipantId[pSfOnly], 16);
}

// 6. Future M102 finalist progression follows the new cap.
{
  const predsSf = [
    pred("eng-sf-only", pEnglandSf, "semifinalist", teamEng, "2"),
  ];
  const predsFinal = [
    pred("eng-sf", pEnglandFinal, "semifinalist", teamEng, "2"),
    pred("eng-fin", pEnglandFinal, "finalist", teamEng, "2"),
  ];
  const afterSf = computePoolScores({
    poolId,
    predictions: predsSf,
    results: englandThroughFinal,
    scoringRules: rules,
    knockoutScoring: transitional,
  });
  const afterFinal = computePoolScores({
    poolId,
    predictions: predsFinal,
    results: englandThroughFinal,
    scoringRules: rules,
    knockoutScoring: transitional,
  });
  assert.equal(afterSf.totalsByParticipantId[pEnglandSf], 16);
  assert.equal(afterFinal.totalsByParticipantId[pEnglandFinal], 24);
}

// 7. Future champion progression follows the new cap.
{
  const finalistOnly = [
    pred("esp-fin-only", pFinalist, "finalist", teamEsp, "1"),
  ];
  const champPick = [pred("esp-champ-only", pChamp, "champion", teamEsp, null)];
  const asFinalist = computePoolScores({
    poolId,
    predictions: finalistOnly,
    results: spainChampion,
    scoringRules: rules,
    knockoutScoring: transitional,
  });
  const asChamp = computePoolScores({
    poolId,
    predictions: champPick,
    results: spainChampion,
    scoringRules: rules,
    knockoutScoring: transitional,
  });
  // Finalist-only: grandfathered 16 + finalist increment 8 = 24; no champion.
  assert.equal(asFinalist.totalsByParticipantId[pFinalist], 24);
  // Champion pick: 16 + (32-16) = 32.
  assert.equal(asChamp.totalsByParticipantId[pChamp], 32);
}

// France champion pick; France eliminated before cutoff — no new M101 points.
{
  const preds = [pred("fra-champ", pFranceChamp, "champion", teamFra, null)];
  const results = [
    res("fra-r16", "round_of_16", teamFra, "1"),
    res("fra-qf", "quarterfinalist", teamFra, "1"),
    res("fra-sf", "semifinalist", teamFra, "1"),
    ...spainThroughFinal,
  ];
  const before = computePoolScores({
    poolId,
    predictions: preds,
    results: results.filter((r) => r.kind !== "finalist"),
    scoringRules: rules,
    knockoutScoring: transitional,
  });
  const after = computePoolScores({
    poolId,
    predictions: preds,
    results,
    scoringRules: rules,
    knockoutScoring: transitional,
  });
  assert.equal(before.totalsByParticipantId[pFranceChamp], 16);
  assert.equal(after.totalsByParticipantId[pFranceChamp], 16);
}

// 8. Full recompute is idempotent.
{
  const preds = [
    pred("idemp-sf", pSfOnly, "semifinalist", teamEsp, "1"),
    pred("idemp-fin", pFinalist, "finalist", teamEsp, "1"),
  ];
  const first = computePoolScores({
    poolId,
    predictions: preds,
    results: spainThroughFinal,
    scoringRules: rules,
    knockoutScoring: transitional,
  });
  const second = computePoolScores({
    poolId,
    predictions: preds,
    results: spainThroughFinal,
    scoringRules: rules,
    knockoutScoring: transitional,
  });
  assert.deepEqual(first.ledgerLines, second.ledgerLines);
  assert.deepEqual(first.totalsByParticipantId, second.totalsByParticipantId);
}

// 9. Cutoff baseline reconstruction is deterministic across result order.
{
  const shuffled = [
    res("esp-finalist", "finalist", teamEsp, "1"),
    res("esp-sf", "semifinalist", teamEsp, "1"),
    res("esp-qf", "quarterfinalist", teamEsp, "1"),
    res("esp-r16", "round_of_16", teamEsp, "1"),
  ];
  const a = buildCutoffOfficialTeamFurthestKnockoutKind(shuffled, "semifinalist");
  const b = buildCutoffOfficialTeamFurthestKnockoutKind(
    [...shuffled].reverse(),
    "semifinalist",
  );
  assert.equal(a.get(teamEsp), b.get(teamEsp));
  assert.equal(a.get(teamEsp), "semifinalist");
}

// 10. Default (no transition config) remains prediction-depth-capped (simulation path).
{
  const preds = [pred("sim-sf", pSfOnly, "semifinalist", teamEsp, "1")];
  const capped = computePoolScores({
    poolId,
    predictions: preds,
    results: spainThroughFinal,
    scoringRules: rules,
  });
  assert.equal(capped.totalsByParticipantId[pSfOnly], 16);
}

// 11. Group / third-place / bonus unchanged when transition is active (group sample).
{
  const groupStageId = "stage-group";
  const groupRules: ScoringRule[] = [
    ...rules,
    {
      id: "gw",
      poolId,
      predictionKind: "group_winner",
      bonusKey: null,
      points: 5,
      createdAt: now,
      updatedAt: now,
    },
  ];
  const groupPreds: Prediction[] = [
    {
      id: "g1",
      poolId,
      participantId: pSfOnly,
      predictionKind: "group_winner",
      teamId: teamEng,
      tournamentStageId: groupStageId,
      groupCode: "A",
      slotKey: null,
      bonusKey: null,
      valueText: null,
      createdAt: now,
      updatedAt: now,
    },
    pred("g-esp-sf", pSfOnly, "semifinalist", teamEsp, "1"),
  ];
  const groupResults: Result[] = [
    {
      id: "gw-a",
      tournamentStageId: groupStageId,
      kind: "group_winner",
      teamId: teamEng,
      groupCode: "A",
      slotKey: null,
      valueText: null,
      resolvedAt: now,
      createdAt: now,
    },
    {
      id: "gr-a",
      tournamentStageId: groupStageId,
      kind: "group_runner_up",
      teamId: teamFra,
      groupCode: "A",
      slotKey: null,
      valueText: null,
      resolvedAt: now,
      createdAt: now,
    },
    ...spainThroughFinal,
  ];
  const outcome = computePoolScores({
    poolId,
    predictions: groupPreds,
    results: groupResults,
    scoringRules: groupRules,
    groupStageScoring: {
      groupStageId,
      exactPoints: 10,
      wrongSlotPoints: 5,
    },
    knockoutScoring: transitional,
  });
  assert.equal(outcome.totalsByParticipantId[pSfOnly], 10 + 16);
}

// Orphan floor: no maxPredicted but live post-cutoff points → grandfather cutoff only.
{
  const orphanFloor = computeKnockoutTeamAward({
    currentOfficialKind: "finalist",
    cutoffOfficialKind: "semifinalist",
    maxPredictedKind: null,
    rulesMap,
    config: transitional,
  });
  assert.equal(orphanFloor.points, 0, "pure award helper needs a prediction");
}

// mergePreservedPreCutoffKnockoutLedger: keep pre-cutoff live KO; replace Spain.
{
  const postCutoff = postCutoffTeamIdsFromResults(spainThroughFinal, "semifinalist");
  assert.ok(postCutoff.has(teamEsp));
  assert.equal(postCutoff.has(teamEng), false);

  const liveRows = [
    {
      participant_id: pSfOnly,
      points_delta: 8,
      prediction_kind: "quarterfinalist",
      prediction_id: "pred-bel",
      result_id: "bel-qf",
      note: "live orphan pre-cutoff",
    },
    {
      participant_id: pSfOnly,
      points_delta: 24,
      prediction_kind: "finalist",
      prediction_id: "pred-esp",
      result_id: "esp-finalist",
      note: "live Spain finalist",
    },
  ];
  const computedRows = [
    {
      participant_id: pSfOnly,
      points_delta: 5,
      prediction_kind: "group_winner",
      prediction_id: "g1",
      result_id: "gw-a",
      note: "group",
    },
    {
      participant_id: pSfOnly,
      points_delta: 16,
      prediction_kind: "semifinalist",
      prediction_id: "pred-esp",
      result_id: "esp-sf",
      note: "transitional Spain",
    },
  ];
  const resultTeamIdById = new Map<string, string | null>([
    ["bel-qf", teamBel],
    ["esp-finalist", teamEsp],
    ["esp-sf", teamEsp],
    ["gw-a", teamEng],
  ]);
  const merged = mergePreservedPreCutoffKnockoutLedger({
    computedRows,
    liveRows,
    resultTeamIdById,
    postCutoffTeamIds: postCutoff,
  });
  const bel = merged.find((r) => r.result_id === "bel-qf");
  const esp = merged.find((r) => r.participant_id === pSfOnly && r.prediction_kind === "semifinalist");
  const espFinalist = merged.find((r) => r.result_id === "esp-finalist");
  assert.ok(bel, "pre-cutoff live KO preserved");
  assert.equal(bel?.points_delta, 8);
  assert.ok(esp, "post-cutoff Spain replaced with transitional");
  assert.equal(esp?.points_delta, 16);
  assert.equal(espFinalist, undefined, "no duplicate Spain finalist row");
  assert.equal(
    merged.filter((r) => r.prediction_kind === "group_winner").length,
    1,
  );
}

// Second transitional compute is idempotent (same inputs → same KO awards).
{
  const preds = [
    pred("idemp2-sf", pSfOnly, "semifinalist", teamEsp, "1"),
    pred("idemp2-fin", pFinalist, "finalist", teamEsp, "1"),
  ];
  const a = computePoolScores({
    poolId,
    predictions: preds,
    results: spainThroughFinal,
    scoringRules: rules,
    knockoutScoring: transitional,
  });
  const b = computePoolScores({
    poolId,
    predictions: preds,
    results: spainThroughFinal,
    scoringRules: rules,
    knockoutScoring: transitional,
  });
  assert.deepEqual(a.ledgerLines, b.ledgerLines);
}

console.log("knockoutScoringTransition.selftest.ts: ok");
