import assert from "node:assert";
import type { ChampionPickInput } from "@/lib/account/buildPoolReveal";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { LeaderboardPublicRow } from "../../types/leaderboard";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  buildParticipantRaceOutlook,
  countLiveKnockoutPicksRemaining,
  resolveChampionPickForParticipant,
  resolveRaceOutlookStatus,
  resolveRemainingTournamentPicks,
  RACE_OUTLOOK_TOP_N,
} from "./buildParticipantRaceOutlook";

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

function leaderboardRow(
  participantId: string,
  displayName: string,
  rank: number,
  totalPoints: number,
): LeaderboardPublicRow {
  return {
    poolId: "pool-1",
    poolName: "Test Pool",
    participantId,
    displayName,
    totalPoints,
    rank,
  };
}

function team(id: string, name: string, code: string): Team {
  return {
    id,
    name,
    countryCode: code,
    fifaCode: code,
    fifaRank: null,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  };
}

const teams = [
  team("team-fra", "France", "FRA"),
  team("team-bra", "Brazil", "BRA"),
  team("team-dead", "Netherlands", "NED"),
];

const baseOutlookInput = {
  teams,
  tournamentMatches: [] as TournamentMatchPublicRow[],
  knockoutBracketPicksUnlocked: false,
  eliminatedTeamIds: new Set<string>(),
  championPicks: [] as ChampionPickInput[],
};

// Champion fallback from bracket slot when championPicks entry is missing
{
  const resolved = resolveChampionPickForParticipant({
    participantId: "p1",
    championPicks: [],
    bracketSlots: [slot({ predictionKind: "champion", teamId: "team-fra" })],
    teams,
  });
  assert.strictEqual(resolved.hasChampionPick, true);
  assert.strictEqual(resolved.teamName, "France");

  const outlook = buildParticipantRaceOutlook({
    ...baseOutlookInput,
    leaderboardRows: [leaderboardRow("p1", "Emil", 1, 62)],
    participantBrackets: [
      {
        participantId: "p1",
        slots: [slot({ predictionKind: "champion", teamId: "team-fra" })],
      },
    ],
  });

  const row = outlook.rows[0];
  assert(row);
  assert.strictEqual(row.hasChampionPick, true);
  assert.strictEqual(row.championTeamName, "France");
  assert.strictEqual(row.remainingTournamentPicks[0]?.teamName, "France");
  assert.strictEqual(row.remainingTournamentPicks[1]?.teamName, null);
}

// Remaining tournament picks include bonus teams from slots
{
  const resolved = resolveRemainingTournamentPicks({
    champion: {
      teamId: "team-fra",
      teamName: "France",
      teamCode: "FRA",
      hasChampionPick: true,
    },
    bracketSlots: [
      slot({ predictionKind: "champion", teamId: "team-fra" }),
      slot({
        predictionKind: "bonus_pick",
        teamId: "team-bra",
        bonusKey: "most_goals",
        rowKey: "bonus:most_goals",
      }),
      slot({
        predictionKind: "bonus_pick",
        teamId: "team-dead",
        bonusKey: "most_yellow_cards",
        rowKey: "bonus:most_yellow_cards",
      }),
    ],
    teams,
  });
  assert.deepStrictEqual(
    resolved.map((pick) => [pick.key, pick.teamName]),
    [
      ["champion", "France"],
      ["most_goals", "Brazil"],
      ["most_yellow_cards", "Netherlands"],
      ["most_red_cards", null],
    ],
  );

  const outlook = buildParticipantRaceOutlook({
    ...baseOutlookInput,
    leaderboardRows: [leaderboardRow("p1", "Emil", 1, 62)],
    participantBrackets: [
      {
        participantId: "p1",
        slots: [
          slot({ predictionKind: "champion", teamId: "team-fra" }),
          slot({
            predictionKind: "bonus_pick",
            teamId: "team-bra",
            bonusKey: "most_goals",
            rowKey: "bonus:most_goals",
          }),
          slot({
            predictionKind: "bonus_pick",
            teamId: "team-dead",
            bonusKey: "most_yellow_cards",
            rowKey: "bonus:most_yellow_cards",
          }),
          slot({
            predictionKind: "bonus_pick",
            teamId: "team-fra",
            bonusKey: "most_red_cards",
            rowKey: "bonus:most_red_cards",
          }),
        ],
      },
    ],
  });
  const row = outlook.rows[0];
  assert(row);
  assert.deepStrictEqual(
    row.remainingTournamentPicks.map((pick) => pick.teamName),
    ["France", "Brazil", "Netherlands", "France"],
  );
}

