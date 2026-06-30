import assert from "node:assert/strict";
import {
  formatLeaderboardRaceSummary,
  formatTopRemainingPickLine,
  mapRaceOutlookByParticipantId,
  raceOutlookDetailExplanation,
  raceOutlookExpandedFallbackCopy,
} from "./leaderboardRaceRowContext";

const outlookRow = {
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
      predictionKind: "champion" as const,
      teamId: "team-fra",
      teamName: "France",
      shortLabel: "champion",
    },
    {
      predictionKind: "finalist" as const,
      teamId: "team-eng",
      teamName: "England",
      shortLabel: "finalist",
    },
  ],
  statusLabel: "Leading" as const,
};

// Race outlook row data maps by participant id
{
  const map = mapRaceOutlookByParticipantId({ rows: [outlookRow] });
  assert.equal(map.get("p1")?.displayName, "Emil");
  assert.equal(map.size, 1);
}

// Compact summary under participant names uses path-valid count
{
  assert.equal(
    formatLeaderboardRaceSummary(outlookRow),
    "62 pts · France champion alive · 11 live paths",
  );
  assert.equal(
    formatLeaderboardRaceSummary({
      ...outlookRow,
      participantId: "p2",
      displayName: "Vinay Menon",
      totalPoints: 59,
      championTeamName: "Netherlands",
      championAlive: false,
      statusLabel: "Champion dead",
      pathValidLivePickCount: 2,
    }),
    "59 pts · Champion dead · 2 live paths",
  );
  assert.equal(
    formatLeaderboardRaceSummary({
      ...outlookRow,
      hasChampionPick: false,
      championAlive: false,
      championTeamName: null,
      pathValidLivePickCount: 1,
    }),
    "62 pts · No champion pick · 1 live path",
  );
}

// Top remaining pick lines for expanded details
{
  assert.equal(
    formatTopRemainingPickLine(outlookRow.topRemainingPicks[0]!),
    "France champion",
  );
  assert.equal(
    formatTopRemainingPickLine(outlookRow.topRemainingPicks[1]!),
    "England finalist",
  );
}

// Leaderboard still works without race outlook data
{
  const map = mapRaceOutlookByParticipantId(null);
  assert.equal(map.size, 0);
  assert.equal(formatLeaderboardRaceSummary(outlookRow).includes("pts"), true);
}

// Expanded fallback when no top picks remain
{
  assert.equal(
    raceOutlookExpandedFallbackCopy({
      ...outlookRow,
      topRemainingPicks: [],
      pathValidLivePickCount: 0,
      statusLabel: "Long shot",
    }),
    "No major live knockout paths remain.",
  );
}

// Detail explanation for status labels
{
  assert.match(
    raceOutlookDetailExplanation({
      ...outlookRow,
      statusLabel: "In contention",
    }),
    /striking distance/i,
  );
}

console.log("leaderboardRaceRowContext.selftest.ts: all passed");
