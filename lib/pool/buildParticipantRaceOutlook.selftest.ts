import assert from "node:assert";
import type { ChampionPickInput } from "@/lib/account/buildPoolReveal";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { LeaderboardPublicRow } from "../../types/leaderboard";
import {
  buildParticipantRaceOutlook,
  countLiveKnockoutPicksRemaining,
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

function championPick(
  participantId: string,
  teamId: string,
  teamName: string,
): ChampionPickInput {
  return {
    participantId,
    participantDisplayName: participantId,
    teamId,
    teamName,
    teamCode: teamName.slice(0, 3).toUpperCase(),
  };
}

const eliminated = new Set(["team-dead"]);

// Live champion marked alive
{
  const outlook = buildParticipantRaceOutlook({
    leaderboardRows: [leaderboardRow("p1", "Emil", 1, 62)],
    completeParticipantBrackets: [
      {
        participantId: "p1",
        slots: [
          slot({ predictionKind: "champion", teamId: "team-fra" }),
          slot({ predictionKind: "round_of_16", teamId: "team-fra", rowKey: "r16" }),
        ],
      },
    ],
    championPicks: [championPick("p1", "team-fra", "France")],
    eliminatedTeamIds: eliminated,
  });

  const row = outlook.rows[0];
  assert(row);
  assert.strictEqual(row.championAlive, true);
  assert.strictEqual(row.statusLabel, "Leading");
}

// Eliminated champion marked dead
{
  const outlook = buildParticipantRaceOutlook({
    leaderboardRows: [leaderboardRow("p1", "Vinay", 3, 59)],
    completeParticipantBrackets: [
      {
        participantId: "p1",
        slots: [slot({ predictionKind: "champion", teamId: "team-dead" })],
      },
    ],
    championPicks: [championPick("p1", "team-dead", "Netherlands")],
    eliminatedTeamIds: eliminated,
  });

  const row = outlook.rows[0];
  assert(row);
  assert.strictEqual(row.championAlive, false);
  assert.strictEqual(row.statusLabel, "Champion dead");
}

// Live knockout picks remaining counted correctly
{
  const slots = [
    slot({ predictionKind: "round_of_32", teamId: "team-a", rowKey: "r32-a" }),
    slot({ predictionKind: "round_of_16", teamId: "team-b", rowKey: "r16-b" }),
    slot({ predictionKind: "quarterfinalist", teamId: "team-dead", rowKey: "qf-dead" }),
    slot({ predictionKind: "semifinalist", teamId: "", rowKey: "sf-empty" }),
    slot({ predictionKind: "group_winner", teamId: "team-x", rowKey: "grp" }),
  ];
  assert.strictEqual(countLiveKnockoutPicksRemaining(slots, eliminated), 2);
}

// Incomplete brackets ignored (only complete brackets passed in)
{
  const leaderboardRows = [
    leaderboardRow("p1", "Emil", 1, 62),
    leaderboardRow("p2", "Ghost", 2, 60),
  ];
  const outlook = buildParticipantRaceOutlook({
    leaderboardRows,
    completeParticipantBrackets: [
      { participantId: "p1", slots: [slot({ predictionKind: "champion", teamId: "team-fra" })] },
    ],
    championPicks: [championPick("p1", "team-fra", "France")],
    eliminatedTeamIds: new Set(),
  });

  assert.strictEqual(outlook.rows.length, 1);
  assert.strictEqual(outlook.rows[0]?.participantId, "p1");
}

// Sorting follows leaderboard rank
{
  const leaderboardRows = [
    leaderboardRow("p2", "Fraser", 2, 60),
    leaderboardRow("p1", "Emil", 1, 62),
    leaderboardRow("p3", "Vinay", 3, 59),
  ];
  const outlook = buildParticipantRaceOutlook({
    leaderboardRows,
    completeParticipantBrackets: leaderboardRows.map((row) => ({
      participantId: row.participantId,
      slots: [slot({ predictionKind: "champion", teamId: "team-fra" })],
    })),
    championPicks: leaderboardRows.map((row) =>
      championPick(row.participantId, "team-fra", "France"),
    ),
    eliminatedTeamIds: new Set(),
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
  const completeParticipantBrackets = leaderboardRows.map((row) => ({
    participantId: row.participantId,
    slots: [slot({ predictionKind: "champion", teamId: "team-fra" })],
  }));
  const outlook = buildParticipantRaceOutlook({
    leaderboardRows,
    completeParticipantBrackets,
    championPicks: leaderboardRows.map((row) =>
      championPick(row.participantId, "team-fra", "France"),
    ),
    eliminatedTeamIds: new Set(),
    viewerParticipantId: "p12",
  });

  assert.strictEqual(outlook.rows.length, RACE_OUTLOOK_TOP_N + 1);
  assert.strictEqual(outlook.rows[outlook.rows.length - 1]?.participantId, "p12");
}

// Status labels
{
  assert.strictEqual(
    resolveRaceOutlookStatus({
      rank: 2,
      hasChampionPick: true,
      championAlive: true,
      liveKnockoutPicksRemaining: 9,
      pointsBehindLeader: 2,
    }),
    "Dangerous",
  );
  assert.strictEqual(
    resolveRaceOutlookStatus({
      rank: 4,
      hasChampionPick: true,
      championAlive: true,
      liveKnockoutPicksRemaining: 2,
      pointsBehindLeader: 10,
    }),
    "Low upside",
  );
  assert.strictEqual(
    resolveRaceOutlookStatus({
      rank: 3,
      hasChampionPick: true,
      championAlive: true,
      liveKnockoutPicksRemaining: 6,
      pointsBehindLeader: 8,
    }),
    "Chasing",
  );
}

console.log("buildParticipantRaceOutlook.selftest.ts: all passed");
