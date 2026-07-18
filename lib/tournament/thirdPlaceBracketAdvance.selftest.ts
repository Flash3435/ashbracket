/**
 * Third-place (bronze final) bracket propagation regression tests.
 *
 * Scenario mirrors the live WC 2026 bracket state:
 *   M101 semifinal: France 0–2 Spain      (Spain wins, France is the loser)
 *   M102 semifinal: England 1–2 Argentina (Argentina wins, England is the loser)
 * Expected:
 *   M103 third place = France vs England  (semifinal LOSERS)
 *   M104 final       = Spain vs Argentina (semifinal WINNERS)
 *
 * Run: npx tsx lib/tournament/thirdPlaceBracketAdvance.selftest.ts
 */
import assert from "node:assert/strict";
import { propagateBracketAdvance, recomputeWinners } from "./syncOfficialTournament";

type TestMatch = {
  id: string;
  match_code: string;
  stage_code: string;
  group_code: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_goals: number | null;
  away_goals: number | null;
  home_penalties: number | null;
  away_penalties: number | null;
  winner_team_id: string | null;
  status: string;
  home_advance_from_match_id: string | null;
  away_advance_from_match_id: string | null;
  scoring_result_kind: string | null;
  scoring_slot_key: string | null;
  scoring_stage_code: string | null;
  sync_locked: boolean;
};

function baseMatch(overrides: Partial<TestMatch> & Pick<TestMatch, "id" | "match_code" | "stage_code">): TestMatch {
  return {
    group_code: null,
    home_team_id: null,
    away_team_id: null,
    home_goals: null,
    away_goals: null,
    home_penalties: null,
    away_penalties: null,
    winner_team_id: null,
    status: "scheduled",
    home_advance_from_match_id: null,
    away_advance_from_match_id: null,
    scoring_result_kind: null,
    scoring_slot_key: null,
    scoring_stage_code: null,
    sync_locked: false,
    ...overrides,
  };
}

function buildBracket(): { m101: TestMatch; m102: TestMatch; m103: TestMatch; m104: TestMatch; matches: TestMatch[] } {
  const m101 = baseMatch({
    id: "m-101",
    match_code: "M101",
    stage_code: "semifinal",
    home_team_id: "team-fra",
    away_team_id: "team-esp",
    home_goals: 0,
    away_goals: 2,
    status: "finished",
  });
  const m102 = baseMatch({
    id: "m-102",
    match_code: "M102",
    stage_code: "semifinal",
    home_team_id: "team-eng",
    away_team_id: "team-arg",
    home_goals: 1,
    away_goals: 2,
    status: "finished",
  });
  const m103 = baseMatch({
    id: "m-103",
    match_code: "M103",
    stage_code: "third_place",
    home_advance_from_match_id: "m-101",
    away_advance_from_match_id: "m-102",
  });
  const m104 = baseMatch({
    id: "m-104",
    match_code: "M104",
    stage_code: "final",
    home_advance_from_match_id: "m-101",
    away_advance_from_match_id: "m-102",
  });
  return { m101, m102, m103, m104, matches: [m101, m102, m103, m104] };
}

// 1) Losers advance into M103, winners into M104.
{
  const { m101, m102, m103, m104, matches } = buildBracket();
  recomputeWinners(matches);
  propagateBracketAdvance(matches);

  assert.equal(m101.winner_team_id, "team-esp", "M101 winner should be Spain");
  assert.equal(m102.winner_team_id, "team-arg", "M102 winner should be Argentina");

  assert.equal(m103.home_team_id, "team-fra", "M103 home should be France (loser of M101)");
  assert.equal(m103.away_team_id, "team-eng", "M103 away should be England (loser of M102)");
  assert.equal(m103.winner_team_id, null, "M103 has no winner before its score is entered");
  assert.equal(m103.status, "scheduled", "M103 stays scheduled until scored");

  assert.equal(m104.home_team_id, "team-esp", "M104 home should be Spain (winner of M101)");
  assert.equal(m104.away_team_id, "team-arg", "M104 away should be Argentina (winner of M102)");
}

// 2) Propagation is idempotent: re-running sync must NOT overwrite M103 with
//    the semifinal winners (regression for winner-only propagation).
{
  const { m103, m104, matches } = buildBracket();
  recomputeWinners(matches);
  propagateBracketAdvance(matches);
  propagateBracketAdvance(matches);
  propagateBracketAdvance(matches);

  assert.equal(m103.home_team_id, "team-fra", "M103 home must stay France across repeated syncs");
  assert.equal(m103.away_team_id, "team-eng", "M103 away must stay England across repeated syncs");
  assert.equal(m104.home_team_id, "team-esp");
  assert.equal(m104.away_team_id, "team-arg");
}

// 3) A teams-only production repair (M103 pre-set to France vs England) is
//    preserved once advance links are added post-deploy.
{
  const { m103, matches } = buildBracket();
  m103.home_team_id = "team-fra";
  m103.away_team_id = "team-eng";
  recomputeWinners(matches);
  propagateBracketAdvance(matches);

  assert.equal(m103.home_team_id, "team-fra", "pre-repaired M103 home must not change");
  assert.equal(m103.away_team_id, "team-eng", "pre-repaired M103 away must not change");
}

// 4) Undecided semifinals leave M103 and M104 as TBD (no partial propagation).
{
  const { m101, m102, m103, m104, matches } = buildBracket();
  m101.home_goals = null;
  m101.away_goals = null;
  m101.status = "scheduled";
  m102.home_goals = null;
  m102.away_goals = null;
  m102.status = "scheduled";
  recomputeWinners(matches);
  propagateBracketAdvance(matches);

  assert.equal(m103.home_team_id, null, "M103 home stays TBD while M101 is undecided");
  assert.equal(m103.away_team_id, null, "M103 away stays TBD while M102 is undecided");
  assert.equal(m104.home_team_id, null);
  assert.equal(m104.away_team_id, null);
}

// 5) Third-place score entry then resolves the bronze-final winner normally.
{
  const { m103, matches } = buildBracket();
  recomputeWinners(matches);
  propagateBracketAdvance(matches);

  m103.home_goals = 2;
  m103.away_goals = 1;
  recomputeWinners(matches);
  propagateBracketAdvance(matches);

  assert.equal(m103.winner_team_id, "team-fra", "M103 winner derives from entered score");
  assert.equal(m103.status, "finished");
}

// 6) Existing winner propagation through earlier rounds is unchanged: a
//    quarterfinal winner still flows into a semifinal slot.
{
  const qf = baseMatch({
    id: "m-97",
    match_code: "M97",
    stage_code: "quarterfinal",
    home_team_id: "team-fra",
    away_team_id: "team-mar",
    home_goals: 2,
    away_goals: 0,
    status: "finished",
  });
  const sf = baseMatch({
    id: "m-101",
    match_code: "M101",
    stage_code: "semifinal",
    home_advance_from_match_id: "m-97",
  });
  const matches = [qf, sf];
  recomputeWinners(matches);
  propagateBracketAdvance(matches);

  assert.equal(sf.home_team_id, "team-fra", "semifinal home should be QF winner");
}

console.log("thirdPlaceBracketAdvance.selftest.ts: all assertions passed");
