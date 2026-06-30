import assert from "node:assert";
import type { ChampionPickExposure } from "./buildChampionPickExposure";
import type { KnockoutMatchExposure } from "./buildKnockoutMatchExposure";
import {
  poolExposurePayloadIsAggregateOnly,
  shouldShowChampionPickExposure,
  shouldShowKnockoutMatchExposure,
} from "./poolExposureDisplay";

// Exposure shows when picks locked and champion picks exist (R32 official results not required)
{
  const exposure: ChampionPickExposure = {
    surviving: [{ teamId: "t1", teamName: "France", teamCode: "FRA", count: 4, percentage: 100 }],
    eliminated: [],
    totalCompletedChampionPicks: 4,
    incompleteCount: 0,
  };
  assert.strictEqual(
    shouldShowChampionPickExposure({ picksLocked: true, exposure }),
    true,
  );
  assert.strictEqual(
    shouldShowChampionPickExposure({ picksLocked: false, exposure }),
    false,
  );
}

// Champion exposure still shows when all champion picks are eliminated
{
  const exposure: ChampionPickExposure = {
    surviving: [],
    eliminated: [
      { teamId: "t1", teamName: "Brazil", teamCode: "BRA", count: 2, percentage: 100 },
    ],
    totalCompletedChampionPicks: 2,
    incompleteCount: 0,
  };
  assert.strictEqual(
    shouldShowChampionPickExposure({ picksLocked: true, exposure }),
    true,
  );
}

// Match exposure shows with scheduled knockout fixtures when locked
{
  const exposure: KnockoutMatchExposure = {
    fixtures: [
      {
        matchId: "m1",
        matchCode: "M77",
        kickoffAt: "2026-06-30T21:00:00.000Z",
        stageLabel: "Round of 32",
        status: "scheduled",
        homeTeamName: "France",
        homeCountryCode: "FRA",
        awayTeamName: "Sweden",
        awayCountryCode: "SWE",
        homeHelpsCount: 10,
        awayHelpsCount: 2,
        neutralCount: 5,
        swing: "big",
        hasExposure: true,
      },
    ],
    totalCompletedBrackets: 17,
    incompleteCount: 1,
  };
  assert.strictEqual(
    shouldShowKnockoutMatchExposure({ picksLocked: true, exposure }),
    true,
  );
  assert.strictEqual(
    shouldShowKnockoutMatchExposure({ picksLocked: false, exposure }),
    false,
  );
}

// Hidden when no complete champion picks or no eligible fixtures
{
  assert.strictEqual(
    shouldShowChampionPickExposure({
      picksLocked: true,
      exposure: {
        surviving: [],
        eliminated: [],
        totalCompletedChampionPicks: 0,
        incompleteCount: 3,
      },
    }),
    false,
  );
  assert.strictEqual(
    shouldShowKnockoutMatchExposure({
      picksLocked: true,
      exposure: { fixtures: [], totalCompletedBrackets: 5, incompleteCount: 0 },
    }),
    false,
  );
}

// Aggregate payloads do not leak participant identifiers (public/anonymous safe)
{
  const champion: ChampionPickExposure = {
    surviving: [{ teamId: "t1", teamName: "Spain", teamCode: "ESP", count: 3, percentage: 75 }],
    eliminated: [],
    totalCompletedChampionPicks: 4,
    incompleteCount: 1,
  };
  const match: KnockoutMatchExposure = {
    fixtures: [
      {
        matchId: "m1",
        matchCode: "M78",
        kickoffAt: null,
        stageLabel: "Round of 32",
        status: "live",
        homeTeamName: "Brazil",
        homeCountryCode: "BRA",
        awayTeamName: "Japan",
        awayCountryCode: "JPN",
        homeHelpsCount: 8,
        awayHelpsCount: 2,
        neutralCount: 4,
        swing: "medium",
        hasExposure: true,
      },
    ],
    totalCompletedBrackets: 14,
    incompleteCount: 0,
  };
  assert.strictEqual(poolExposurePayloadIsAggregateOnly({ champion, match }), true);
}

console.log("poolExposureDisplay.selftest.ts: all passed");
