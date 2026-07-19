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
  existingBonusResultsMap,
  staleBonusResultTeamIdsFromPreview,
  upsertRowsFromBonusPreview,
  type ExistingBonusResultRow,
} from "./bonusResultsFromTeamStats";

const teamInfo = new Map([
  ["spain", { name: "Spain", countryCode: "ESP" }],
  ["france", { name: "France", countryCode: "FRA" }],
  ["germany", { name: "Germany", countryCode: "GER" }],
  ["england", { name: "England", countryCode: "ENG" }],
  ["mexico", { name: "Mexico", countryCode: "MEX" }],
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

function existingMap(
  entries: Array<[string, ExistingBonusResultRow | ExistingBonusResultRow[]]>,
): Map<string, ExistingBonusResultRow[]> {
  const out = new Map<string, ExistingBonusResultRow[]>();
  for (const [key, value] of entries) {
    out.set(key, Array.isArray(value) ? value : [value]);
  }
  return out;
}

const soleExistingSpain: ExistingBonusResultRow = {
  teamId: "spain",
  teamName: "Spain",
  countryCode: "ESP",
  source: "manual",
  locked: true,
};

// 1. most_goals sole leader from final scores → ready preview
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
assert.equal(goalsRow.proposedTeams.length, 1);
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

// 5. two-way tie → ready (both teams publishable)
const tieView = leadersViewFrom({
  matches: [
    {
      id: "m1",
      homeTeamId: "england",
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
assert.equal(tieRow.status, "ready");
assert.equal(tieRow.proposedTeams.length, 2);
assert.deepEqual(
  tieRow.proposedTeams.map((t) => t.teamId).sort(),
  ["england", "france"],
);
assert.ok(tieRow.warning?.includes("tied"));
assert.ok(!tieRow.warning?.toLowerCase().includes("manual decision"));
assert.ok(!tieRow.warning?.toLowerCase().includes("sole"));

const tieUpserts = upsertRowsFromBonusPreview(
  buildBonusResultsFromTeamStatsPreview({
    leadersView: tieView,
    existingByBonusKey: new Map(),
    enabledBonusKeys: enabled,
    teamInfoById: teamInfo,
  }),
  "ed",
  "group-stage",
  "2026-06-11T00:00:00.000Z",
).filter((r) => r.bonusKey === "most_goals");
assert.equal(tieUpserts.length, 2);

// 6. existing same result → unchanged
const unchangedRow = buildBonusResultsFromTeamStatsPreview({
  leadersView: goalsView,
  existingByBonusKey: existingMap([["most_goals", soleExistingSpain]]),
  enabledBonusKeys: enabled,
  teamInfoById: teamInfo,
}).rows.find((r) => r.bonusKey === "most_goals")!;
assert.equal(unchangedRow.status, "unchanged");

// 6b. existing tied set matches → unchanged
const unchangedTie = buildBonusResultsFromTeamStatsPreview({
  leadersView: tieView,
  existingByBonusKey: existingMap([
    [
      "most_goals",
      [
        {
          teamId: "england",
          teamName: "England",
          countryCode: "ENG",
          source: "manual",
          locked: true,
        },
        {
          teamId: "france",
          teamName: "France",
          countryCode: "FRA",
          source: "manual",
          locked: true,
        },
      ],
    ],
  ]),
  enabledBonusKeys: enabled,
  teamInfoById: teamInfo,
}).rows.find((r) => r.bonusKey === "most_goals")!;
assert.equal(unchangedTie.status, "unchanged");
assert.equal(
  upsertRowsFromBonusPreview(
    buildBonusResultsFromTeamStatsPreview({
      leadersView: tieView,
      existingByBonusKey: existingMap([
        [
          "most_goals",
          [
            {
              teamId: "england",
              teamName: "England",
              countryCode: "ENG",
              source: "manual",
              locked: true,
            },
            {
              teamId: "france",
              teamName: "France",
              countryCode: "FRA",
              source: "manual",
              locked: true,
            },
          ],
        ],
      ]),
      enabledBonusKeys: enabled,
      teamInfoById: teamInfo,
    }),
    "ed",
    "group-stage",
    "2026-06-11T00:00:00.000Z",
  ).filter((r) => r.bonusKey === "most_goals").length,
  0,
);

// 7. existing different manual result → ready with replace warning
const conflictRow = buildBonusResultsFromTeamStatsPreview({
  leadersView: goalsView,
  existingByBonusKey: existingMap([
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
const stale = staleBonusResultTeamIdsFromPreview(
  buildBonusResultsFromTeamStatsPreview({
    leadersView: goalsView,
    existingByBonusKey: existingMap([
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
  }),
);
assert.deepEqual(stale.get("most_goals"), ["france"]);

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

// 9. sole leader scoring
const poolId = "pool-1111-1111-1111-111111111111";
const stageGroup = groupStageId;
const teamSpain = "spain";
const teamFrance = "france";
const teamEngland = "england";
const teamMexico = "mexico";
const teamGermany = "germany";
const alice = "part-alice-0001-0000-0000-000000000001";
const bob = "part-bob-0001-0000-0000-000000000001";
const carol = "part-carol-0001-0000-0000-000000000001";
const dave = "part-dave-0001-0000-0000-000000000001";
const now = resolvedAt;

const rules: ScoringRule[] = [
  {
    id: "rule-goals",
    poolId,
    predictionKind: "bonus_pick",
    bonusKey: "most_goals",
    points: 25,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "rule-yellow",
    poolId,
    predictionKind: "bonus_pick",
    bonusKey: "most_yellow_cards",
    points: 10,
    createdAt: now,
    updatedAt: now,
  },
];

function bonusPred(
  id: string,
  participantId: string,
  bonusKey: string,
  teamId: string,
): Prediction {
  return {
    id,
    poolId,
    participantId,
    predictionKind: "bonus_pick",
    teamId,
    tournamentStageId: stageGroup,
    groupCode: null,
    slotKey: null,
    bonusKey,
    valueText: null,
    createdAt: now,
    updatedAt: now,
  };
}

function bonusResult(id: string, bonusKey: string, teamId: string): Result {
  return {
    id,
    tournamentStageId: stageGroup,
    kind: "bonus_pick",
    teamId,
    groupCode: null,
    slotKey: bonusKey,
    valueText: null,
    resolvedAt: now,
    createdAt: now,
    source: "manual",
    locked: true,
  };
}

const soleOutcome = computePoolScores({
  poolId,
  predictions: [
    bonusPred("pred-alice-goals", alice, "most_goals", teamSpain),
    bonusPred("pred-bob-goals", bob, "most_goals", teamFrance),
  ],
  results: [bonusResult("res-goals", "most_goals", teamSpain)],
  scoringRules: rules,
});
assert.equal(soleOutcome.totalsByParticipantId[alice], 25);
assert.equal(soleOutcome.totalsByParticipantId[bob], undefined);

// 10. two-way tie — both picks get full points; other gets zero
const tieOutcome = computePoolScores({
  poolId,
  predictions: [
    bonusPred("pred-alice-tie", alice, "most_goals", teamEngland),
    bonusPred("pred-bob-tie", bob, "most_goals", teamFrance),
    bonusPred("pred-carol-tie", carol, "most_goals", teamMexico),
  ],
  results: [
    bonusResult("res-eng", "most_goals", teamEngland),
    bonusResult("res-fra", "most_goals", teamFrance),
  ],
  scoringRules: rules,
});
assert.equal(tieOutcome.totalsByParticipantId[alice], 25);
assert.equal(tieOutcome.totalsByParticipantId[bob], 25);
assert.equal(tieOutcome.totalsByParticipantId[carol], undefined);

// 11. three-way yellow tie — all three awarded full points
const multiOutcome = computePoolScores({
  poolId,
  predictions: [
    bonusPred("pred-a-y", alice, "most_yellow_cards", teamSpain),
    bonusPred("pred-b-y", bob, "most_yellow_cards", teamFrance),
    bonusPred("pred-c-y", carol, "most_yellow_cards", teamGermany),
    bonusPred("pred-d-y", dave, "most_yellow_cards", teamMexico),
  ],
  results: [
    bonusResult("res-y-esp", "most_yellow_cards", teamSpain),
    bonusResult("res-y-fra", "most_yellow_cards", teamFrance),
    bonusResult("res-y-ger", "most_yellow_cards", teamGermany),
  ],
  scoringRules: rules,
});
assert.equal(multiOutcome.totalsByParticipantId[alice], 10);
assert.equal(multiOutcome.totalsByParticipantId[bob], 10);
assert.equal(multiOutcome.totalsByParticipantId[carol], 10);
assert.equal(multiOutcome.totalsByParticipantId[dave], undefined);

// 12. duplicate prevention — two result rows same category; pick matches one → once
const dupOutcome = computePoolScores({
  poolId,
  predictions: [bonusPred("pred-alice-dup", alice, "most_goals", teamEngland)],
  results: [
    bonusResult("res-eng-1", "most_goals", teamEngland),
    bonusResult("res-eng-2", "most_goals", teamEngland),
    bonusResult("res-fra-dup", "most_goals", teamFrance),
  ],
  scoringRules: rules,
});
assert.equal(dupOutcome.totalsByParticipantId[alice], 25);
assert.equal(
  dupOutcome.ledgerLines.filter((l) => l.predictionId === "pred-alice-dup")
    .length,
  1,
);

// 13. recompute idempotency — identical totals / ledger shape
const recomputeA = computePoolScores({
  poolId,
  predictions: [
    bonusPred("pred-alice-id", alice, "most_goals", teamEngland),
    bonusPred("pred-bob-id", bob, "most_goals", teamFrance),
  ],
  results: [
    bonusResult("res-eng-id", "most_goals", teamEngland),
    bonusResult("res-fra-id", "most_goals", teamFrance),
  ],
  scoringRules: rules,
});
const recomputeB = computePoolScores({
  poolId,
  predictions: [
    bonusPred("pred-alice-id", alice, "most_goals", teamEngland),
    bonusPred("pred-bob-id", bob, "most_goals", teamFrance),
  ],
  results: [
    bonusResult("res-eng-id", "most_goals", teamEngland),
    bonusResult("res-fra-id", "most_goals", teamFrance),
  ],
  scoringRules: rules,
});
assert.deepEqual(recomputeA.totalsByParticipantId, recomputeB.totalsByParticipantId);
assert.equal(recomputeA.ledgerLines.length, recomputeB.ledgerLines.length);
assert.deepEqual(
  recomputeA.ledgerLines.map((l) => ({
    p: l.participantId,
    pred: l.predictionId,
    pts: l.pointsDelta,
  })),
  recomputeB.ledgerLines.map((l) => ({
    p: l.participantId,
    pred: l.predictionId,
    pts: l.pointsDelta,
  })),
);

// 14. leader change: sole → tie adds newly qualifying pick; prior winner retains
const afterLeaderChange = computePoolScores({
  poolId,
  predictions: [
    bonusPred("pred-alice-chg", alice, "most_goals", teamSpain),
    bonusPred("pred-bob-chg", bob, "most_goals", teamFrance),
  ],
  results: [
    bonusResult("res-esp-chg", "most_goals", teamSpain),
    bonusResult("res-fra-chg", "most_goals", teamFrance),
  ],
  scoringRules: rules,
});
assert.equal(afterLeaderChange.totalsByParticipantId[alice], 25);
assert.equal(afterLeaderChange.totalsByParticipantId[bob], 25);

// 15. existingBonusResultsMap keeps multiple teams per key
const multiExisting = existingBonusResultsMap(
  [
    { team_id: "england", slot_key: "most_goals", source: "manual", locked: true },
    { team_id: "france", slot_key: "most_goals", source: "manual", locked: true },
  ],
  teamInfo,
);
assert.equal(multiExisting.get("most_goals")?.length, 2);

// unsupported when bonus key not in pool rules
const unsupportedRow = buildBonusResultsFromTeamStatsPreview({
  leadersView: goalsView,
  existingByBonusKey: new Map(),
  enabledBonusKeys: new Set(["most_yellow_cards"]),
  teamInfoById: teamInfo,
}).rows.find((r) => r.bonusKey === "most_goals")!;
assert.equal(unsupportedRow.status, "unsupported");

console.log("bonusResultsFromTeamStats.selftest.ts: all assertions passed");
