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

// Viewer outside top 10 included
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

  assert.strictEqual(outlook.rows.length, RACE_OUTLOOK_TOP_N + 1);
  assert.strictEqual(outlook.rows[outlook.rows.length - 1]?.participantId, "p12");
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
