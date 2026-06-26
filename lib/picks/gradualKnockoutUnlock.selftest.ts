import assert from "node:assert";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  getGradualKnockoutSelectionState,
  isKnockoutMatchConfirmed,
  isMatchPickable,
  r32SlotLockMessage,
  r32SlotRowDisplay,
  validateKnockoutMatchPick,
} from "./gradualKnockoutUnlock";

function match(
  partial: Partial<TournamentMatchPublicRow> &
    Pick<TournamentMatchPublicRow, "match_code" | "stage_code">,
): TournamentMatchPublicRow {
  return {
    match_id: partial.match_id ?? partial.match_code,
    edition_id: "ed",
    edition_code: "wc2026",
    match_code: partial.match_code,
    stage_code: partial.stage_code,
    stage_label: partial.stage_code,
    stage_sort_order: partial.stage_sort_order ?? 2,
    group_code: partial.group_code ?? null,
    round_index: partial.round_index ?? 0,
    kickoff_at: partial.kickoff_at ?? null,
    status: partial.status ?? "scheduled",
    home_goals: null,
    away_goals: null,
    home_penalties: null,
    away_penalties: null,
    home_team_name: partial.home_team_name ?? null,
    home_country_code: partial.home_country_code ?? null,
    away_team_name: partial.away_team_name ?? null,
    away_country_code: partial.away_country_code ?? null,
    winner_team_name: null,
    winner_country_code: null,
  };
}

const teams: Team[] = [
  {
    id: "team-usa",
    name: "United States",
    countryCode: "USA",
    fifaCode: "USA",
    fifaRank: 12,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-mex",
    name: "Mexico",
    countryCode: "MEX",
    fifaCode: "MEX",
    fifaRank: 15,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
];

// Unconfirmed match — missing away team
{
  const m = match({
    match_code: "M73",
    stage_code: "round_of_32",
    kickoff_at: "2026-06-28T19:00:00Z",
    home_country_code: "USA",
    home_team_name: "United States",
  });
  assert.strictEqual(isKnockoutMatchConfirmed(m), false);
  assert.strictEqual(isMatchPickable(m), false);
}

// Confirmed unstarted match
{
  const m = match({
    match_code: "M73",
    stage_code: "round_of_32",
    kickoff_at: "2026-06-28T19:00:00Z",
    home_country_code: "USA",
    away_country_code: "MEX",
    home_team_name: "United States",
    away_team_name: "Mexico",
  });
  const nowMs = new Date("2026-06-28T12:00:00Z").getTime();
  assert.strictEqual(isKnockoutMatchConfirmed(m), true);
  assert.strictEqual(isMatchPickable(m, nowMs), true);

  const state = getGradualKnockoutSelectionState({
    matches: [m],
    teams,
    nowMs,
    fullRoundOf32Official: false,
  });
  assert.strictEqual(state.confirmedCount, 1);
  assert.strictEqual(state.pickableCount, 1);
  assert.strictEqual(state.pendingCount, 15);
  assert.strictEqual(state.earliestPickableKickoffIso, "2026-06-28T19:00:00Z");
  assert.strictEqual(
    r32SlotLockMessage("1", state, false),
    null,
  );
  assert.strictEqual(
    r32SlotLockMessage("3", state, false),
    "Matchup not confirmed yet",
  );
}

// Started match locks
{
  const m = match({
    match_code: "M73",
    stage_code: "round_of_32",
    kickoff_at: "2026-06-28T19:00:00Z",
    status: "live",
    home_country_code: "USA",
    away_country_code: "MEX",
  });
  const nowMs = new Date("2026-06-28T19:30:00Z").getTime();
  const state = getGradualKnockoutSelectionState({
    matches: [m, match({ match_code: "M74", stage_code: "round_of_32", kickoff_at: "2026-06-28T22:00:00Z", home_country_code: "BRA", away_country_code: "ARG", home_team_name: "Brazil", away_team_name: "Argentina" })],
    teams,
    nowMs,
    fullRoundOf32Official: false,
  });
  assert.strictEqual(state.anyR32Started, true);
  assert.strictEqual(r32SlotLockMessage("1", state, false), "Locked at kickoff");
  assert.strictEqual(r32SlotLockMessage("3", state, false), null);
}

// Save validation — team not in match
{
  const ms = getGradualKnockoutSelectionState({
    matches: [
      match({
        match_code: "M73",
        stage_code: "round_of_32",
        kickoff_at: "2026-06-28T19:00:00Z",
        home_country_code: "USA",
        away_country_code: "MEX",
      }),
    ],
    teams,
    nowMs: new Date("2026-06-28T12:00:00Z").getTime(),
  }).matchStates[0]!;
  const err = validateKnockoutMatchPick({
    slotKey: "1",
    selectedTeamId: "team-bra",
    match: ms,
    teams: [
      ...teams,
      {
        id: "team-bra",
        name: "Brazil",
        countryCode: "BRA",
        fifaCode: "BRA",
        fifaRank: 1,
        fifaRankAsOf: null,
        createdAt: "",
        updatedAt: "",
      },
    ],
  });
  assert.ok(err?.includes("not in this confirmed matchup"), err ?? "");
}

// R32 row display — confirmed matchup shows teams and match code
{
  const r32Teams: Team[] = [
    ...teams,
    {
      id: "team-rsa",
      name: "South Africa",
      countryCode: "RSA",
      fifaCode: "RSA",
      fifaRank: 30,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "team-can",
      name: "Canada",
      countryCode: "CAN",
      fifaCode: "CAN",
      fifaRank: 40,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
  ];
  const state = getGradualKnockoutSelectionState({
    matches: [
      match({
        match_code: "M73",
        stage_code: "round_of_32",
        kickoff_at: "2026-06-28T19:00:00Z",
        home_country_code: "RSA",
        away_country_code: "CAN",
        home_team_name: "South Africa",
        away_team_name: "Canada",
      }),
    ],
    teams: r32Teams,
    nowMs: new Date("2026-06-28T12:00:00Z").getTime(),
    fullRoundOf32Official: false,
  });
  const pickable = r32SlotRowDisplay(
    "1",
    state,
    r32Teams,
    false,
    "Round of 32 · pick 1",
  );
  assert.ok(pickable);
  assert.strictEqual(pickable!.heading, "M73 · Round of 32");
  assert.strictEqual(pickable!.emptyPrimaryLine, "South Africa vs Canada");
  assert.strictEqual(pickable!.chooseButtonLabel, "Pick winner");
  assert.strictEqual(pickable!.kickoffIso, "2026-06-28T19:00:00Z");

  const unconfirmed = r32SlotRowDisplay(
    "3",
    state,
    r32Teams,
    false,
    "Round of 32 · pick 3",
  );
  assert.ok(unconfirmed);
  assert.strictEqual(unconfirmed!.emptyPrimaryLine, "Matchup not confirmed yet");
}

console.log("gradualKnockoutUnlock.selftest.ts: ok");
