/**
 * Bonus pick standing status + shared standings builder selftests.
 * Run: npx tsx lib/leaderboard/formatBonusPickStandingStatus.selftest.ts
 */
import assert from "node:assert/strict";
import {
  buildTournamentPickStandingLines,
  formatBonusPickStandingStatus,
} from "./formatBonusPickStandingStatus";
import {
  buildTournamentBonusStandings,
  type BonusCategoryStanding,
  type TournamentBonusStandings,
} from "@/lib/tournament/matchTeamStats/buildTournamentBonusStandings";
import { firstPlaceTeamStatLeaders } from "@/lib/tournament/matchTeamStats/deriveTeamStatTotals";
import type { RemainingTournamentPick } from "@/lib/pool/buildParticipantRaceOutlook";

const teamInfo = new Map([
  ["spain", { name: "Spain", countryCode: "ESP" }],
  ["france", { name: "France", countryCode: "FRA" }],
  ["mexico", { name: "Mexico", countryCode: "MEX" }],
  ["argentina", { name: "Argentina", countryCode: "ARG" }],
  ["uruguay", { name: "Uruguay", countryCode: "URU" }],
  [
    "long",
    {
      name: "WinnerWinnerChickenDinner United",
      countryCode: "WWW",
    },
  ],
]);

function standing(input: {
  leaders: Array<{ teamId: string; teamName: string; total: number }>;
  totalsByTeamId: Record<string, number>;
  isAvailable?: boolean;
}): BonusCategoryStanding {
  return {
    leaders: input.leaders,
    totalsByTeamId: input.totalsByTeamId,
    isAvailable: input.isAvailable ?? input.leaders.length > 0,
  };
}

function soleSpainGoals(): BonusCategoryStanding {
  return standing({
    leaders: [{ teamId: "spain", teamName: "Spain", total: 17 }],
    totalsByTeamId: { spain: 17, france: 10, mexico: 14, argentina: 8 },
  });
}

// 1. Sole leader
assert.equal(
  formatBonusPickStandingStatus({
    participantTeamId: "spain",
    standing: soleSpainGoals(),
  }),
  "Currently leading with 17",
);

// 2. Tied leader
assert.equal(
  formatBonusPickStandingStatus({
    participantTeamId: "uruguay",
    standing: standing({
      leaders: [
        { teamId: "spain", teamName: "Spain", total: 2 },
        { teamId: "uruguay", teamName: "Uruguay", total: 2 },
      ],
      totalsByTeamId: { spain: 2, uruguay: 2, mexico: 1 },
    }),
  }),
  "Tied for the lead with 2",
);

// 3. Participant one or more behind a sole leader
assert.equal(
  formatBonusPickStandingStatus({
    participantTeamId: "argentina",
    standing: standing({
      leaders: [{ teamId: "mexico", teamName: "Mexico", total: 14 }],
      totalsByTeamId: { mexico: 14, argentina: 12, spain: 10 },
    }),
  }),
  "2 behind current leader Mexico (14)",
);

// 4. Multiple tied leaders (two named)
assert.equal(
  formatBonusPickStandingStatus({
    participantTeamId: "france",
    standing: standing({
      leaders: [
        { teamId: "argentina", teamName: "Argentina", total: 17 },
        { teamId: "spain", teamName: "Spain", total: 17 },
      ],
      totalsByTeamId: { spain: 17, argentina: 17, france: 16 },
    }),
  }),
  "1 behind current leaders Argentina and Spain (17)",
);

// 4b. More than two tied leaders
assert.equal(
  formatBonusPickStandingStatus({
    participantTeamId: "france",
    standing: standing({
      leaders: [
        { teamId: "argentina", teamName: "Argentina", total: 17 },
        { teamId: "mexico", teamName: "Mexico", total: 17 },
        { teamId: "spain", teamName: "Spain", total: 17 },
      ],
      totalsByTeamId: { spain: 17, argentina: 17, mexico: 17, france: 16 },
    }),
  }),
  "1 behind 3 tied leaders (17)",
);

// 5. Participant team total of zero
assert.equal(
  formatBonusPickStandingStatus({
    participantTeamId: "uruguay",
    standing: standing({
      leaders: [{ teamId: "mexico", teamName: "Mexico", total: 3 }],
      totalsByTeamId: { mexico: 3 },
    }),
  }),
  "3 behind current leader Mexico (3)",
);

// 6. Missing participant pick — no comparison line
assert.equal(
  formatBonusPickStandingStatus({
    participantTeamId: null,
    standing: soleSpainGoals(),
  }),
  null,
);
assert.equal(
  formatBonusPickStandingStatus({
    participantTeamId: "   ",
    standing: soleSpainGoals(),
  }),
  null,
);

// 7. Unavailable tournament standings
assert.equal(
  formatBonusPickStandingStatus({
    participantTeamId: "spain",
    standing: null,
  }),
  "Current standings unavailable",
);
assert.equal(
  formatBonusPickStandingStatus({
    participantTeamId: "spain",
    standing: standing({
      leaders: [],
      totalsByTeamId: {},
      isAvailable: false,
    }),
  }),
  "Current standings unavailable",
);

