import assert from "node:assert";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  buildKnockoutMatchExposure,
  classifyMatchExposureSwing,
  isEligibleKnockoutExposureMatch,
  sortKnockoutExposureMatches,
} from "./buildKnockoutMatchExposure";
import { buildLeaderboardNameContext } from "./buildNamePreview";

const teams = [
  {
    id: "team-bra",
    name: "Brazil",
    countryCode: "BRA",
    fifaCode: "BRA",
    fifaRank: 1,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-jpn",
    name: "Japan",
    countryCode: "JPN",
    fifaCode: "JPN",
    fifaRank: 2,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-esp",
    name: "Spain",
    countryCode: "ESP",
    fifaCode: "ESP",
    fifaRank: 3,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
] satisfies Team[];

function slot(
  overrides: Partial<KnockoutPickSlotDraft> &
    Pick<KnockoutPickSlotDraft, "predictionKind" | "teamId">,
): KnockoutPickSlotDraft {
  return {
    rowKey: overrides.rowKey ?? `${overrides.predictionKind}-${overrides.teamId}`,
    sectionLabel: "Knockout",
    slotLabel: "Pick",
    tournamentStageId: "stage-ko",
    slotKey: null,
    groupCode: null,
    bonusKey: null,
    ...overrides,
  };
}

function knockoutMatch(
  overrides: Partial<TournamentMatchPublicRow> &
    Pick<TournamentMatchPublicRow, "match_id" | "match_code">,
): TournamentMatchPublicRow {
  return {
    edition_id: "ed-1",
    edition_code: "wc2026",
    stage_code: "round_of_16",
    stage_label: "Round of 16",
    stage_sort_order: 3,
    group_code: null,
    round_index: 1,
    kickoff_at: "2026-07-05T20:00:00.000Z",
    status: "scheduled",
    home_goals: null,
    away_goals: null,
    home_penalties: null,
    away_penalties: null,
    home_team_name: "Brazil",
    home_country_code: "BRA",
    away_team_name: "Japan",
    away_country_code: "JPN",
    winner_team_name: null,
    winner_country_code: null,
    ...overrides,
  };
}

const braVsJpn = knockoutMatch({ match_id: "m-1", match_code: "M73" });
const espVsJpn = knockoutMatch({
  match_id: "m-2",
  match_code: "M74",
  kickoff_at: "2026-07-06T20:00:00.000Z",
  home_team_name: "Spain",
  home_country_code: "ESP",
});

// Team A helps multiple participants
{
  const exposure = buildKnockoutMatchExposure({
    matches: [braVsJpn],
    completeParticipantBrackets: [
      { participantId: "p1", slots: [slot({ predictionKind: "champion", teamId: "team-bra" })] },
      { participantId: "p2", slots: [slot({ predictionKind: "champion", teamId: "team-bra" })] },
      { participantId: "p3", slots: [slot({ predictionKind: "champion", teamId: "team-jpn" })] },
    ],
    teams,
  });

  const fixture = exposure.fixtures[0];
  assert(fixture);
  assert.strictEqual(fixture.homeHelpsCount, 2);
  assert.strictEqual(fixture.awayHelpsCount, 1);
  assert.strictEqual(fixture.neutralCount, 0);
}

// Team B helps multiple participants
{
  const exposure = buildKnockoutMatchExposure({
    matches: [braVsJpn],
    completeParticipantBrackets: [
      { participantId: "p1", slots: [slot({ predictionKind: "champion", teamId: "team-jpn" })] },
      { participantId: "p2", slots: [slot({ predictionKind: "champion", teamId: "team-jpn" })] },
      { participantId: "p3", slots: [slot({ predictionKind: "champion", teamId: "team-bra" })] },
    ],
    teams,
  });

  const fixture = exposure.fixtures[0];
  assert(fixture);
  assert.strictEqual(fixture.homeHelpsCount, 1);
  assert.strictEqual(fixture.awayHelpsCount, 2);
}

// Neutral participants counted correctly (mixed / no strong angle)
{
  const exposure = buildKnockoutMatchExposure({
    matches: [braVsJpn],
    completeParticipantBrackets: [
      { participantId: "p1", slots: [slot({ predictionKind: "champion", teamId: "team-bra" })] },
      {
        participantId: "p2",
        slots: [
          slot({ predictionKind: "round_of_16", teamId: "team-bra", rowKey: "r16-bra" }),
          slot({ predictionKind: "round_of_16", teamId: "team-jpn", rowKey: "r16-jpn" }),
        ],
      },
      { participantId: "p3", slots: [slot({ predictionKind: "champion", teamId: "team-esp" })] },
    ],
    teams,
  });

  const fixture = exposure.fixtures[0];
  assert(fixture);
  assert.strictEqual(fixture.homeHelpsCount, 1);
  assert.strictEqual(fixture.awayHelpsCount, 0);
  assert.strictEqual(fixture.neutralCount, 2);
}

// Incomplete/null brackets ignored
{
  const exposure = buildKnockoutMatchExposure({
    matches: [braVsJpn],
    completeParticipantBrackets: [
      { participantId: "p1", slots: [slot({ predictionKind: "champion", teamId: "team-bra" })] },
    ],
    teams,
    incompleteCount: 2,
  });

  assert.strictEqual(exposure.totalCompletedBrackets, 1);
  assert.strictEqual(exposure.incompleteCount, 2);
  assert.strictEqual(exposure.fixtures[0]?.homeHelpsCount, 1);
}

// Finished matches omitted
{
  const finished = knockoutMatch({
    match_id: "m-done",
    match_code: "M99",
    status: "finished",
    home_goals: 2,
    away_goals: 1,
    winner_country_code: "BRA",
    winner_team_name: "Brazil",
  });
  const exposure = buildKnockoutMatchExposure({
    matches: [finished, braVsJpn],
    completeParticipantBrackets: [
      { participantId: "p1", slots: [slot({ predictionKind: "champion", teamId: "team-bra" })] },
    ],
    teams,
  });

  assert.strictEqual(exposure.fixtures.length, 1);
  assert.strictEqual(exposure.fixtures[0]?.matchId, "m-1");
}

// Unknown team fixtures omitted
{
  const unknown = knockoutMatch({
    match_id: "m-tbd",
    match_code: "M100",
    home_team_name: "TBD",
    home_country_code: null,
  });
  const exposure = buildKnockoutMatchExposure({
    matches: [unknown, braVsJpn],
    completeParticipantBrackets: [
      { participantId: "p1", slots: [slot({ predictionKind: "champion", teamId: "team-bra" })] },
    ],
    teams,
  });

  assert.strictEqual(exposure.fixtures.length, 1);
  assert.strictEqual(exposure.fixtures[0]?.matchId, "m-1");
}

// Swing label classification
{
  assert.strictEqual(
    classifyMatchExposureSwing({ homeHelpsCount: 40, awayHelpsCount: 10, totalCompletedBrackets: 100 }),
    "big",
  );
  assert.strictEqual(
    classifyMatchExposureSwing({ homeHelpsCount: 25, awayHelpsCount: 20, totalCompletedBrackets: 100 }),
    "medium",
  );
  assert.strictEqual(
    classifyMatchExposureSwing({ homeHelpsCount: 5, awayHelpsCount: 4, totalCompletedBrackets: 100 }),
    "small",
  );
  assert.strictEqual(
    classifyMatchExposureSwing({ homeHelpsCount: 0, awayHelpsCount: 0, totalCompletedBrackets: 10 }),
    null,
  );
}

// Sorting stable by kickoff then match code; live first
{
  const live = knockoutMatch({
    match_id: "m-live",
    match_code: "M80",
    status: "live",
    kickoff_at: "2026-07-10T20:00:00.000Z",
  });
  const sorted = sortKnockoutExposureMatches([espVsJpn, braVsJpn, live]);
  assert.deepStrictEqual(
    sorted.map((m) => m.match_id),
    ["m-live", "m-1", "m-2"],
  );
  assert.strictEqual(isEligibleKnockoutExposureMatch(live, teams), true);
}

// Match exposure includes only limited name previews
{
  const leaderboardRows = [
    {
      poolId: "pool-1",
      poolName: "Pool",
      participantId: "p1",
      displayName: "Emil",
      totalPoints: 62,
      rank: 1,
    },
    {
      poolId: "pool-1",
      poolName: "Pool",
      participantId: "p2",
      displayName: "Fraser",
      totalPoints: 60,
      rank: 2,
    },
    {
      poolId: "pool-1",
      poolName: "Pool",
      participantId: "p3",
      displayName: "Hidden",
      totalPoints: 55,
      rank: 3,
    },
    {
      poolId: "pool-1",
      poolName: "Pool",
      participantId: "p4",
      displayName: "Neal",
      totalPoints: 54,
      rank: 4,
    },
    {
      poolId: "pool-1",
      poolName: "Pool",
      participantId: "p5",
      displayName: "Vinay",
      totalPoints: 53,
      rank: 5,
    },
    {
      poolId: "pool-1",
      poolName: "Pool",
      participantId: "p6",
      displayName: "Dipa",
      totalPoints: 52,
      rank: 6,
    },
    {
      poolId: "pool-1",
      poolName: "Pool",
      participantId: "p7",
      displayName: "Joel",
      totalPoints: 51,
      rank: 7,
    },
  ];
  const visibleRows = leaderboardRows.filter((row) => row.participantId !== "p3");
  const nameContext = {
    ...buildLeaderboardNameContext(visibleRows),
    namePreviewLimit: 3,
  };

  const exposure = buildKnockoutMatchExposure({
    matches: [braVsJpn],
    completeParticipantBrackets: [
      { participantId: "p1", slots: [slot({ predictionKind: "champion", teamId: "team-bra" })] },
      { participantId: "p2", slots: [slot({ predictionKind: "champion", teamId: "team-bra" })] },
      { participantId: "p3", slots: [slot({ predictionKind: "champion", teamId: "team-bra" })] },
      { participantId: "p4", slots: [slot({ predictionKind: "champion", teamId: "team-bra" })] },
      { participantId: "p5", slots: [slot({ predictionKind: "champion", teamId: "team-bra" })] },
      { participantId: "p6", slots: [slot({ predictionKind: "champion", teamId: "team-jpn" })] },
      { participantId: "p7", slots: [slot({ predictionKind: "champion", teamId: "team-jpn" })] },
    ],
    teams,
    nameContext,
  });

  const fixture = exposure.fixtures[0];
  assert(fixture);
  assert.strictEqual(fixture.homeHelpsCount, 5);
  assert.strictEqual(fixture.awayHelpsCount, 2);
  assert.strictEqual(fixture.homeParticipantNamesPreview.length, 3);
  assert.strictEqual(fixture.homeAdditionalCount, 1);
  assert.deepStrictEqual(fixture.awayParticipantNamesPreview, ["Dipa", "Joel"]);
  assert.strictEqual(fixture.awayAdditionalCount, 0);
  assert.ok(!fixture.homeParticipantNamesPreview.includes("Hidden"));
}

console.log("buildKnockoutMatchExposure.selftest.ts: all passed");
