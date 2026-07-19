import assert from "node:assert/strict";
import {
  compareLivePathsToLeader,
  expandedTopRemainingPicks,
  formatExpandedRemainingPicksMoreLine,
  formatLeaderboardRaceSummary,
  formatRaceOutlookLeaderComparison,
  formatRemainingTournamentPicksDisplay,
  formatTopRemainingPickLine,
  mapRaceOutlookByParticipantId,
  raceOutlookDetailExplanation,
  raceOutlookExpandedFallbackCopy,
} from "./leaderboardRaceRowContext";
import type { ParticipantRaceOutlookRow } from "@/lib/pool/buildParticipantRaceOutlook";

function outlookRow(
  overrides: Partial<ParticipantRaceOutlookRow> = {},
): ParticipantRaceOutlookRow {
  return {
    participantId: "p1",
    displayName: "Emil",
    rank: 1,
    totalPoints: 62,
    championTeamName: "France",
    championTeamCode: "FRA",
    championAlive: true,
    hasChampionPick: true,
    pathValidLivePickCount: 11,
    topRemainingPicks: [
      {
        predictionKind: "champion",
        teamId: "team-fra",
        teamName: "France",
        shortLabel: "champion",
      },
      {
        predictionKind: "finalist",
        teamId: "team-eng",
        teamName: "England",
        shortLabel: "finalist",
      },
    ],
    remainingTournamentPicks: [
      { key: "champion", teamId: "team-fra", teamName: "France" },
      { key: "most_goals", teamId: "team-fra", teamName: "France" },
      { key: "most_yellow_cards", teamId: "team-arg", teamName: "Argentina" },
      { key: "most_red_cards", teamId: "team-mex", teamName: "Mexico" },
    ],
    statusLabel: "Leading",
    leaderDisplayName: "Emil",
    leaderLivePathCount: 11,
    pointsBehindLeader: 0,
    showRaceStatus: true,
    ...overrides,
  };
}

const baseOutlook = outlookRow();

// Race outlook row data maps by participant id
{
  const map = mapRaceOutlookByParticipantId({ rows: [baseOutlook] });
  assert.equal(map.get("p1")?.displayName, "Emil");
  assert.equal(map.size, 1);
}

// Compact summary omits missing champion pick
{
  assert.equal(
    formatLeaderboardRaceSummary(baseOutlook),
    "62 pts · 11 live paths · Champion alive",
  );
  assert.equal(
    formatLeaderboardRaceSummary(
      outlookRow({
        participantId: "p2",
        displayName: "Vinay Menon",
        totalPoints: 59,
        championTeamName: "Netherlands",
        championAlive: false,
        statusLabel: "Champion dead",
        pathValidLivePickCount: 2,
      }),
    ),
    "59 pts · 2 live paths · Champion dead",
  );
  assert.equal(
    formatLeaderboardRaceSummary(
      outlookRow({
        hasChampionPick: false,
        championAlive: false,
        championTeamName: null,
        pathValidLivePickCount: 23,
      }),
    ),
    "62 pts · 23 live paths",
  );
}

// Top remaining pick lines for expanded details
{
  assert.equal(
    formatTopRemainingPickLine(baseOutlook.topRemainingPicks[0]!),
    "France champion",
  );
  assert.equal(
    formatTopRemainingPickLine(baseOutlook.topRemainingPicks[1]!),
    "England finalist",
  );
}

// Expanded top picks limited to 3
{
  const picks = Array.from({ length: 5 }, (_, index) => ({
    predictionKind: "finalist" as const,
    teamId: `team-${index}`,
    teamName: `Team ${index}`,
    shortLabel: "finalist",
  }));
  const expanded = expandedTopRemainingPicks(
    outlookRow({
      topRemainingPicks: picks,
      pathValidLivePickCount: 7,
    }),
  );
  assert.equal(expanded.length, 3);
  assert.equal(expanded[0]?.teamName, "Team 0");
}

// +N more live paths when path count exceeds displayed limit
{
  assert.equal(
    formatExpandedRemainingPicksMoreLine(
      outlookRow({
        pathValidLivePickCount: 7,
        topRemainingPicks: Array.from({ length: 5 }, (_, index) => ({
          predictionKind: "finalist" as const,
          teamId: `team-${index}`,
          teamName: `Team ${index}`,
          shortLabel: "finalist",
        })),
      }),
    ),
    "+4 more live paths",
  );
  assert.equal(
    formatExpandedRemainingPicksMoreLine(
      outlookRow({ pathValidLivePickCount: 3 }),
    ),
    null,
  );
  assert.equal(
    formatExpandedRemainingPicksMoreLine(
      outlookRow({ pathValidLivePickCount: 4 }),
    ),
    "+1 more live path",
  );
}

