import assert from "node:assert";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  buildGradualR32MatchPickRows,
  buildGradualR32SavePayload,
  getGradualKnockoutSelectionState,
  hasGradualR32WinnerStorage,
  isFullKnockoutBracketPicksUnlocked,
  isKnockoutMatchConfirmed,
  isMatchPickable,
  promoteGradualR32WinnersToRoundOf32Slots,
  r16SlotKeyForR32MatchIndex,
  readGradualR32MatchWinner,
  r32SlotLockMessage,
  r32SlotRowDisplay,
  validateKnockoutMatchPick,
} from "./gradualKnockoutUnlock";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";

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
  assert.strictEqual(unconfirmed!.heading, "M74 · Round of 32");
  assert.strictEqual(unconfirmed!.emptyPrimaryLine, "Matchup not confirmed yet");
}

function r16SlotDraft(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `round_of_16|${slotKey}`,
    sectionLabel: "Round of 16",
    slotLabel: `Round of 16 · pick ${slotKey}`,
    predictionKind: "round_of_16",
    tournamentStageId: "stage-r16",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

function r32SlotDraft(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `round_of_32|${slotKey}`,
    sectionLabel: "Round of 32",
    slotLabel: `Round of 32 · pick ${slotKey}`,
    predictionKind: "round_of_32",
    tournamentStageId: "stage-r32",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

// Gradual UI model: 16 match rows, confirmed matchups appear once
{
  const r32Teams: Team[] = [
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
    {
      id: "team-ned",
      name: "Netherlands",
      countryCode: "NED",
      fifaCode: "NED",
      fifaRank: 8,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "team-mar",
      name: "Morocco",
      countryCode: "MAR",
      fifaCode: "MAR",
      fifaRank: 14,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "team-bra",
      name: "Brazil",
      countryCode: "BRA",
      fifaCode: "BRA",
      fifaRank: 3,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "team-jpn",
      name: "Japan",
      countryCode: "JPN",
      fifaCode: "JPN",
      fifaRank: 18,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
  ];
  const matches = [
    match({
      match_code: "M73",
      stage_code: "round_of_32",
      kickoff_at: "2026-06-28T19:00:00Z",
      home_country_code: "RSA",
      away_country_code: "CAN",
      home_team_name: "South Africa",
      away_team_name: "Canada",
    }),
    match({
      match_code: "M75",
      stage_code: "round_of_32",
      kickoff_at: "2026-06-29T19:00:00Z",
      home_country_code: "NED",
      away_country_code: "MAR",
      home_team_name: "Netherlands",
      away_team_name: "Morocco",
    }),
    match({
      match_code: "M76",
      stage_code: "round_of_32",
      kickoff_at: "2026-06-29T22:00:00Z",
      home_country_code: "BRA",
      away_country_code: "JPN",
      home_team_name: "Brazil",
      away_team_name: "Japan",
    }),
  ];
  const state = getGradualKnockoutSelectionState({
    matches,
    teams: r32Teams,
    nowMs: new Date("2026-06-28T12:00:00Z").getTime(),
    fullRoundOf32Official: false,
  });
  assert.strictEqual(state.confirmedCount, 3);
  assert.strictEqual(state.pickableCount, 3);

  const slots = Array.from({ length: 16 }, (_, i) =>
    r16SlotDraft(String(i + 1)),
  );
  const uiRows = buildGradualR32MatchPickRows({
    slots,
    state,
    teams: r32Teams,
    fullRoundOf32Official: false,
  });
  assert.strictEqual(uiRows.length, 16);
  const headings = uiRows.map((r) => r.display.heading);
  assert.strictEqual(headings.filter((h) => h === "M73 · Round of 32").length, 1);
  assert.strictEqual(headings.filter((h) => h === "M75 · Round of 32").length, 1);
  assert.strictEqual(headings.filter((h) => h === "M76 · Round of 32").length, 1);
  assert.strictEqual(headings.filter((h) => h === "M74 · Round of 32").length, 1);
  const m74 = uiRows.find((r) => r.fifaMatchNo === 74)!;
  assert.strictEqual(m74.lockReason, "unconfirmed");
  assert.strictEqual(m74.display.emptyPrimaryLine, "Matchup not confirmed yet");
  assert.strictEqual(r16SlotKeyForR32MatchIndex(0), "1");
}

// Saving M73 winner maps to one round_of_16 slot; legacy R32 slot still readable
{
  const r32Teams: Team[] = [
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
      }),
    ],
    teams: r32Teams,
    nowMs: new Date("2026-06-28T12:00:00Z").getTime(),
  });
  const ms = state.matchStates[0]!;
  const slots = [
    r16SlotDraft("1", "team-can"),
    ...Array.from({ length: 15 }, (_, i) => r16SlotDraft(String(i + 2))),
  ];
  assert.strictEqual(
    readGradualR32MatchWinner(0, slots, r32Teams, ms),
    "team-can",
  );

  const legacySlots = [
    r32SlotDraft("1", "team-rsa"),
    r32SlotDraft("2"),
    ...Array.from({ length: 14 }, (_, i) => r16SlotDraft(String(i + 1))),
  ];
  assert.strictEqual(
    readGradualR32MatchWinner(0, legacySlots, r32Teams, ms),
    "team-rsa",
  );
}