// Live champion marked alive
{
  const outlook = buildParticipantRaceOutlook({
    ...baseOutlookInput,
    leaderboardRows: [leaderboardRow("p1", "Emil", 1, 62)],
    participantBrackets: [
      {
        participantId: "p1",
        slots: [
          slot({ predictionKind: "champion", teamId: "team-fra" }),
          slot({ predictionKind: "round_of_16", teamId: "team-fra", rowKey: "r16" }),
        ],
      },
    ],
    championPicks: [
      {
        participantId: "p1",
        participantDisplayName: "Emil",
        teamId: "team-fra",
        teamName: "France",
        teamCode: "FRA",
      },
    ],
    eliminatedTeamIds: new Set(["team-dead"]),
  });

  const row = outlook.rows[0];
  assert(row);
  assert.strictEqual(row.championAlive, true);
  assert.strictEqual(row.statusLabel, "Leading");
}

// Eliminated champion marked dead
{
  const outlook = buildParticipantRaceOutlook({
    ...baseOutlookInput,
    leaderboardRows: [leaderboardRow("p1", "Vinay", 3, 59)],
    participantBrackets: [
      {
        participantId: "p1",
        slots: [slot({ predictionKind: "champion", teamId: "team-dead" })],
      },
    ],
    championPicks: [
      {
        participantId: "p1",
        participantDisplayName: "Vinay",
        teamId: "team-dead",
        teamName: "Netherlands",
        teamCode: "NED",
      },
    ],
    eliminatedTeamIds: new Set(["team-dead"]),
  });

  const row = outlook.rows[0];
  assert(row);
  assert.strictEqual(row.championAlive, false);
  assert.strictEqual(row.statusLabel, "Champion dead");
}

// Top leaderboard rows included even when not bracket-complete
{
  const leaderboardRows = [
    leaderboardRow("p1", "Emil", 1, 62),
    leaderboardRow("p2", "Ghost", 2, 60),
  ];
  const outlook = buildParticipantRaceOutlook({
    ...baseOutlookInput,
    leaderboardRows,
    participantBrackets: [
      {
        participantId: "p1",
        slots: [slot({ predictionKind: "champion", teamId: "team-fra" })],
      },
      {
        participantId: "p2",
        slots: [],
      },
    ],
    championPicks: [
      {
        participantId: "p1",
        participantDisplayName: "Emil",
        teamId: "team-fra",
        teamName: "France",
        teamCode: "FRA",
      },
    ],
  });

  assert.strictEqual(outlook.rows.length, 2);
  assert.strictEqual(outlook.rows[0]?.participantId, "p1");
  assert.strictEqual(outlook.rows[1]?.participantId, "p2");
  assert.strictEqual(outlook.rows[1]?.hasChampionPick, false);
}

// Sorting follows leaderboard rank
{
  const leaderboardRows = [
    leaderboardRow("p2", "Fraser", 2, 60),
    leaderboardRow("p1", "Emil", 1, 62),
    leaderboardRow("p3", "Vinay", 3, 59),
  ];
  const outlook = buildParticipantRaceOutlook({
    ...baseOutlookInput,
    leaderboardRows,
    participantBrackets: leaderboardRows.map((row) => ({
      participantId: row.participantId,
      slots: [slot({ predictionKind: "champion", teamId: "team-fra" })],
    })),
    championPicks: leaderboardRows.map((row) => ({
      participantId: row.participantId,
      participantDisplayName: row.displayName,
      teamId: "team-fra",
      teamName: "France",
      teamCode: "FRA",
    })),
  });

  assert.deepStrictEqual(
    outlook.rows.map((row) => row.displayName),
    ["Emil", "Fraser", "Vinay"],
  );
}

