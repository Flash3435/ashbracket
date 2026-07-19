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
  assert.ok(viewSrc.includes("resolveLeaderboardStandingsSubtitle"));
}

// Expand/collapse details markup is present
{
  assert.ok(cellSrc.includes("<details"));
  assert.ok(cellSrc.includes("Details"));
  assert.ok(cellSrc.includes("Tournament Picks"));
  assert.ok(cellSrc.includes("No tournament pick details are available"));
  assert.ok(cellSrc.includes("grid-cols-[auto_minmax(0,1fr)_auto]"));
  assert.ok(cellSrc.includes("layout === \"mobile\""));
  assert.ok(cellSrc.includes("compact"));
  assert.ok(cellSrc.includes("showRaceStatus"));
  assert.ok(cellSrc.includes("impactOutlook"));
}

// Details are available for every race-outlook row (not top-10 gated in the cell)
{
  assert.ok(cellSrc.includes("{raceOutlook ? ("));
  assert.ok(cellSrc.includes("<RaceOutlookDetails"));
  assert.ok(cellSrc.includes("raceOutlook?.showRaceStatus"));
  // Race badges stay gated; Details do not use an index/rank < 10 check
  assert.ok(!cellSrc.includes("rank < 10"));
  assert.ok(!cellSrc.includes("index < 10"));
  assert.ok(!cellSrc.includes("slice(0, 10)"));
  assert.ok(!cellSrc.includes("RACE_OUTLOOK_TOP_N"));
}

// Mobile cards hide neutral rank arrows; desktop table does not
{
  assert.ok(viewSrc.includes("hideNeutralMovement: true"));
  assert.ok(viewSrc.includes('layout="table"'));
  assert.ok(viewSrc.includes('layout="mobile"'));
}

// Tournament bonus standings are passed once from the page into every row
{
  assert.ok(viewSrc.includes("tournamentBonusStandings"));
  assert.ok(cellSrc.includes("tournamentBonusStandings"));
  assert.ok(cellSrc.includes("buildTournamentPickStandingLines"));
  assert.ok(!cellSrc.includes("loadTournamentTeamStatLeaders"));
  assert.ok(!cellSrc.includes("from(\"tournament_match_team_stats\")"));
  assert.ok(!cellSrc.includes("fetch("));
}

// Champion exposure is collapsible below leaderboard
{
  assert.ok(viewSrc.includes("collapsible"));
}

console.log("publicPoolLeaderboardLayout.selftest.ts: all passed");
