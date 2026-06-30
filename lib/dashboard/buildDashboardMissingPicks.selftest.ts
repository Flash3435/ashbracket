import assert from "node:assert/strict";
import {
  formatDashboardMissingKnockoutCopy,
  buildDashboardMissingPicksModel,
} from "./buildDashboardMissingPicks";

// Up to date when no actionable missing picks
{
  const copy = formatDashboardMissingKnockoutCopy({
    actionableCount: 0,
    matchups: [],
    categorySummaryLines: [],
  });
  assert.equal(copy.headline, "Your bracket is up to date");
  assert.match(copy.detail, /Future matchups will unlock/);
  assert.equal(copy.ctaLabel, null);
  assert.equal(copy.tone, "complete");
}

// Friendly matchup labels in detail copy
{
  const copy = formatDashboardMissingKnockoutCopy({
    actionableCount: 3,
    matchups: ["France vs Sweden", "Mexico vs Ecuador", "Argentina vs Cabo Verde"],
    categorySummaryLines: [],
  });
  assert.equal(copy.headline, "You still need 3 picks");
  assert.match(copy.detail, /France vs Sweden/);
  assert.match(copy.detail, /Mexico vs Ecuador/);
  assert.match(copy.detail, /Argentina vs Cabo Verde/);
  assert.match(copy.detail, /before kickoff/);
  assert.equal(copy.ctaLabel, "Complete picks");
}

// Singular headline
{
  const copy = formatDashboardMissingKnockoutCopy({
    actionableCount: 1,
    matchups: ["Brazil vs Japan"],
    categorySummaryLines: [],
  });
  assert.equal(copy.headline, "You still need 1 pick");
  assert.match(copy.detail, /Brazil vs Japan/);
}

// Category fallback when matchup labels unavailable
{
  const copy = formatDashboardMissingKnockoutCopy({
    actionableCount: 2,
    matchups: [],
    categorySummaryLines: ["2 Round of 16 picks"],
  });
  assert.match(copy.detail, /2 Round of 16 picks/);
  assert.doesNotMatch(copy.detail, /M\d+/);
}

// buildDashboardMissingPicksModel integrates with admin missing-pick logic
{
  const model = buildDashboardMissingPicksModel({
    slots: [],
    teams: [],
    tournamentMatches: null,
    officialRoundOf32Complete: false,
  });
  assert.equal(model.actionableCount, 0);
  assert.equal(model.tone, "complete");
}

console.log("buildDashboardMissingPicks.selftest.ts: ok");
