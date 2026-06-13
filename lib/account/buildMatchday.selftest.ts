import assert from "node:assert";
import {
  buildMatchday,
  matchdayBracketWantsLabel,
  MATCHDAY_DASHBOARD_LIMIT,
  selectMatchdayMatches,
} from "./buildMatchday";
import { buildCheerSuggestionForMatch } from "./buildWhoToCheerFor";
import { recentScoreImpactFromActivityRows } from "./loadRecentScoreImpactForDashboard";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import type { PoolActivityFeedRow } from "../poolActivity/poolActivityTypes";

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
    stage_code: "group",
    stage_label: "Group stage",
    stage_sort_order: 10,
    group_code: "B",
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

// Live matches sort before upcoming when filling matchday rows
{
  const now = new Date("2026-06-18T18:00:00Z").getTime();
  const todayKickoff = "2026-06-18T22:00:00Z";
  const rows = [
    matchRow({
      match_id: "future",
      kickoff_at: "2026-06-25T19:00:00Z",
      home_country_code: "CAN",
      away_country_code: "JPN",
    }),
    matchRow({
      match_id: "live",
      status: "live",
      kickoff_at: todayKickoff,
      home_country_code: "BRA",
      away_country_code: "GER",
    }),
    matchRow({
      match_id: "today-sched",
      kickoff_at: todayKickoff,
      home_country_code: "ESP",
      away_country_code: "ARG",
    }),
  ];
  const { selected } = selectMatchdayMatches(rows, { nowMs: now, limit: 3 });
  assert.strictEqual(selected[0]?.match_id, "live");
  assert.strictEqual(selected[1]?.match_id, "today-sched");
}

// Today's matches sort before future-only fallback
{
  const now = new Date("2026-06-18T18:00:00Z").getTime();
  const rows = [
    matchRow({
      match_id: "future",
      kickoff_at: "2026-06-25T19:00:00Z",
      home_country_code: "CAN",
      away_country_code: "JPN",
    }),
    matchRow({
      match_id: "today-finished",
      status: "finished",
      kickoff_at: "2026-06-18T15:00:00Z",
      home_goals: 1,
      away_goals: 1,
      home_country_code: "CAN",
      away_country_code: "BIH",
    }),
  ];
  const { selected, hasMatchesToday, usingUpcomingFallback } = selectMatchdayMatches(
    rows,
    { nowMs: now },
  );
  assert.strictEqual(hasMatchesToday, true);
  assert.strictEqual(usingUpcomingFallback, false);
  assert.strictEqual(selected[0]?.match_id, "today-finished");
}

// No matches today → upcoming fallback
{
  const now = new Date("2026-06-18T18:00:00Z").getTime();
  const rows = [
    matchRow({
      match_id: "future-late",
      kickoff_at: "2026-06-25T19:00:00Z",
      home_country_code: "CAN",
      away_country_code: "JPN",
    }),
    matchRow({
      match_id: "future-soon",
      kickoff_at: "2026-06-19T15:00:00Z",
      home_country_code: "BRA",
      away_country_code: "GER",
    }),
  ];
  const { selected, usingUpcomingFallback } = selectMatchdayMatches(rows, {
    nowMs: now,
  });
  assert.strictEqual(usingUpcomingFallback, true);
  assert.strictEqual(selected[0]?.match_id, "future-soon");
}

// Max 3 dashboard rows
{
  const now = new Date("2026-06-18T18:00:00Z").getTime();
  const rows = Array.from({ length: 6 }, (_, i) =>
    matchRow({
      match_id: `today-${i}`,
      kickoff_at: `2026-06-18T${10 + i}:00:00Z`,
      home_country_code: "BRA",
      away_country_code: "GER",
    }),
  );
  const built = buildMatchday({
    matches: rows,
    slots: [slot({ rowKey: "c", predictionKind: "champion", teamId: "t-br" })],
    teams: [team("t-br", "Brazil", "BRA"), team("t-de", "Germany", "GER")],
    nowMs: now,
  });
  assert.strictEqual(built.suggestions.length, MATCHDAY_DASHBOARD_LIMIT);
  assert.strictEqual(MATCHDAY_DASHBOARD_LIMIT, 3);
}

