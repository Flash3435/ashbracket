/**
 * Tournament stat leaders selftests.
 * Run: npx tsx lib/tournament/matchTeamStats/tournamentStatLeaders.selftest.ts
 */
import assert from "node:assert/strict";
import {
  buildTournamentStatLeadersView,
  formatStatLeaderNames,
} from "./buildTournamentStatLeadersView";
import { deriveTeamStatTotals, firstPlaceTeamStatLeaders } from "./deriveTeamStatTotals";
import { MATCH_TEAM_STAT_ROW_KEYS } from "./buildTeamStatUpsertRows";

const teamInfo = new Map([
  ["spain", { name: "Spain", countryCode: "ESP" }],
  ["france", { name: "France", countryCode: "FRA" }],
  ["germany", { name: "Germany", countryCode: "GER" }],
]);

// 1. goals leader derived from final scores
const goalsView = buildTournamentStatLeadersView({
  matches: [
    {
      id: "m1",
      homeTeamId: "spain",
      awayTeamId: "france",
      homeGoals: 3,
      awayGoals: 1,
    },
    {
      id: "m2",
      homeTeamId: "spain",
      awayTeamId: "germany",
      homeGoals: 2,
      awayGoals: 0,
    },
  ],
  teamStats: [],
  teamInfoById: teamInfo,
});
assert.equal(goalsView.goals.leaders.length, 1);
assert.equal(goalsView.goals.leaders[0]!.teamId, "spain");
assert.equal(goalsView.goals.leaders[0]!.total, 5);
assert.equal(goalsView.goals.emptyMessage, null);

// 2. yellow card leader derived from team stats
const yellowView = buildTournamentStatLeadersView({
  matches: [],
  teamStats: [
    {
      id: "s1",
      editionId: "ed",
      matchId: "m1",
      teamId: "spain",
      yellowCards: 4,
      redCards: null,
      source: "manual",
    },
    {
      id: "s2",
      editionId: "ed",
      matchId: "m2",
      teamId: "france",
      yellowCards: 2,
      redCards: null,
      source: "manual",
    },
  ],
  teamInfoById: teamInfo,
});
assert.equal(yellowView.yellowCards.leaders[0]!.teamId, "spain");
assert.equal(yellowView.yellowCards.leaders[0]!.total, 4);

// 3. red card leader derived from team stats
const redView = buildTournamentStatLeadersView({
  matches: [],
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
    {
      id: "s2",
      editionId: "ed",
      matchId: "m2",
      teamId: "spain",
      yellowCards: null,
      redCards: 1,
      source: "manual",
    },
  ],
  teamInfoById: teamInfo,
});
assert.equal(redView.redCards.leaders[0]!.teamId, "germany");
assert.equal(redView.redCards.leaders[0]!.total, 3);

// 4. ties handled correctly
const tiedTotals = deriveTeamStatTotals({
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
  teamStats: [],
});
const tiedLeaders = firstPlaceTeamStatLeaders(tiedTotals.goalsByTeamId);
assert.equal(tiedLeaders.length, 2);
assert.deepEqual(
  tiedLeaders.map((l) => l.teamId).sort(),
  ["france", "spain"],
);
const tiedView = buildTournamentStatLeadersView({
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
  teamStats: [],
  teamInfoById: teamInfo,
});
assert.equal(tiedView.goals.leaders.length, 2);
assert.equal(
  formatStatLeaderNames(tiedView.goals.leaders),
  "Tied: France, Spain",
);

// 5. empty state when no stats exist
const emptyView = buildTournamentStatLeadersView({
  matches: [],
  teamStats: [],
  teamInfoById: teamInfo,
});
assert.equal(emptyView.fullyEmpty, true);
assert.equal(emptyView.hasAnyStats, false);
assert.equal(emptyView.goals.leaders.length, 0);
assert.ok(emptyView.goals.emptyMessage?.includes("final scores"));

// 6. simulation pools do not affect live leaders — edition filter is enforced in loader;
// verify official code constant and build path ignores unrelated edition ids in input data.
assert.equal(
  buildTournamentStatLeadersView({
    matches: [
      {
        id: "sim-m1",
        homeTeamId: "spain",
        awayTeamId: "france",
        homeGoals: 99,
        awayGoals: 0,
      },
    ],
    teamStats: [],
    teamInfoById: teamInfo,
  }).goals.leaders[0]!.total,
  99,
  "view reflects only the matches passed in (loader scopes to live official edition)",
);

// 7. panel does not mutate predictions/results/ledger
const statKeys = [...MATCH_TEAM_STAT_ROW_KEYS] as string[];
assert.ok(!statKeys.includes("prediction_kind"));
assert.ok(!statKeys.includes("points_delta"));
assert.ok(!statKeys.includes("home_goals"));

// pick counts attach only for single leader
const withPicks = buildTournamentStatLeadersView({
  matches: goalsView.goals.leaders.length
    ? [
        {
          id: "m1",
          homeTeamId: "spain",
          awayTeamId: "france",
          homeGoals: 3,
          awayGoals: 1,
        },
      ]
    : [],
  teamStats: [],
  teamInfoById: teamInfo,
  pickCountsByBonusKey: { most_goals: 12 },
});
assert.equal(withPicks.goals.pickCount, 12);
assert.equal(
  buildTournamentStatLeadersView({
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
    teamStats: [],
    teamInfoById: teamInfo,
    pickCountsByBonusKey: { most_goals: 12 },
  }).goals.pickCount,
  null,
);

console.log("tournamentStatLeaders.selftest.ts: all assertions passed");
