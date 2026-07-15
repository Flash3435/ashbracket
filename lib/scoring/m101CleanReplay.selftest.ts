/**
 * Clean M101 rollback-and-replay — unit tests.
 *
 * Run: npx tsx lib/scoring/m101CleanReplay.selftest.ts
 */
import assert from "node:assert/strict";
import { buildLatestPointsBreakdownForParticipant } from "../leaderboard/computeLatestMatchPointsBreakdown";
import {
  formatLatestMatchScoringLine,
  formatM101KnockoutDepthTransitionLine,
  formatLeaderboardLatestImpactSummary,
  formatNamedScoringCorrectionLine,
} from "../leaderboard/leaderboardBracketImpactDisplay";
import { formatRecentPointsDelta } from "../leaderboard/leaderboardMomentumDisplay";
import type { LeaderboardMomentumRow } from "../leaderboard/buildLeaderboardMomentum";
import type { LeaderboardLatestScoreEventContext } from "../leaderboard/parseLatestScoreEventContext";
import { parseLatestScoreEventContext } from "../leaderboard/parseLatestScoreEventContext";
import type { Prediction } from "../../src/types/domain";
import {
  buildCleanM101ReplayPlan,
  reconstructPreM101Standings,
  shouldShowCleanM101PointsLine,
} from "./m101CleanReplay";

const spain = "team-esp";
const now = "2026-07-14T00:00:00.000Z";

function pred(
  participantId: string,
  kind: Prediction["predictionKind"],
  id = `${participantId}-${kind}`,
): Prediction {
  return {
    id,
    poolId: "pool",
    participantId,
    predictionKind: kind,
    teamId: spain,
    tournamentStageId: "ko",
    slotKey: null,
    groupCode: null,
    bonusKey: null,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  };
}

function momentum(
  participantId: string,
  delta: number,
  previousPoints = 200,
): LeaderboardMomentumRow {
  return {
    participantId,
    previousRank: 2,
    currentRank: delta > 0 ? 1 : 3,
    rankChange: delta > 0 ? 1 : -1,
    previousPoints,
    currentPoints: previousPoints + delta,
    recentPointsGained: delta,
    isNewEntry: false,
  };
}

const cleanM101Event: LeaderboardLatestScoreEventContext =
  parseLatestScoreEventContext(
    {
      match_label: "France 0–2 Spain",
      scoreline: "France 0–2 Spain",
      match_codes: ["M101"],
      trigger: "tournament_sync",
    },
    { hasValidSnapshot: true },
  );

assert.equal(cleanM101Event.matchupShortLabel, "Spain def. France");

// 1. Exact pre-M101 snapshot restoration from previous_standings
{
  const live = new Map([
    ["emil", 222],
    ["wwcd", 207],
    ["joel", 210],
  ]);
  const names = new Map([
    ["emil", "Emil"],
    ["wwcd", "WinnerWinnerChickenDinner"],
    ["joel", "Joel Lopez"],
  ]);
  const preds = new Map<string, Prediction[]>([
    ["emil", [pred("emil", "champion")]],
    ["wwcd", [pred("wwcd", "semifinalist")]],
    ["joel", [pred("joel", "champion")]],
  ]);
  const restored = reconstructPreM101Standings({
    previousStandingsFromM101Activity: [
      { participant_id: "emil", total_points: 214 },
      { participant_id: "wwcd", total_points: 207 },
      { participant_id: "joel", total_points: 202 },
      { participant_id: "vinay", total_points: 203 },
      { participant_id: "fraser", total_points: 200 },
      { participant_id: "sanjay", total_points: 198 },
    ],
    displayNameByParticipantId: new Map([
      ...names,
      ["vinay", "Vinay Menon"],
      ["fraser", "Fraser"],
      ["sanjay", "Sanjay"],
    ]),
    liveTotalsByParticipantId: live,
    predictionsByParticipantId: preds,
    spainTeamId: spain,
  });
  assert.equal(restored.source, "m101_previous_standings");
  const top6 = [...restored.rows]
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, 6)
    .map((r) => `${r.displayName}:${r.totalPoints}`);
  assert.deepEqual(top6, [
    "Emil:214",
    "WinnerWinnerChickenDinner:207",
    "Vinay Menon:203",
    "Joel Lopez:202",
    "Fraser:200",
    "Sanjay:198",
  ]);
  void live;
}

