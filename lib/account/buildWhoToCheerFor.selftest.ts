import assert from "node:assert";
import {
  buildTeamImportanceById,
  buildWhoToCheerFor,
  dashboardPriorityForSuggestion,
  decideCheerForMatchSides,
  DASHBOARD_MATCH_LIMIT,
  importanceScoreForKind,
  upcomingTournamentMatches,
} from "./buildWhoToCheerFor";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

function slot(
  partial: Partial<KnockoutPickSlotDraft> &
    Pick<KnockoutPickSlotDraft, "predictionKind" | "rowKey"> & {
      teamId?: string;
    },
): KnockoutPickSlotDraft {
  return {
    tournamentStageId: "stage-1",
    sectionLabel: "",
    slotLabel: partial.rowKey,
    groupCode: null,
    slotKey: null,
    bonusKey: null,
    teamId: "",
    ...partial,
  };
}

function team(id: string, name: string, countryCode: string): Team {
  return {
    id,
    name,
    countryCode,
    fifaCode: countryCode,
    fifaRank: null,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  };
}

function matchRow(
  partial: Partial<TournamentMatchPublicRow> &
    Pick<TournamentMatchPublicRow, "match_id" | "home_country_code" | "away_country_code">,
): TournamentMatchPublicRow {
  return {
    edition_id: "ed",
    edition_code: "wc2026",
    match_code: partial.match_id,
    stage_code: "quarterfinal",
    stage_label: "Quarter-final",
    stage_sort_order: 50,
    group_code: null,
    round_index: 0,
    kickoff_at: "2026-06-20T19:00:00Z",
    status: "scheduled",
    home_goals: null,
    away_goals: null,
    home_penalties: null,
    away_penalties: null,
    home_team_name: null,
    away_team_name: null,
    winner_team_name: null,
    winner_country_code: null,
    ...partial,
  };
}

// Champion vs neutral team → cheer champion
{
  const brazil = team("t-br", "Brazil", "BRA");
  const germany = team("t-de", "Germany", "GER");
  const slots = [
    slot({ rowKey: "champ", predictionKind: "champion", teamId: "t-br" }),
  ];
  const imp = buildTeamImportanceById(slots);
  const decision = decideCheerForMatchSides(
    { teamId: "t-br", name: "Brazil", countryCode: "BRA" },
    { teamId: "t-de", name: "Germany", countryCode: "GER" },
    imp,
  );
  assert.strictEqual(decision.cheerForTeamId, "t-br");
  assert.strictEqual(decision.cheerForLabel, "Brazil");
  assert.ok(decision.reason.includes("champion"));
  assert.strictEqual(decision.confidence, "strong");
}

// Both teams picked similarly → both in bracket
{
  const slots = [
    slot({ rowKey: "sf1", predictionKind: "semifinalist", teamId: "t-es" }),
    slot({ rowKey: "sf2", predictionKind: "semifinalist", teamId: "t-ar" }),
  ];
  const imp = buildTeamImportanceById(slots);
  const decision = decideCheerForMatchSides(
    { teamId: "t-es", name: "Spain", countryCode: "ESP" },
    { teamId: "t-ar", name: "Argentina", countryCode: "ARG" },
    imp,
  );
  assert.strictEqual(decision.cheerForTeamId, null);
  assert.strictEqual(decision.cheerForLabel, "Both teams are in your bracket");
  assert.ok(decision.reason.includes("Either result"));
}

// Neither team picked → no strong angle
{
  const decision = decideCheerForMatchSides(
    { teamId: "t-xx", name: "X", countryCode: "XXX" },
    { teamId: "t-yy", name: "Y", countryCode: "YYY" },
    new Map(),
  );
  assert.strictEqual(decision.confidence, "none");
  assert.strictEqual(decision.cheerForLabel, "No strong bracket angle");
  assert.ok(decision.reason.includes("does not strongly affect"));
}

// Kickoff sorting — soonest first (within same priority)
{
  const now = new Date("2026-06-18T12:00:00Z").getTime();
  const rows = [
    matchRow({
      match_id: "late",
      kickoff_at: "2026-06-22T19:00:00Z",
      home_country_code: "BRA",
      away_country_code: "GER",
    }),
    matchRow({
      match_id: "soon",
      kickoff_at: "2026-06-19T15:00:00Z",
      home_country_code: "CAN",
      away_country_code: "JPN",
    }),
  ];
  const upcoming = upcomingTournamentMatches(rows, 5, { nowMs: now });
  assert.strictEqual(upcoming[0]?.match_id, "soon");
  assert.strictEqual(upcoming[1]?.match_id, "late");
}

