import assert from "node:assert/strict";
import { WC2026_R32_MATCH_DEFS } from "../bracket/wc2026RoundOf32";
import {
  isKnockoutMatchConfirmed,
  isMatchPickable,
} from "../picks/gradualKnockoutUnlock";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { resolvePartialWc2026RoundOf32MatchTeams } from "./resolvePartialWc2026RoundOf32Teams";
import { planRoundOf32FixtureUpdates } from "./publishRoundOf32Fixtures";
import {
  WC2026_KNOCKOUT_FIXTURES,
  wc2026R32MatchCode,
} from "./seedOfficialWc2026KnockoutFixtures";
import { validateKickoffAtUtc } from "./validateWc2026KickoffAt";
import { buildR32GradualUnlockDiagnosticLine } from "./r32GradualUnlockDiagnostic";

function publicMatchForFifaNoLocal(
  r32: TournamentMatchPublicRow[],
  fifaMatchNo: number,
): TournamentMatchPublicRow | null {
  const direct = wc2026R32MatchCode(fifaMatchNo);
  return (
    r32.find((m) => m.match_code === direct) ??
    r32.find((m) => m.match_code.endsWith(`-${fifaMatchNo}`)) ??
    null
  );
}

// A. Shell fixture seeding metadata
assert.equal(WC2026_KNOCKOUT_FIXTURES.length, 16);
for (const fx of WC2026_KNOCKOUT_FIXTURES) {
  assert.equal(wc2026R32MatchCode(fx.fifa_match_no), `M${fx.fifa_match_no}`);
  assert.equal(
    validateKickoffAtUtc(fx.kickoff_at, `M${fx.fifa_match_no}`),
    null,
    `kickoff for M${fx.fifa_match_no}`,
  );
}
const fixtureNos = WC2026_KNOCKOUT_FIXTURES.map((fx) => fx.fifa_match_no).sort((a, b) => a - b);
assert.deepEqual(fixtureNos, WC2026_R32_MATCH_DEFS.map((d) => d.fifaMatchNo));

// B. Publishing known deterministic slots
const partialKnown = resolvePartialWc2026RoundOf32MatchTeams({
  groupWinnerTeamIdByLetter: { E: "team-E1" },
  groupRunnerUpTeamIdByLetter: { A: "team-A2", B: "team-B2" },
  thirdPlaceTeamIdByGroupLetter: {},
});
const m73 = partialKnown.find((m) => m.fifaMatchNo === 73)!;
assert.equal(m73.topTeamId, "team-A2");
assert.equal(m73.bottomTeamId, "team-B2");

const partialOneSide = resolvePartialWc2026RoundOf32MatchTeams({
  groupWinnerTeamIdByLetter: { E: "team-E1" },
  groupRunnerUpTeamIdByLetter: { A: "team-A2" },
  thirdPlaceTeamIdByGroupLetter: {},
});
const m74 = partialOneSide.find((m) => m.fifaMatchNo === 74)!;
assert.equal(m74.topTeamId, "team-E1");
assert.equal(m74.bottomTeamId, null);

// C. Best third-place mapping only when complete
const partialNoThird = resolvePartialWc2026RoundOf32MatchTeams({
  groupWinnerTeamIdByLetter: { E: "team-E1" },
  groupRunnerUpTeamIdByLetter: {},
  thirdPlaceTeamIdByGroupLetter: { A: "team-A3", B: "team-B3" },
});
assert.equal(partialNoThird.find((m) => m.fifaMatchNo === 74)!.bottomTeamId, null);

const partialFullThird = resolvePartialWc2026RoundOf32MatchTeams({
  groupWinnerTeamIdByLetter: {
    A: "tA1",
    B: "tB1",
    C: "tC1",
    D: "tD1",
    E: "tE1",
    F: "tF1",
    G: "tG1",
    H: "tH1",
    I: "tI1",
    J: "tJ1",
    K: "tK1",
    L: "tL1",
  },
  groupRunnerUpTeamIdByLetter: {
    A: "tA2",
    B: "tB2",
    C: "tC2",
    D: "tD2",
    E: "tE2",
    F: "tF2",
    G: "tG2",
    H: "tH2",
    I: "tI2",
    J: "tJ2",
    K: "tK2",
    L: "tL2",
  },
  thirdPlaceTeamIdByGroupLetter: {
    A: "tA3",
    B: "tB3",
    C: "tC3",
    D: "tD3",
    E: "tE3",
    F: "tF3",
    G: "tG3",
    H: "tH3",
  },
});
assert.ok(partialFullThird.every((m) => m.topTeamId && m.bottomTeamId));

// D. Idempotency / conflict
const existing = [
  {
    id: "row-m73",
    match_code: "M73",
    home_team_id: "team-A2",
    away_team_id: null,
    kickoff_at: "2026-06-28T19:00:00Z",
    sync_locked: false,
  },
];
const firstPlan = planRoundOf32FixtureUpdates([m73], existing);
assert.equal(firstPlan.updates.length, 1);
assert.equal(firstPlan.updates[0]!.away_team_id, "team-B2");
assert.equal(firstPlan.conflicts.length, 0);

const secondPlan = planRoundOf32FixtureUpdates(
  [m73],
  [
    {
      ...existing[0]!,
      away_team_id: "team-B2",
    },
  ],
);
assert.equal(secondPlan.updates.length, 0);

const conflictPlan = planRoundOf32FixtureUpdates(
  [{ ...m73, topTeamId: "other-team" }],
  [{ ...existing[0]!, home_team_id: "team-A2" }],
);
assert.equal(conflictPlan.conflicts.length, 1);
assert.equal(conflictPlan.updates.length, 1);
assert.equal(conflictPlan.updates[0]!.home_team_id, undefined);

// E. Integration with gradual unlock helpers
const publicRow: TournamentMatchPublicRow = {
  match_id: "1",
  edition_id: "ed",
  edition_code: "fifa_wc_2026",
  match_code: "M73",
  stage_code: "round_of_32",
  stage_label: "Round of 32",
  stage_sort_order: 2,
  group_code: null,
  round_index: 0,
  kickoff_at: "2026-06-28T19:00:00Z",
  status: "scheduled",
  home_goals: null,
  away_goals: null,
  home_penalties: null,
  away_penalties: null,
  home_team_name: "Canada",
  home_country_code: "CAN",
  away_team_name: "Mexico",
  away_country_code: "MEX",
  winner_team_name: null,
  winner_country_code: null,
};
assert.equal(publicMatchForFifaNoLocal([publicRow], 73)?.match_code, "M73");
assert.ok(isKnockoutMatchConfirmed(publicRow));
assert.ok(isMatchPickable(publicRow, new Date("2026-06-28T12:00:00Z").getTime()));
assert.ok(!isMatchPickable(publicRow, new Date("2026-06-28T20:00:00Z").getTime()));

assert.match(
  buildR32GradualUnlockDiagnosticLine([]),
  /no Round of 32 fixture rows found/,
);
assert.match(
  buildR32GradualUnlockDiagnosticLine([publicRow]),
  /1 pickable/,
);

console.log("publishRoundOf32Fixtures.selftest.ts: ok");