// Own-picks-only cheer suggestion
{
  const suggestion = buildCheerSuggestionForMatch(
    matchRow({
      match_id: "m1",
      home_country_code: "BRA",
      away_country_code: "GER",
    }),
    [slot({ rowKey: "c", predictionKind: "champion", teamId: "t-br" })],
    [team("t-br", "Brazil", "BRA"), team("t-de", "Germany", "GER")],
  );
  assert.strictEqual(suggestion.cheerForLabel, "Brazil");
  const wants = matchdayBracketWantsLabel(suggestion);
  assert.strictEqual(wants.primary, "Brazil");
}

// Mixed impact label
{
  const suggestion = buildCheerSuggestionForMatch(
    matchRow({
      match_id: "m2",
      home_country_code: "ESP",
      away_country_code: "ARG",
    }),
    [
      slot({ rowKey: "sf1", predictionKind: "semifinalist", teamId: "t-es" }),
      slot({ rowKey: "sf2", predictionKind: "semifinalist", teamId: "t-ar" }),
    ],
    [team("t-es", "Spain", "ESP"), team("t-ar", "Argentina", "ARG")],
  );
  assert.strictEqual(matchdayBracketWantsLabel(suggestion).primary, "Mixed impact");
}

// Recent score impact structured copy
{
  const row: PoolActivityFeedRow = {
    id: "a1",
    type: "ash_score_impact",
    body_text: "legacy long copy should not be primary",
    metadata_json: {
      match_label: "Canada 1–1 Bosnia and Herzegovina",
      scoreline: "Canada 1–1 Bosnia and Herzegovina",
      points_changed: false,
      reason: "group_incomplete",
      group_code: "B",
    },
    related_path: null,
    is_ai_generated: false,
    created_at: new Date().toISOString(),
    participant_display_name: null,
  };
  const items = recentScoreImpactFromActivityRows([row], {
    allowParticipantNames: true,
  });
  assert.strictEqual(items.length, 1);
  assert.ok(items[0]!.headline.includes("is final"));
  assert.ok(items[0]!.detailLines.some((l) => l.includes("Group B")));
  assert.ok(!items[0]!.headline.includes("legacy long"));
}

// Points changed with gainer names when allowed
{
  const row: PoolActivityFeedRow = {
    id: "a2",
    type: "ash_score_impact",
    body_text: "fallback",
    metadata_json: {
      match_label: "Brazil 2–0 Haiti",
      scoreline: "Brazil 2–0 Haiti",
      points_changed: true,
      affected_count: 8,
      top_gainers: [
        { display_name: "Nish", delta: 6 },
        { display_name: "Flash", delta: 6 },
      ],
      reason: "knockout_result",
    },
    related_path: null,
    is_ai_generated: false,
    created_at: new Date().toISOString(),
    participant_display_name: null,
  };
  const items = recentScoreImpactFromActivityRows([row], {
    allowParticipantNames: true,
  });
  assert.ok(items[0]!.detailLines.some((l) => l.includes("8 brackets")));
  assert.ok(items[0]!.detailLines.some((l) => l.includes("Nish +6")));
}

// No crash for TBD teams
{
  const built = buildMatchday({
    matches: [
      matchRow({
        match_id: "tbd",
        home_country_code: null,
        away_country_code: null,
        home_team_name: "TBD",
        away_team_name: "TBD",
      }),
    ],
    slots: [slot({ rowKey: "c", predictionKind: "champion", teamId: "t-br" })],
    teams: [team("t-br", "Brazil", "BRA")],
  });
  assert.strictEqual(built.suggestions[0]?.home.name, "TBD");
}

// No matches does not throw
{
  const built = buildMatchday({
    matches: [],
    slots: [slot({ rowKey: "c", predictionKind: "champion", teamId: "t-br" })],
    teams: [team("t-br", "Brazil", "BRA")],
  });
  assert.strictEqual(built.suggestions.length, 0);
}

console.log("buildMatchday.selftest.ts: ok");
