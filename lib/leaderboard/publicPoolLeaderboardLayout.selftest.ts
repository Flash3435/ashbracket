import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const viewPath = join(root, "components/leaderboard/PublicPoolLeaderboardView.tsx");
const cellPath = join(root, "components/leaderboard/LeaderboardParticipantCell.tsx");
const viewSrc = readFileSync(viewPath, "utf8");
const cellSrc = readFileSync(cellPath, "utf8");

// Leaderboard renders before champion exposure disclosure
{
  const leaderboardIndex = viewSrc.indexOf("LeaderboardParticipantCell");
  const championIndex = viewSrc.lastIndexOf("<ChampionPickExposureCard");
  assert.ok(leaderboardIndex >= 0);
  assert.ok(championIndex >= 0);
  assert.ok(leaderboardIndex < championIndex);
}

// Standalone exposure sections removed from leaderboard page
{
  assert.ok(!viewSrc.includes("KnockoutMatchExposureSection"));
  assert.ok(!viewSrc.includes("ParticipantRaceOutlookCard"));
}

// Race outlook integrated into participant rows
{
  assert.ok(viewSrc.includes("LeaderboardParticipantCell"));
  assert.ok(viewSrc.includes("mapRaceOutlookByParticipantId"));
}

// Expand/collapse details markup is present
{
  assert.ok(cellSrc.includes("<details"));
  assert.ok(cellSrc.includes("Details"));
}

// Champion exposure is collapsible below leaderboard
{
  assert.ok(viewSrc.includes("collapsible"));
}

console.log("publicPoolLeaderboardLayout.selftest.ts: all passed");
