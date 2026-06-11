/**
 * Bonus results from team stats selftests.
 * Run: npx tsx lib/tournament/matchTeamStats/bonusResultsFromTeamStats.selftest.ts
 */
import assert from "node:assert/strict";
import type { Prediction, Result, ScoringRule } from "../../../src/types/domain";
import { computePoolScores } from "../../../src/lib/scoring/computePoolScores";
import { buildTournamentStatLeadersView } from "./buildTournamentStatLeadersView";
import {
  buildBonusResultsFromTeamStatsPreview,
  upsertRowsFromBonusPreview,
} from "./bonusResultsFromTeamStats";

const teamInfo = new Map([
  ["spain", { name: "Spain", countryCode: "ESP" }],
  ["france", { name: "France", countryCode: "FRA" }],
  ["germany", { name: "Germany", countryCode: "GER" }],
]);

const enabled = new Set(["most_goals", "most_yellow_cards", "most_red_cards"]);

function leadersViewFrom(
  input: {
    matches?: Parameters<typeof buildTournamentStatLeadersView>[0]["matches"];
    teamStats?: Parameters<typeof buildTournamentStatLeadersView>[0]["teamStats"];
  } = {},
) {
  return buildTournamentStatLeadersView({
    matches: input.matches ?? [],
    teamStats: input.teamStats ?? [],
    teamInfoById: teamInfo,
  });
}

// 1. most_goals leader from final scores → ready preview
const goalsView = leadersViewFrom({
  matches: [
    {
      id: "m1",
      homeTeamId: "spain",
      awayTeamId: "france",
      homeGoals: 4,
      awayGoals: 1,
    },
  ],
});
const goalsPreview = buildBonusResultsFromTeamStatsPreview({
  leadersView: goalsView,
  existingByBonusKey: new Map(),
  enabledBonusKeys: enabled,
  teamInfoById: teamInfo,
});
const goalsRow = goalsPreview.rows.find((r) => r.bonusKey === "most_goals")!;
assert.equal(goalsRow.status, "ready");
assert.equal(goalsRow.proposedTeam?.teamId, "spain");
assert.equal(goalsRow.total, 4);

// 2. yellow card leader → ready
const yellowView = leadersViewFrom({
  teamStats: [
    {
      id: "s1",
      editionId: "ed",
      matchId: "m1",
      teamId: "spain",
      yellowCards: 5,
      redCards: null,
      source: "manual",
    },
  ],
});
const yellowRow = buildBonusResultsFromTeamStatsPreview({
  leadersView: yellowView,
  existingByBonusKey: new Map(),
  enabledBonusKeys: enabled,
  teamInfoById: teamInfo,
}).rows.find((r) => r.bonusKey === "most_yellow_cards")!;
assert.equal(yellowRow.status, "ready");
assert.equal(yellowRow.proposedTeam?.teamId, "spain");

// 3. red card leader → ready
const redView = leadersViewFrom({
  teamStats: [
    {
      id: "s1",
      editionId: "ed",
      matchId: "m1",
      teamId: "germany",
      yellowCards: null,
      redCards: 3,
      source: "manual",
    },
  ],
});
const redRow = buildBonusResultsFromTeamStatsPreview({
  leadersView: redView,
  existingByBonusKey: new Map(),
  enabledBonusKeys: enabled,
  teamInfoById: teamInfo,
}).rows.find((r) => r.bonusKey === "most_red_cards")!;
assert.equal(redRow.status, "ready");
assert.equal(redRow.proposedTeam?.teamId, "germany");

// 4. no data → no publish
const emptyRow = buildBonusResultsFromTeamStatsPreview({
  leadersView: leadersViewFrom({}),
  existingByBonusKey: new Map(),
  enabledBonusKeys: enabled,
  teamInfoById: teamInfo,
}).rows.find((r) => r.bonusKey === "most_goals")!;
assert.equal(emptyRow.status, "no_data");
assert.equal(
  upsertRowsFromBonusPreview(
    buildBonusResultsFromTeamStatsPreview({
      leadersView: leadersViewFrom({}),
      existingByBonusKey: new Map(),
      enabledBonusKeys: enabled,
      teamInfoById: teamInfo,
    }),
    "ed",
    "group-stage",
    "2026-06-11T00:00:00.000Z",
  ).length,
  0,
);

// 5. tie → skipped
const tieView = leadersViewFrom({
  matches: [
    {
      id: "m1",
      homeTeamId: "spain",
      awayTeamId: "france",
      homeGoals: 2,
      awayGoals: 0,
    },
    {
      id: "m2",
      homeTeamId: "france",
      awayTeamId: "germany",
      homeGoals: 2,
      awayGoals: 0,
    },
  ],
});
const tieRow = buildBonusResultsFromTeamStatsPreview({
  leadersView: tieView,
  existingByBonusKey: new Map(),
  enabledBonusKeys: enabled,
  teamInfoById: teamInfo,
}).rows.find((r) => r.bonusKey === "most_goals")!;
assert.equal(tieRow.status, "tie");
assert.ok(tieRow.warning?.includes("manual"));

