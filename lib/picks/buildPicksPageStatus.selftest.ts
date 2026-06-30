import assert from "node:assert/strict";
import { buildKnockoutSelectionInstructionCard } from "./knockoutSelectionWindow";
import {
  buildPicksPageCompactLockNote,
  buildPicksPageStatusModel,
  PICKS_PAGE_COMPACT_LOCK_NOTE,
  shouldShowKnockoutInstructionOnPicksPage,
  shouldShowPicksPageStatusCard,
} from "./buildPicksPageStatus";

// Priority A — path reconciliation
{
  const model = buildPicksPageStatusModel({
    slots: [],
    teams: [],
    tournamentMatches: null,
    officialRoundOf32Complete: true,
    knockoutPathRepairUnsaved: true,
  });
  assert.equal(model.kind, "path_reconciliation");
  assert.equal(model.headline, "Review updated knockout picks");
  assert.match(model.detail, /cleared|bracket|save/i);
  assert.equal(model.ctaLabel, "Save picks");
  assert.equal(model.ctaAction, "save");
}

// Priority B — missing picks with friendly matchup copy
{
  const model = buildPicksPageStatusModel({
    slots: [],
    teams: [],
    tournamentMatches: null,
    officialRoundOf32Complete: true,
    knockoutPathRepairUnsaved: false,
  });
  assert.equal(model.kind, "complete");
  assert.equal(model.headline, "Current picks complete");
  assert.match(model.detail, /Future matchups will unlock/);
}

// Priority C — complete headline differs from dashboard
{
  const model = buildPicksPageStatusModel({
    slots: [],
    teams: [],
    tournamentMatches: null,
    officialRoundOf32Complete: false,
  });
  assert.equal(model.headline, "Current picks complete");
  assert.notEqual(model.headline, "Your bracket is up to date");
}

// Instruction card hidden on picks page during locking
{
  const card = buildKnockoutSelectionInstructionCard({
    knockoutBracketPicksUnlocked: true,
    matches: [
      {
        match_id: "M73",
        edition_id: "ed",
        edition_code: "wc2026",
        match_code: "M73",
        stage_code: "round_of_32",
        stage_label: "Round of 32",
        stage_sort_order: 1,
        group_code: null,
        round_index: 0,
        kickoff_at: "2026-06-28T19:00:00Z",
        status: "live",
        home_goals: null,
        away_goals: null,
        home_penalties: null,
        away_penalties: null,
        home_team_name: "USA",
        home_country_code: "USA",
        away_team_name: "Mexico",
        away_country_code: "MEX",
        winner_team_name: null,
        winner_country_code: null,
      },
    ],
    picksHref: "/account/picks",
    nowMs: new Date("2026-06-28T19:30:00Z").getTime(),
  });
  assert.equal(card.phase, "locking");
  assert.equal(shouldShowKnockoutInstructionOnPicksPage(card), false);
}

// Instruction card hidden when full bracket is open
{
  const card = buildKnockoutSelectionInstructionCard({
    knockoutBracketPicksUnlocked: true,
    matches: [
      {
        match_id: "M73",
        edition_id: "ed",
        edition_code: "wc2026",
        match_code: "M73",
        stage_code: "round_of_32",
        stage_label: "Round of 32",
        stage_sort_order: 1,
        group_code: null,
        round_index: 0,
        kickoff_at: "2026-06-29T19:00:00Z",
        status: "scheduled",
        home_goals: null,
        away_goals: null,
        home_penalties: null,
        away_penalties: null,
        home_team_name: "USA",
        home_country_code: "USA",
        away_team_name: "Mexico",
        away_country_code: "MEX",
        winner_team_name: null,
        winner_country_code: null,
      },
    ],
    picksHref: "/account/picks",
    nowMs: new Date("2026-06-28T12:00:00Z").getTime(),
  });
  assert.equal(card.phase, "open");
  assert.equal(shouldShowKnockoutInstructionOnPicksPage(card), false);
}

// Compact lock note during live knockout
{
  const note = buildPicksPageCompactLockNote({
    knockoutBracketPicksUnlocked: true,
    matches: [
      {
        match_id: "M73",
        edition_id: "ed",
        edition_code: "wc2026",
        match_code: "M73",
        stage_code: "round_of_32",
        stage_label: "Round of 32",
        stage_sort_order: 1,
        group_code: null,
        round_index: 0,
        kickoff_at: "2026-06-28T19:00:00Z",
        status: "live",
        home_goals: null,
        away_goals: null,
        home_penalties: null,
        away_penalties: null,
        home_team_name: null,
        home_country_code: "USA",
        away_team_name: null,
        away_country_code: "MEX",
        winner_team_name: null,
        winner_country_code: null,
      },
    ],
    nowMs: new Date("2026-06-28T19:30:00Z").getTime(),
  });
  assert.equal(note, PICKS_PAGE_COMPACT_LOCK_NOTE);
}

// Status card only when knockout picks are accessible and editable
{
  assert.equal(
    shouldShowPicksPageStatusCard({
      knockoutPicksAccessible: true,
      readOnly: false,
    }),
    true,
  );
  assert.equal(
    shouldShowPicksPageStatusCard({
      knockoutPicksAccessible: false,
      readOnly: false,
    }),
    false,
  );
  assert.equal(
    shouldShowPicksPageStatusCard({
      knockoutPicksAccessible: true,
      readOnly: true,
    }),
    false,
  );
}

console.log("buildPicksPageStatus.selftest.ts: ok");