// Viewer outside top 10 included with full race status; others still get Details
{
  const leaderboardRows = Array.from({ length: 12 }, (_, index) =>
    leaderboardRow(`p${index + 1}`, `Player ${index + 1}`, index + 1, 100 - index),
  );
  const participantBrackets = leaderboardRows.map((row) => ({
    participantId: row.participantId,
    slots: [slot({ predictionKind: "champion", teamId: "team-fra" })],
  }));
  const outlook = buildParticipantRaceOutlook({
    ...baseOutlookInput,
    leaderboardRows,
    participantBrackets,
    championPicks: leaderboardRows.map((row) => ({
      participantId: row.participantId,
      participantDisplayName: row.displayName,
      teamId: "team-fra",
      teamName: "France",
      teamCode: "FRA",
    })),
    viewerParticipantId: "p12",
  });

  assert.strictEqual(outlook.rows.length, 12);
  const byId = new Map(outlook.rows.map((row) => [row.participantId, row]));
  assert.strictEqual(byId.get("p1")?.showRaceStatus, true);
  assert.strictEqual(byId.get("p10")?.showRaceStatus, true);
  assert.strictEqual(byId.get("p11")?.showRaceStatus, false);
  assert.strictEqual(byId.get("p12")?.showRaceStatus, true);
  assert.ok(byId.get("p11")?.remainingTournamentPicks.length === 4);
  assert.ok(byId.get("p12")?.remainingTournamentPicks.length === 4);
}

// Every ranked participant gets Details picks; race status stays top-N (+ viewer)
{
  const leaderboardRows = Array.from({ length: 15 }, (_, index) =>
    leaderboardRow(`p${index + 1}`, `Player ${index + 1}`, index + 1, 100 - index),
  );
  // Tied pair at rank 8
  leaderboardRows[7] = leaderboardRow("p8a", "Tied A", 8, 93);
  leaderboardRows[8] = leaderboardRow("p8b", "Tied B", 8, 93);
  const participantBrackets = leaderboardRows.map((row) => ({
    participantId: row.participantId,
    slots:
      row.participantId === "p15"
        ? []
        : [
            slot({ predictionKind: "champion", teamId: "team-fra" }),
            slot({
              predictionKind: "bonus_pick",
              bonusKey: "most_goals",
              teamId: "team-bra",
              rowKey: `goals-${row.participantId}`,
            }),
          ],
  }));
  const outlook = buildParticipantRaceOutlook({
    ...baseOutlookInput,
    leaderboardRows,
    participantBrackets,
    championPicks: leaderboardRows
      .filter((row) => row.participantId !== "p15")
      .map((row) => ({
        participantId: row.participantId,
        participantDisplayName: row.displayName,
        teamId: "team-fra",
        teamName: "France",
        teamCode: "FRA",
      })),
  });

  assert.strictEqual(outlook.rows.length, 15);
  const byId = new Map(outlook.rows.map((row) => [row.participantId, row]));

  assert.strictEqual(byId.get("p1")?.showRaceStatus, true);
  assert.strictEqual(byId.get("p1")?.remainingTournamentPicks[0]?.teamName, "France");

  assert.strictEqual(byId.get("p11")?.showRaceStatus, false);
  assert.strictEqual(byId.get("p11")?.remainingTournamentPicks[0]?.teamName, "France");

  assert.strictEqual(byId.get("p15")?.showRaceStatus, false);
  assert.strictEqual(byId.get("p15")?.hasChampionPick, false);
  assert.ok(
    byId.get("p15")?.remainingTournamentPicks.every((pick) => pick.teamName == null),
  );

  assert.strictEqual(byId.get("p8a")?.showRaceStatus, true);
  assert.strictEqual(byId.get("p8b")?.showRaceStatus, true);
  assert.ok(byId.get("p8a")?.remainingTournamentPicks.length === 4);
  assert.ok(byId.get("p8b")?.remainingTournamentPicks.length === 4);

  const pathValidCount = outlook.rows.filter((row) => row.showRaceStatus).length;
  assert.strictEqual(pathValidCount, RACE_OUTLOOK_TOP_N);
}

