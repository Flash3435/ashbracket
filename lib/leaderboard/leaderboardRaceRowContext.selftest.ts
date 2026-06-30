import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatLeaderboardChampionDetail,
  formatLeaderboardRaceSummary,
  mapRaceOutlookByParticipantId,
  raceOutlookDetailExplanation,
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
  liveKnockoutPicksRemaining: 53,
  statusLabel: "Leading" as const,
};

// Race outlook row data maps by participant id
{
  const map = mapRaceOutlookByParticipantId({ rows: [outlookRow] });
  assert.equal(map.get("p1")?.displayName, "Emil");
  assert.equal(map.size, 1);
}

// Compact summary under participant names
{
  assert.equal(
    formatLeaderboardRaceSummary(outlookRow),
    "62 pts · France champion alive · 53 live picks",
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
      liveKnockoutPicksRemaining: 14,
    }),
    "59 pts · Champion dead · 14 live picks",
  );
  assert.equal(
    formatLeaderboardRaceSummary({
      ...outlookRow,
      hasChampionPick: false,
      championAlive: false,
      championTeamName: null,
      liveKnockoutPicksRemaining: 1,
    }),
    "62 pts · No champion pick · 1 live pick",
  );
}

// Champion helper copy
{
  assert.equal(formatLeaderboardChampionDetail(outlookRow), "Champion alive");
  assert.equal(
    formatLeaderboardChampionDetail({ ...outlookRow, championAlive: false }),
    "Champion dead",
  );
  assert.equal(
    formatLeaderboardChampionDetail({ ...outlookRow, hasChampionPick: false }),
    "No champion pick",
  );
}

// Leaderboard still works without race outlook data
{
  const map = mapRaceOutlookByParticipantId(null);
  assert.equal(map.size, 0);
  assert.equal(formatLeaderboardRaceSummary(outlookRow).includes("pts"), true);
}

// Detail explanation for expanded rows
{
  assert.match(
    raceOutlookDetailExplanation({
      ...outlookRow,
      statusLabel: "Dangerous",
    }),
    /many live knockout picks/i,
  );
}

console.log("leaderboardRaceRowContext.selftest.ts: all passed");
