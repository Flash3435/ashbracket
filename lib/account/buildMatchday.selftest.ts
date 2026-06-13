import assert from "node:assert";
import {
  buildMatchday,
  matchdayBracketWantsLabel,
  MATCHDAY_DASHBOARD_LIMIT,
  selectMatchdayMatches,
} from "./buildMatchday";
import { buildCheerSuggestionForMatch } from "./buildWhoToCheerFor";
import {
  RECENT_SCORE_IMPACT_DASHBOARD_LIMIT,
  recentScoreImpactFromActivityRows,
} from "./loadRecentScoreImpactForDashboard";
import {
  parseLegacyScoreImpactDashboardBody,
  hasStructuredScoreImpactMetadata,
} from "./parseLegacyScoreImpactDashboardBody";
import { publicLeaderboardHrefForPool } from "../pool/publicLeaderboardHref";
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

function scoreImpactRow(
  partial: Partial<PoolActivityFeedRow> & Pick<PoolActivityFeedRow, "id">,
): PoolActivityFeedRow {
  return {
    type: "ash_score_impact",
    body_text: "",
    metadata_json: {},
    related_path: null,
    is_ai_generated: false,
    created_at: new Date().toISOString(),
    participant_display_name: null,
    ...partial,
  };
}

// Dashboard recent score-impact limit is 1
assert.strictEqual(RECENT_SCORE_IMPACT_DASHBOARD_LIMIT, 1);

// Legacy no-points Group B body is shortened
{
  const legacy =
    "Canada 1–1 Bosnia and Herzegovina is in. No pool points changed yet. Group B is not complete yet — winner and runner-up points land after all six group matches finish.";
  const parsed = parseLegacyScoreImpactDashboardBody(legacy);
  assert.ok(parsed);
  assert.strictEqual(parsed!.headline, "Canada 1–1 Bosnia and Herzegovina is final.");
  assert.strictEqual(
    parsed!.detailLines[0],
    "No pool points yet — Group B points settle after the group finishes.",
  );
  assert.ok(!parsed!.detailLines.some((l) => l.includes("winner and runner-up")));
}

// Legacy no-points Group A body is shortened
{
  const legacy =
    "Korea Republic 2–1 Czechia is in. No pool points changed yet. Group A is not complete yet — winner and runner-up points land after all six group matches finish.";
  const parsed = parseLegacyScoreImpactDashboardBody(legacy);
  assert.ok(parsed);
  assert.strictEqual(parsed!.headline, "Korea Republic 2–1 Czechia is final.");
  assert.ok(parsed!.detailLines[0]!.includes("Group A"));
}

// Unknown legacy text falls back safely via recentScoreImpactFromActivityRows
{
  const row = scoreImpactRow({
    id: "unknown",
    body_text: "Some unexpected score-impact note that does not match known patterns.",
    metadata_json: {},
  });
  const items = recentScoreImpactFromActivityRows([row], {
    allowParticipantNames: true,
  });
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0]!.headline, row.body_text);
  assert.strictEqual(items[0]!.detailLines.length, 0);
}

// Structured score-impact display still works
{
  const row = scoreImpactRow({
    id: "structured",
    body_text: "legacy long copy should not be primary",
    metadata_json: {
      match_label: "Canada 1–1 Bosnia and Herzegovina",
      scoreline: "Canada 1–1 Bosnia and Herzegovina",
      points_changed: false,
      reason: "group_incomplete",
      group_code: "B",
    },
  });
  assert.strictEqual(hasStructuredScoreImpactMetadata(row.metadata_json), true);
  const items = recentScoreImpactFromActivityRows([row], {
    allowParticipantNames: true,
  });
  assert.strictEqual(items.length, 1);
  assert.ok(items[0]!.headline.includes("is final"));
  assert.ok(items[0]!.detailLines.some((l) => l.includes("Group B")));
  assert.ok(!items[0]!.headline.includes("legacy long"));
}

// Only one score-impact row on dashboard even when more exist
{
  const rows = [
    scoreImpactRow({
      id: "a1",
      body_text:
        "Canada 1–1 Bosnia and Herzegovina is in. No pool points changed yet. Group B is not complete yet — winner and runner-up points land after all six group matches finish.",
    }),
    scoreImpactRow({
      id: "a2",
      body_text:
        "Korea Republic 2–1 Czechia is in. No pool points changed yet. Group A is not complete yet — winner and runner-up points land after all six group matches finish.",
    }),
  ];
  const items = recentScoreImpactFromActivityRows(rows, {
    allowParticipantNames: true,
  });
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0]!.id, "a1");
}

// Leaderboard href only for public pools
{
  assert.strictEqual(
    publicLeaderboardHrefForPool({ id: "pool-1", isPublic: true }),
    "/pool/pool-1",
  );
  assert.strictEqual(
    publicLeaderboardHrefForPool({ id: "pool-1", isPublic: false }),
    null,
  );
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

console.log("buildMatchday.selftest.ts: ok");