// 6. existing same result → unchanged
const unchangedRow = buildBonusResultsFromTeamStatsPreview({
  leadersView: goalsView,
  existingByBonusKey: new Map([
    [
      "most_goals",
      {
        teamId: "spain",
        teamName: "Spain",
        countryCode: "ESP",
        source: "manual",
        locked: true,
      },
    ],
  ]),
  enabledBonusKeys: enabled,
  teamInfoById: teamInfo,
}).rows.find((r) => r.bonusKey === "most_goals")!;
assert.equal(unchangedRow.status, "unchanged");

// 7. existing different manual result → ready with replace warning
const conflictRow = buildBonusResultsFromTeamStatsPreview({
  leadersView: goalsView,
  existingByBonusKey: new Map([
    [
      "most_goals",
      {
        teamId: "france",
        teamName: "France",
        countryCode: "FRA",
        source: "manual",
        locked: true,
      },
    ],
  ]),
  enabledBonusKeys: enabled,
  teamInfoById: teamInfo,
}).rows.find((r) => r.bonusKey === "most_goals")!;
assert.equal(conflictRow.status, "ready");
assert.ok(conflictRow.warning?.includes("France"));
assert.ok(conflictRow.warning?.includes("Spain"));

// 8. apply writes result rows (upsert payload)
const editionId = "ed-1";
const groupStageId = "stage-group";
const resolvedAt = "2026-06-11T12:00:00.000Z";
const upserts = upsertRowsFromBonusPreview(
  goalsPreview,
  editionId,
  groupStageId,
  resolvedAt,
);
assert.equal(upserts.length, 1);
assert.deepEqual(upserts[0], {
  editionId,
  tournamentStageId: groupStageId,
  bonusKey: "most_goals",
  teamId: "spain",
  resolvedAt,
});

// 9. scoring awards bonus points after result publication
const poolId = "pool-1111-1111-1111-111111111111";
const stageGroup = groupStageId;
const teamSpain = "spain";
const teamFrance = "france";
const alice = "part-alice-0001-0000-0000-000000000001";
const bob = "part-bob-0001-0000-0000-000000000001";
const now = resolvedAt;

const rules: ScoringRule[] = [
  {
    id: "rule-goals",
    poolId,
    predictionKind: "bonus_pick",
    bonusKey: "most_goals",
    points: 50,
    createdAt: now,
    updatedAt: now,
  },
];

const publishedResult: Result = {
  id: "res-goals",
  tournamentStageId: stageGroup,
  kind: "bonus_pick",
  teamId: teamSpain,
  groupCode: null,
  slotKey: "most_goals",
  valueText: null,
  resolvedAt: now,
  createdAt: now,
  source: "manual",
  locked: true,
};

const predictions: Prediction[] = [
  {
    id: "pred-alice-goals",
    poolId,
    participantId: alice,
    predictionKind: "bonus_pick",
    teamId: teamSpain,
    tournamentStageId: stageGroup,
    groupCode: null,
    slotKey: null,
    bonusKey: "most_goals",
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "pred-bob-goals",
    poolId,
    participantId: bob,
    predictionKind: "bonus_pick",
    teamId: teamFrance,
    tournamentStageId: stageGroup,
    groupCode: null,
    slotKey: null,
    bonusKey: "most_goals",
    valueText: null,
    createdAt: now,
    updatedAt: now,
  },
];

const outcome = computePoolScores({
  poolId,
  predictions,
  results: [publishedResult],
  scoringRules: rules,
});
assert.equal(outcome.totalsByParticipantId[alice], 50);
assert.equal(outcome.totalsByParticipantId[bob], undefined);

// 10. rerun is idempotent — unchanged preview produces no upserts
const secondPass = buildBonusResultsFromTeamStatsPreview({
  leadersView: goalsView,
  existingByBonusKey: new Map([
    [
      "most_goals",
      {
        teamId: "spain",
        teamName: "Spain",
        countryCode: "ESP",
        source: "manual",
        locked: true,
      },
    ],
  ]),
  enabledBonusKeys: enabled,
  teamInfoById: teamInfo,
});
assert.equal(secondPass.publishableCount, 0);
assert.equal(
  upsertRowsFromBonusPreview(secondPass, editionId, groupStageId, resolvedAt).length,
  0,
);

// unsupported when bonus key not in pool rules
const unsupportedRow = buildBonusResultsFromTeamStatsPreview({
  leadersView: goalsView,
  existingByBonusKey: new Map(),
  enabledBonusKeys: new Set(["most_yellow_cards"]),
  teamInfoById: teamInfo,
}).rows.find((r) => r.bonusKey === "most_goals")!;
assert.equal(unsupportedRow.status, "unsupported");

console.log("bonusResultsFromTeamStats.selftest.ts: all assertions passed");