// 8. Long team names keep full wording (no truncation in helper)
{
  const line = formatBonusPickStandingStatus({
    participantTeamId: "france",
    standing: standing({
      leaders: [
        {
          teamId: "long",
          teamName: "WinnerWinnerChickenDinner United",
          total: 9,
        },
      ],
      totalsByTeamId: { long: 9, france: 4 },
    }),
  });
  assert.equal(
    line,
    "5 behind current leader WinnerWinnerChickenDinner United (9)",
  );
}

// 9. Page-level standings: champion unchanged; bonus lines derived in memory (no queries)
{
  const standings: TournamentBonusStandings = {
    most_goals: soleSpainGoals(),
    most_yellow_cards: standing({
      leaders: [{ teamId: "mexico", teamName: "Mexico", total: 14 }],
      totalsByTeamId: { mexico: 14, argentina: 12 },
    }),
    most_red_cards: standing({
      leaders: [
        { teamId: "spain", teamName: "Spain", total: 2 },
        { teamId: "uruguay", teamName: "Uruguay", total: 2 },
      ],
      totalsByTeamId: { spain: 2, uruguay: 2 },
    }),
  };

  const picks: RemainingTournamentPick[] = [
    { key: "champion", teamId: "spain", teamName: "Spain" },
    { key: "most_goals", teamId: "spain", teamName: "Spain" },
    { key: "most_yellow_cards", teamId: "argentina", teamName: "Argentina" },
    { key: "most_red_cards", teamId: "uruguay", teamName: "Uruguay" },
  ];

  const lines = buildTournamentPickStandingLines({ picks, standings });
  assert.deepEqual(
    lines.map((row) => [row.pickKey, row.statusLine]),
    [
      ["champion", null],
      ["most_goals", "Currently leading with 17"],
      ["most_yellow_cards", "2 behind current leader Mexico (14)"],
      ["most_red_cards", "Tied for the lead with 2"],
    ],
  );

  // Missing pick on a bonus category — no status
  const missing = buildTournamentPickStandingLines({
    picks: [
      { key: "champion", teamId: "spain", teamName: "Spain" },
      { key: "most_goals", teamId: null, teamName: null },
    ],
    standings,
  });
  assert.equal(missing[1]?.statusLine, null);

  // Null page standings → unavailable for filled bonus picks only
  const unavailable = buildTournamentPickStandingLines({
    picks,
    standings: null,
  });
  assert.equal(unavailable[0]?.statusLine, null);
  assert.equal(unavailable[1]?.statusLine, "Current standings unavailable");
}

// 10. Shared builder uses same totals/leaders path as Bonus Watch (deriveTeamStatTotals)
{
  const matches = [
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
      awayTeamId: "mexico",
      homeGoals: 2,
      awayGoals: 0,
    },
  ] as const;
  const teamStats = [
    {
      id: "s1",
      editionId: "ed",
      matchId: "m1",
      teamId: "argentina",
      yellowCards: 4,
      redCards: 1,
      source: "manual" as const,
    },
    {
      id: "s2",
      editionId: "ed",
      matchId: "m2",
      teamId: "mexico",
      yellowCards: 2,
      redCards: 2,
      source: "manual" as const,
    },
  ];

  const standings = buildTournamentBonusStandings({
    matches,
    teamStats,
    teamInfoById: teamInfo,
  });

  assert.equal(standings.most_goals.isAvailable, true);
  assert.equal(standings.most_goals.totalsByTeamId.spain, 5);
  assert.equal(standings.most_goals.leaders[0]?.teamId, "spain");
  assert.equal(standings.most_goals.leaders[0]?.teamName, "Spain");

  assert.equal(standings.most_yellow_cards.totalsByTeamId.argentina, 4);
  assert.equal(standings.most_yellow_cards.leaders[0]?.teamId, "argentina");

  assert.equal(standings.most_red_cards.totalsByTeamId.mexico, 2);
  assert.equal(standings.most_red_cards.leaders[0]?.teamId, "mexico");

  // Tie handling matches firstPlaceTeamStatLeaders
  const yellowTotals = new Map(
    Object.entries(standings.most_yellow_cards.totalsByTeamId),
  );
  assert.deepEqual(
    standings.most_yellow_cards.leaders.map((l) => l.teamId),
    firstPlaceTeamStatLeaders(yellowTotals).map((l) => l.teamId),
  );

  // Empty category unavailable
  const empty = buildTournamentBonusStandings({
    matches: [],
    teamStats: [],
    teamInfoById: teamInfo,
  });
  assert.equal(empty.most_goals.isAvailable, false);
  assert.equal(empty.most_yellow_cards.isAvailable, false);
  assert.equal(empty.most_red_cards.isAvailable, false);
}

console.log("formatBonusPickStandingStatus.selftest.ts: all passed");
