/**
 * Public group standings for /tournament.
 * Run: npx tsx lib/tournament/buildPublicGroupStandings.selftest.ts
 */
import assert from "node:assert/strict";
import {
  buildPublicGroupStandingsTables,
  hasAnyFinishedGroupStageMatch,
} from "./buildPublicGroupStandings";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

function groupHMatch(
  overrides: Partial<TournamentMatchPublicRow> &
    Pick<TournamentMatchPublicRow, "match_code" | "home_country_code" | "away_country_code">,
): TournamentMatchPublicRow {
  return {
    match_id: overrides.match_code,
    edition_id: "edition-1",
    edition_code: "fifa_wc_2026",
    stage_code: "group",
    stage_label: "Group stage",
    stage_sort_order: 10,
    group_code: "H",
    round_index: 0,
    kickoff_at: "2026-06-15T16:00:00Z",
    status: "finished",
    home_goals: 0,
    away_goals: 0,
    home_penalties: null,
    away_penalties: null,
    home_team_name: overrides.home_country_code,
    away_team_name: overrides.away_country_code,
    winner_team_name: null,
    winner_country_code: null,
    ...overrides,
  };
}

const groupHMatches: TournamentMatchPublicRow[] = [
  groupHMatch({
    match_code: "WC2026-G-H-01",
    home_country_code: "ESP",
    away_country_code: "CPV",
    home_goals: 0,
    away_goals: 0,
    kickoff_at: "2026-06-15T16:00:00Z",
  }),
  groupHMatch({
    match_code: "WC2026-G-H-02",
    home_country_code: "KSA",
    away_country_code: "URU",
    home_goals: 1,
    away_goals: 1,
    kickoff_at: "2026-06-15T22:00:00Z",
  }),
];

assert(hasAnyFinishedGroupStageMatch(groupHMatches), "Group H finished matches should activate standings mode");

const tables = buildPublicGroupStandingsTables(groupHMatches);
const groupH = tables.find((t) => t.groupCode === "H");
assert(groupH, "Group H table should exist");

const playedByCode = new Map(groupH.rows.map((r) => [r.countryCode, r.played]));
for (const code of ["ESP", "CPV", "KSA", "URU"]) {
  assert.equal(
    playedByCode.get(code),
    1,
    `Group H ${code} should have PLD 1 after two completed opening matches`,
  );
}

// Scheduled match without scores must not increment played.
const withScheduledThird = [
  ...groupHMatches,
  groupHMatch({
    match_code: "WC2026-G-H-03",
    home_country_code: "ESP",
    away_country_code: "KSA",
    status: "scheduled",
    home_goals: null,
    away_goals: null,
  }),
];
const afterScheduled = buildPublicGroupStandingsTables(withScheduledThird);
const espAfter = afterScheduled.find((t) => t.groupCode === "H")!.rows.find((r) => r.countryCode === "ESP")!;
assert.equal(espAfter.played, 1, "future scheduled match must not add played");

// Wrong group or missing country codes are ignored (regression guard).
const badMatch = groupHMatch({
  match_code: "WC2026-G-H-99",
  group_code: "G",
  home_country_code: "ESP",
  away_country_code: "CPV",
});
const badTables = buildPublicGroupStandingsTables([...groupHMatches, badMatch]);
const espBad = badTables.find((t) => t.groupCode === "H")!.rows.find((r) => r.countryCode === "ESP")!;
assert.equal(espBad.played, 1, "mis-grouped finished match must not affect Group H");

console.log("buildPublicGroupStandings.selftest.ts: ok");