// Leader comparison text
{
  assert.equal(
    formatRaceOutlookLeaderComparison(baseOutlook),
    "Currently leading the pool with 11 live paths remaining.",
  );
  assert.equal(
    formatRaceOutlookLeaderComparison(
      outlookRow({
        rank: 2,
        displayName: "Fraser",
        totalPoints: 60,
        pointsBehindLeader: 2,
        pathValidLivePickCount: 26,
        leaderDisplayName: "Emil",
        leaderLivePathCount: 23,
        statusLabel: "Close behind",
      }),
    ),
    "Trailing Emil by 2 pts, with more live paths remaining.",
  );
  assert.equal(
    formatRaceOutlookLeaderComparison(
      outlookRow({
        rank: 2,
        displayName: "Fraser",
        totalPoints: 56,
        pointsBehindLeader: 6,
        pathValidLivePickCount: 22,
        leaderDisplayName: "Emil",
        leaderLivePathCount: 23,
        statusLabel: "Close behind",
      }),
    ),
    "Trailing Emil by 6 pts, with similar live paths remaining.",
  );
  assert.equal(
    formatRaceOutlookLeaderComparison(
      outlookRow({
        rank: 3,
        displayName: "Vinay",
        totalPoints: 50,
        pointsBehindLeader: 12,
        pathValidLivePickCount: 18,
        leaderDisplayName: "Emil",
        leaderLivePathCount: 23,
        statusLabel: "In contention",
      }),
    ),
    "Trailing Emil by 12 pts, with fewer live paths remaining.",
  );
  assert.equal(
    formatRaceOutlookLeaderComparison(
      outlookRow({
        rank: 2,
        displayName: "Fraser",
        totalPoints: 60,
        pointsBehindLeader: 2,
        pathValidLivePickCount: 26,
        leaderDisplayName: "Emil",
        leaderLivePathCount: null,
        statusLabel: "Close behind",
      }),
    ),
    "Trailing Emil by 2 pts.",
  );
}

// Live path comparison helper
{
  assert.equal(
    compareLivePathsToLeader({
      participantLivePathCount: 26,
      leaderLivePathCount: 23,
    }),
    "more",
  );
  assert.equal(
    compareLivePathsToLeader({
      participantLivePathCount: 22,
      leaderLivePathCount: 23,
    }),
    "similar",
  );
  assert.equal(
    compareLivePathsToLeader({
      participantLivePathCount: 18,
      leaderLivePathCount: 23,
    }),
    "fewer",
  );
}

// Leaderboard still works without race outlook data
{
  const map = mapRaceOutlookByParticipantId(null);
  assert.equal(map.size, 0);
  assert.equal(formatLeaderboardRaceSummary(baseOutlook).includes("pts"), true);
}

// Expanded fallback when no top picks remain
{
  assert.equal(
    raceOutlookExpandedFallbackCopy(
      outlookRow({
        topRemainingPicks: [],
        pathValidLivePickCount: 0,
        statusLabel: "Long shot",
      }),
    ),
    "No major live knockout paths remain.",
  );
}

// Detail explanation for status labels
{
  assert.match(
    raceOutlookDetailExplanation(
      outlookRow({ statusLabel: "In contention" }),
    ),
    /striking distance/i,
  );
  assert.match(
    raceOutlookDetailExplanation(
      outlookRow({ statusLabel: "Close behind" }),
    ),
    /few points/i,
  );
}

// Remaining tournament picks display (Details section)
{
  const display = formatRemainingTournamentPicksDisplay(
    baseOutlook.remainingTournamentPicks,
  );
  assert.equal(display.length, 4);
  assert.deepEqual(
    display.map((row) => [row.key, row.icon, row.label, row.teamName]),
    [
      ["champion", "🏆", "Champion", "France"],
      ["most_goals", "⚽", "Most Goals", "France"],
      ["most_yellow_cards", "🟨", "Most Yellow Cards", "Argentina"],
      ["most_red_cards", "🟥", "Most Red Cards", "Mexico"],
    ],
  );
  // Display labels stay short for compact two-column mobile layout
  assert.ok(
    display.every((row) => row.label.length <= "Most Yellow Cards".length),
  );
  assert.deepEqual(
    formatRemainingTournamentPicksDisplay(undefined).map((row) => row.teamName),
    ["—", "—", "—", "—"],
  );
  assert.deepEqual(
    formatRemainingTournamentPicksDisplay([
      { key: "champion", teamId: null, teamName: null },
    ]).map((row) => row.teamName),
    ["—", "—", "—", "—"],
  );
}

console.log("leaderboardRaceRowContext.selftest.ts: all passed");