// Status labels
{
  assert.strictEqual(
    resolveRaceOutlookStatus({
      rank: 1,
      hasChampionPick: true,
      championPathDead: false,
      pathValidLivePickCount: 9,
      pointsBehindLeader: 0,
    }),
    "Leading",
  );
  assert.strictEqual(
    resolveRaceOutlookStatus({
      rank: 2,
      hasChampionPick: true,
      championPathDead: true,
      pathValidLivePickCount: 9,
      pointsBehindLeader: 2,
    }),
    "Champion dead",
  );
  assert.strictEqual(
    resolveRaceOutlookStatus({
      rank: 2,
      hasChampionPick: true,
      championPathDead: false,
      pathValidLivePickCount: 5,
      pointsBehindLeader: 2,
    }),
    "Close behind",
  );
  assert.strictEqual(
    resolveRaceOutlookStatus({
      rank: 3,
      hasChampionPick: true,
      championPathDead: false,
      pathValidLivePickCount: 5,
      pointsBehindLeader: 6,
    }),
    "In contention",
  );
  assert.strictEqual(
    resolveRaceOutlookStatus({
      rank: 4,
      hasChampionPick: true,
      championPathDead: false,
      pathValidLivePickCount: 0,
      pointsBehindLeader: 20,
    }),
    "Long shot",
  );
  assert.strictEqual(
    resolveRaceOutlookStatus({
      rank: 5,
      hasChampionPick: true,
      championPathDead: false,
      pathValidLivePickCount: 0,
      pointsBehindLeader: 6,
    }),
    "Long shot",
  );
  assert.strictEqual(
    resolveRaceOutlookStatus({
      rank: 2,
      hasChampionPick: true,
      championPathDead: false,
      pathValidLivePickCount: 5,
      pointsBehindLeader: 4,
    }),
    "In contention",
  );
}

// Leader context attached to each row
{
  const leaderboardRows = [
    leaderboardRow("p1", "Emil", 1, 62),
    leaderboardRow("p2", "Fraser", 2, 60),
  ];
  const outlook = buildParticipantRaceOutlook({
    ...baseOutlookInput,
    leaderboardRows,
    participantBrackets: leaderboardRows.map((row) => ({
      participantId: row.participantId,
      slots: [
        slot({ predictionKind: "champion", teamId: "team-fra" }),
        slot({ predictionKind: "finalist", teamId: "team-bra", rowKey: "fin-bra" }),
      ],
    })),
    championPicks: leaderboardRows.map((row) => ({
      participantId: row.participantId,
      participantDisplayName: row.displayName,
      teamId: "team-fra",
      teamName: "France",
      teamCode: "FRA",
    })),
  });

  const leader = outlook.rows[0];
  const trailer = outlook.rows[1];
  assert(leader);
  assert(trailer);
  assert.strictEqual(leader.leaderDisplayName, "Emil");
  assert.strictEqual(leader.pointsBehindLeader, 0);
  assert.strictEqual(trailer.leaderDisplayName, "Emil");
  assert.strictEqual(trailer.pointsBehindLeader, 2);
  assert.strictEqual(trailer.leaderLivePathCount, leader.pathValidLivePickCount);
}

// Deprecated naive counter kept for regression only
{
  const slots = [
    slot({ predictionKind: "round_of_32", teamId: "team-bra", rowKey: "r32-a" }),
    slot({ predictionKind: "round_of_16", teamId: "team-fra", rowKey: "r16-b" }),
    slot({ predictionKind: "quarterfinalist", teamId: "team-dead", rowKey: "qf-dead" }),
    slot({ predictionKind: "semifinalist", teamId: "", rowKey: "sf-empty" }),
    slot({ predictionKind: "group_winner", teamId: "team-fra", rowKey: "grp" }),
  ];
  assert.strictEqual(
    countLiveKnockoutPicksRemaining(slots, new Set(["team-dead"])),
    2,
  );
}

console.log("buildParticipantRaceOutlook.selftest.ts: all passed");