// Gradual save payload only includes group/third/bonus + pickable matchup rows
{
  const r32Teams: Team[] = [
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
      }),
    ],
    teams: r32Teams,
    nowMs: new Date("2026-06-28T12:00:00Z").getTime(),
  });
  const slots: KnockoutPickSlotDraft[] = [
    {
      rowKey: "group_winner|A",
      sectionLabel: "Group",
      slotLabel: "Group A winner",
      predictionKind: "group_winner",
      tournamentStageId: "stage-group",
      slotKey: null,
      groupCode: "A",
      bonusKey: null,
      teamId: "team-rsa",
    },
    ...Array.from({ length: 32 }, (_, i) => ({
      rowKey: `round_of_32|${i + 1}`,
      sectionLabel: "Round of 32",
      slotLabel: `Round of 32 · pick ${i + 1}`,
      predictionKind: "round_of_32" as const,
      tournamentStageId: "stage-r32",
      slotKey: String(i + 1),
      groupCode: null,
      bonusKey: null,
      teamId: "",
    })),
    ...Array.from({ length: 16 }, (_, i) => ({
      rowKey: `round_of_16|${i + 1}`,
      sectionLabel: "Round of 16",
      slotLabel: `Round of 16 · pick ${i + 1}`,
      predictionKind: "round_of_16" as const,
      tournamentStageId: "stage-r16",
      slotKey: String(i + 1),
      groupCode: null,
      bonusKey: null,
      teamId: i === 0 ? "team-rsa" : "",
    })),
  ];
  const payload = buildGradualR32SavePayload({ slots, state });
  assert.strictEqual(payload.filter((s) => s.predictionKind === "group_winner").length, 1);
  assert.strictEqual(
    payload.filter((s) => s.predictionKind === "round_of_16").length,
    1,
  );
  assert.strictEqual(
    payload.filter((s) => s.predictionKind === "round_of_32").length,
    2,
  );
  assert.strictEqual(
    payload.some((s) => s.predictionKind === "round_of_16" && s.slotKey === "2"),
    false,
  );

  const lockedPayload = buildGradualR32SavePayload({
    slots,
    state,
    omitFrozenPreBracketPicks: true,
  });
  assert.strictEqual(
    lockedPayload.some((s) => s.predictionKind === "group_winner"),
    false,
  );
  assert.strictEqual(
    lockedPayload.filter((s) => s.predictionKind === "round_of_16").length,
    1,
  );
}

// Full bracket unlock from confirmed fixtures without organizer results rows
{
  const r32 = Array.from({ length: 16 }, (_, i) =>
    match({
      match_code: `M${73 + i}`,
      stage_code: "round_of_32",
      kickoff_at: `2026-06-29T${10 + i}:00:00Z`,
      home_country_code: "USA",
      away_country_code: "MEX",
      home_team_name: "United States",
      away_team_name: "Mexico",
    }),
  );
  const state = getGradualKnockoutSelectionState({
    matches: r32,
    teams,
    fullRoundOf32Official: false,
  });
  assert.strictEqual(
    isFullKnockoutBracketPicksUnlocked({
      officialRoundOf32Complete: false,
      gradual: state,
    }),
    true,
  );
  assert.strictEqual(
    isFullKnockoutBracketPicksUnlocked({
      officialRoundOf32Complete: true,
      gradual: state,
    }),
    true,
  );
}

// Promote gradual R32 winners into round_of_32 slots before Round of 16
{
  const r32Matches = [
    match({
      match_code: "M73",
      stage_code: "round_of_32",
      kickoff_at: "2026-06-28T19:00:00Z",
      home_country_code: "USA",
      away_country_code: "MEX",
      home_team_name: "United States",
      away_team_name: "Mexico",
    }),
  ];
  const state = getGradualKnockoutSelectionState({
    matches: r32Matches,
    teams,
    fullRoundOf32Official: false,
  });
  const slots: KnockoutPickSlotDraft[] = [
    {
      rowKey: "round_of_16|1",
      sectionLabel: "Round of 16",
      slotLabel: "Round of 16 · pick 1",
      predictionKind: "round_of_16",
      tournamentStageId: "r16",
      slotKey: "1",
      groupCode: null,
      bonusKey: null,
      teamId: "team-usa",
    },
    {
      rowKey: "round_of_32|1",
      sectionLabel: "Round of 32",
      slotLabel: "Round of 32 · pick 1",
      predictionKind: "round_of_32",
      tournamentStageId: "r32",
      slotKey: "1",
      groupCode: null,
      bonusKey: null,
      teamId: "",
    },
    {
      rowKey: "round_of_32|2",
      sectionLabel: "Round of 32",
      slotLabel: "Round of 32 · pick 2",
      predictionKind: "round_of_32",
      tournamentStageId: "r32",
      slotKey: "2",
      groupCode: null,
      bonusKey: null,
      teamId: "",
    },
  ];
  assert.ok(hasGradualR32WinnerStorage(slots, state, teams));
  const promoted = promoteGradualR32WinnersToRoundOf32Slots(slots, state, teams);
  assert.strictEqual(
    promoted.find((s) => s.predictionKind === "round_of_16" && s.slotKey === "1")
      ?.teamId,
    "",
  );
  assert.strictEqual(
    promoted.find((s) => s.predictionKind === "round_of_32" && s.slotKey === "1")
      ?.teamId,
    "team-usa",
  );
  assert.strictEqual(
    promoted.find((s) => s.predictionKind === "round_of_32" && s.slotKey === "2")
      ?.teamId,
    "team-mex",
  );
}

console.log("gradualKnockoutUnlock.selftest.ts: ok");