// 2–5. Finalist / champion / SF-only / France-over-Spain deltas
{
  const plan = buildCleanM101ReplayPlan({
    preM101Rows: [
      { participantId: "finalist", displayName: "Finalist", totalPoints: 100 },
      { participantId: "champ", displayName: "Champ", totalPoints: 100 },
      { participantId: "sf", displayName: "SF-only", totalPoints: 100 },
      { participantId: "fra", displayName: "France-picker", totalPoints: 100 },
    ],
    predictionsByParticipantId: new Map([
      ["finalist", [pred("finalist", "finalist")]],
      ["champ", [pred("champ", "champion")]],
      ["sf", [pred("sf", "semifinalist")]],
      ["fra", [
        {
          ...pred("fra", "champion", "fra-champ"),
          teamId: "team-fra",
        },
      ]],
    ]),
    spainTeamId: spain,
  });
  const byId = Object.fromEntries(plan.participants.map((p) => [p.participantId, p]));
  assert.equal(byId.finalist?.m101Delta, 8);
  assert.equal(byId.finalist?.postReplayPoints, 108);
  assert.equal(byId.champ?.m101Delta, 8);
  assert.equal(byId.champ?.postReplayPoints, 108);
  assert.equal(byId.sf?.m101Delta, 0);
  assert.equal(byId.sf?.postReplayPoints, 100);
  assert.equal(byId.fra?.m101Delta, 0);
  assert.equal(byId.fra?.postReplayPoints, 100);
  assert.equal(plan.anomalous.length, 0);
  assert.ok(plan.participants.every((p) => p.m101Delta >= 0));
}

// Fampool expected top-six after clean replay
{
  const plan = buildCleanM101ReplayPlan({
    preM101Rows: [
      { participantId: "emil", displayName: "Emil", totalPoints: 214 },
      { participantId: "wwcd", displayName: "WinnerWinnerChickenDinner", totalPoints: 207 },
      { participantId: "vinay", displayName: "Vinay Menon", totalPoints: 203 },
      { participantId: "joel", displayName: "Joel Lopez", totalPoints: 202 },
      { participantId: "fraser", displayName: "Fraser", totalPoints: 200 },
      { participantId: "sanjay", displayName: "Sanjay", totalPoints: 198 },
    ],
    predictionsByParticipantId: new Map([
      ["emil", [pred("emil", "champion")]],
      ["wwcd", [pred("wwcd", "semifinalist")]],
      ["vinay", [pred("vinay", "semifinalist")]],
      ["joel", [pred("joel", "champion")]],
      ["fraser", [pred("fraser", "semifinalist")]],
      ["sanjay", [pred("sanjay", "semifinalist")]],
    ]),
    spainTeamId: spain,
  });
  assert.deepEqual(
    plan.postTop.slice(0, 6).map((r) => `${r.postRank}.${r.displayName}:${r.postReplayPoints}`),
    [
      "1.Emil:222",
      "2.Joel Lopez:210",
      "3.WinnerWinnerChickenDinner:207",
      "4.Vinay Menon:203",
      "5.Fraser:200",
      "6.Sanjay:198",
    ],
  );
  const wwcd = plan.participants.find((p) => p.participantId === "wwcd")!;
  assert.equal(wwcd.m101Delta, 0);
  const wwcdTop = plan.postTop.find((p) => p.participantId === "wwcd")!;
  assert.equal(wwcdTop.preRank, 2);
  assert.equal(wwcdTop.postRank, 3);
  assert.equal(wwcdTop.rankDelta, -1);
}

// 6–9. Presentation: keeper +8 line; ineligible no points/correction/+0
{
  assert.equal(shouldShowCleanM101PointsLine(8), true);
  assert.equal(shouldShowCleanM101PointsLine(0), false);

  const keeperMom = momentum("joel", 8, 202);
  const keeperBreakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "joel",
    momentum: keeperMom,
    event: cleanM101Event,
    predictions: [],
    matches: [],
    rulesByKind: new Map(),
  });
  assert.equal(
    formatLatestMatchScoringLine(keeperMom, cleanM101Event, null, keeperBreakdown),
    "Spain def. France: +8",
  );
  assert.equal(formatNamedScoringCorrectionLine(keeperBreakdown), null);
  assert.equal(formatM101KnockoutDepthTransitionLine(keeperBreakdown), null);

  const loserMom = momentum("wwcd", 0, 207);
  const loserBreakdown = buildLatestPointsBreakdownForParticipant({
    participantId: "wwcd",
    momentum: loserMom,
    event: cleanM101Event,
    predictions: [],
    matches: [],
    rulesByKind: new Map(),
  });
  const summary = formatLeaderboardLatestImpactSummary({
    totalPoints: 207,
    momentum: loserMom,
    event: cleanM101Event,
    pointsBreakdown: loserBreakdown,
  });
  assert.equal(summary.latestLine, null);
  assert.equal(summary.correctionLine, null);
  assert.equal(
    formatRecentPointsDelta(loserMom, {
      showZero: false,
      latestSuffix: true,
      event: cleanM101Event,
      pointsBreakdown: loserBreakdown,
    }),
    null,
  );
}

// 7. Correction overlay must not remain after clean replay event
{
  const correctionEvent = parseLatestScoreEventContext(
    {
      match_codes: [],
      trigger: "admin_manual_recompute",
      scoring_corrections: [{ kind: "m101_knockout_depth_transition" }],
    },
    { hasValidSnapshot: true },
  );
  // Clean latest event is the match, not the correction — assert match event has no correction kinds
  assert.equal(cleanM101Event.scoringCorrectionKinds.length, 0);
  assert.ok(correctionEvent.scoringCorrectionKinds.includes("m101_knockout_depth_transition"));
}

console.log("m101CleanReplay.selftest.ts: ok");