// Cross-group chronological order — Group B before later Group A
{
  const now = new Date("2026-06-18T12:00:00Z").getTime();
  const rows = [
    matchRow({
      match_id: "ga-late",
      match_code: "GA2",
      group_code: "A",
      stage_sort_order: 10,
      kickoff_at: "2026-06-18T22:00:00Z",
      home_country_code: "BRA",
      away_country_code: "GER",
    }),
    matchRow({
      match_id: "gb-early",
      match_code: "GB1",
      group_code: "B",
      stage_sort_order: 10,
      kickoff_at: "2026-06-18T15:00:00Z",
      home_country_code: "CAN",
      away_country_code: "JPN",
    }),
  ];
  const upcoming = upcomingTournamentMatches(rows, 5, { nowMs: now });
  assert.strictEqual(upcoming[0]?.match_id, "gb-early");
  assert.strictEqual(upcoming[1]?.match_id, "ga-late");
}

// Dashboard max 3 rows
{
  const now = Date.now();
  const rows = Array.from({ length: 8 }, (_, i) =>
    matchRow({
      match_id: `m-${i}`,
      kickoff_at: new Date(now + (i + 1) * 3600_000).toISOString(),
      home_country_code: "BRA",
      away_country_code: "GER",
    }),
  );
  const built = buildWhoToCheerFor({
    matches: rows,
    slots: [slot({ rowKey: "c", predictionKind: "champion", teamId: "t-br" })],
    teams: [team("t-br", "Brazil", "BRA"), team("t-de", "Germany", "GER")],
    knockoutBracketPicksUnlocked: true,
    nowMs: now,
  });
  assert.strictEqual(built.suggestions.length, DASHBOARD_MATCH_LIMIT);
  assert.strictEqual(DASHBOARD_MATCH_LIMIT, 3);
  assert.ok(built.totalRelevantMatches >= 3);
}

// Live match involving a pick ranks above unrelated scheduled fixture
{
  const now = new Date("2026-06-18T12:00:00Z").getTime();
  const rows = [
    matchRow({
      match_id: "neutral-soon",
      kickoff_at: "2026-06-19T12:00:00Z",
      home_country_code: "CAN",
      away_country_code: "JPN",
    }),
    matchRow({
      match_id: "bra-live",
      status: "live",
      kickoff_at: "2026-06-19T18:00:00Z",
      home_country_code: "BRA",
      away_country_code: "GER",
    }),
  ];
  const built = buildWhoToCheerFor({
    matches: rows,
    slots: [slot({ rowKey: "c", predictionKind: "champion", teamId: "t-br" })],
    teams: [team("t-br", "Brazil", "BRA"), team("t-de", "Germany", "GER")],
    knockoutBracketPicksUnlocked: true,
    nowMs: now,
    limit: 1,
  });
  assert.strictEqual(built.suggestions[0]?.matchId, "bra-live");
}

// No picks still returns upcoming rows for the dashboard
{
  const now = Date.now();
  const built = buildWhoToCheerFor({
    matches: [
      matchRow({
        match_id: "a",
        kickoff_at: new Date(now + 3600_000).toISOString(),
        home_country_code: "BRA",
        away_country_code: "GER",
      }),
    ],
    slots: [slot({ rowKey: "c", predictionKind: "champion" })],
    teams: [team("t-br", "Brazil", "BRA")],
    nowMs: now,
  });
  assert.strictEqual(built.hasAnyPick, false);
  assert.strictEqual(built.suggestions.length, 1);
}

// TBD / missing country codes do not throw
{
  const now = Date.now();
  const built = buildWhoToCheerFor({
    matches: [
      matchRow({
        match_id: "tbd",
        kickoff_at: new Date(now + 3600_000).toISOString(),
        home_country_code: null,
        away_country_code: null,
        home_team_name: "TBD",
        away_team_name: "TBD",
      }),
    ],
    slots: [slot({ rowKey: "c", predictionKind: "champion", teamId: "t-br" })],
    teams: [team("t-br", "Brazil", "BRA")],
    nowMs: now,
  });
  assert.strictEqual(built.suggestions[0]?.home.name, "TBD");
}

// Priority helper: live + picked beats scheduled neutral
{
  const hi = dashboardPriorityForSuggestion({
    status: "live",
    confidence: "strong",
    involvesPickedTeam: true,
  });
  const lo = dashboardPriorityForSuggestion({
    status: "scheduled",
    confidence: "none",
    involvesPickedTeam: false,
  });
  assert.ok(hi > lo);
}

// No upcoming matches
{
  const finished = matchRow({
    match_id: "done",
    status: "finished",
    home_country_code: "BRA",
    away_country_code: "GER",
  });
  const built = buildWhoToCheerFor({
    matches: [finished],
    slots: [slot({ rowKey: "c", predictionKind: "champion", teamId: "t-br" })],
    teams: [team("t-br", "Brazil", "BRA")],
  });
  assert.strictEqual(built.suggestions.length, 0);
  assert.strictEqual(built.hasAnyPick, true);
}

// Importance ordering
assert.strictEqual(importanceScoreForKind("champion"), 100);
assert.ok(importanceScoreForKind("finalist") > importanceScoreForKind("round_of_16"));

console.log("buildWhoToCheerFor.selftest.ts: ok");
