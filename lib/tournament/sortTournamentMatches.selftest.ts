import assert from "node:assert";
import {
  compareMatchesByKickoffChronological,
  compareUpcomingMatchesLiveFirst,
  sortMatchesByKickoffChronological,
} from "./sortTournamentMatches";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

function row(
  partial: Partial<TournamentMatchPublicRow> &
    Pick<TournamentMatchPublicRow, "match_id" | "match_code">,
): TournamentMatchPublicRow {
  return {
    edition_id: "ed",
    edition_code: "wc2026",
    stage_code: "group",
    stage_label: "Group Stage",
    stage_sort_order: 10,
    group_code: "A",
    round_index: 0,
    kickoff_at: "2026-06-18T19:00:00Z",
    status: "scheduled",
    home_goals: null,
    away_goals: null,
    home_penalties: null,
    away_penalties: null,
    home_team_name: "Team A",
    home_country_code: "AAA",
    away_team_name: "Team B",
    away_country_code: "BBB",
    winner_team_name: null,
    winner_country_code: null,
    ...partial,
  };
}

// Group B earlier kickoff beats later Group A (cross-group chronological)
{
  const groupBLate = row({
    match_id: "ga-late",
    match_code: "GA2",
    group_code: "A",
    kickoff_at: "2026-06-18T22:00:00Z",
  });
  const groupBEarly = row({
    match_id: "gb-early",
    match_code: "GB1",
    group_code: "B",
    kickoff_at: "2026-06-18T15:00:00Z",
  });
  const sorted = sortMatchesByKickoffChronological([groupBLate, groupBEarly]);
  assert.strictEqual(sorted[0]?.match_id, "gb-early");
  assert.strictEqual(sorted[1]?.match_id, "ga-late");
}

// Same kickoff: stage order, then group, then match code
{
  const knockout = row({
    match_id: "ko",
    match_code: "R32-2",
    group_code: null,
    stage_sort_order: 30,
    kickoff_at: "2026-06-20T19:00:00Z",
  });
  const groupA = row({
    match_id: "ga",
    match_code: "GA3",
    group_code: "A",
    stage_sort_order: 10,
    kickoff_at: "2026-06-20T19:00:00Z",
  });
  const groupB = row({
    match_id: "gb",
    match_code: "GB3",
    group_code: "B",
    stage_sort_order: 10,
    kickoff_at: "2026-06-20T19:00:00Z",
  });
  const sorted = sortMatchesByKickoffChronological([knockout, groupB, groupA]);
  assert.deepStrictEqual(
    sorted.map((m) => m.match_id),
    ["ga", "gb", "ko"],
  );
}

// Missing kickoff sorts after dated fixtures
{
  const tbd = row({
    match_id: "tbd",
    match_code: "TBD",
    kickoff_at: null,
  });
  const dated = row({
    match_id: "dated",
    match_code: "D1",
    kickoff_at: "2026-06-19T12:00:00Z",
  });
  assert.ok(compareMatchesByKickoffChronological(tbd, dated) > 0);
}

// Live-first helper keeps live ahead of earlier scheduled kickoff
{
  const live = row({
    match_id: "live",
    match_code: "L1",
    status: "live",
    kickoff_at: "2026-06-19T20:00:00Z",
  });
  const soon = row({
    match_id: "soon",
    match_code: "S1",
    status: "scheduled",
    kickoff_at: "2026-06-19T12:00:00Z",
  });
  assert.ok(compareUpcomingMatchesLiveFirst(live, soon) < 0);
}

console.log("sortTournamentMatches.selftest.ts: ok");
