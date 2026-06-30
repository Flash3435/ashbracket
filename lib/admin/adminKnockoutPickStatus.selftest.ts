import assert from "node:assert";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  buildAdminKnockoutParticipantStatus,
  buildAdminKnockoutPickStatusPanelData,
  formatAdminKnockoutReminderCopy,
  sortAdminKnockoutParticipants,
} from "./adminKnockoutPickStatus";

const teams: Team[] = [
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
    id: "team-ger",
    name: "Germany",
    countryCode: "GER",
    fifaCode: "GER",
    fifaRank: 5,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-fra",
    name: "France",
    countryCode: "FRA",
    fifaCode: "FRA",
    fifaRank: 2,
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
    id: "team-bra",
    name: "Brazil",
    countryCode: "BRA",
    fifaCode: "BRA",
    fifaRank: 3,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
];

function slot(
  partial: Partial<KnockoutPickSlotDraft> &
    Pick<KnockoutPickSlotDraft, "predictionKind" | "rowKey">,
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

function r16Slot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return slot({
    rowKey: `round_of_16|${slotKey}`,
    predictionKind: "round_of_16",
    slotKey,
    teamId,
  });
}

function qfSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return slot({
    rowKey: `quarterfinalist|${slotKey}`,
    predictionKind: "quarterfinalist",
    slotKey,
    teamId,
  });
}

function sfSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return slot({
    rowKey: `semifinalist|${slotKey}`,
    predictionKind: "semifinalist",
    slotKey,
    teamId,
  });
}

function finSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return slot({
    rowKey: `finalist|${slotKey}`,
    predictionKind: "finalist",
    slotKey,
    teamId,
  });
}

function champSlot(teamId = ""): KnockoutPickSlotDraft {
  return slot({
    rowKey: "champion|",
    predictionKind: "champion",
    teamId,
  });
}

function tournamentMatch(
  partial: Partial<TournamentMatchPublicRow> &
    Pick<TournamentMatchPublicRow, "match_code" | "stage_code">,
): TournamentMatchPublicRow {
  return {
    match_id: partial.match_code,
    edition_id: "ed",
    edition_code: "wc2026",
    match_code: partial.match_code,
    stage_code: partial.stage_code,
    stage_label: partial.stage_code,
    stage_sort_order: 2,
    group_code: null,
    round_index: 0,
    kickoff_at: partial.kickoff_at ?? "2026-07-01T19:00:00Z",
    status: partial.status ?? "scheduled",
    home_goals: null,
    away_goals: null,
    home_penalties: null,
    away_penalties: null,
    home_team_name: partial.home_team_name ?? "Home",
    home_country_code: partial.home_country_code ?? "GER",
    away_team_name: partial.away_team_name ?? "Away",
    away_country_code: partial.away_country_code ?? "FRA",
    winner_team_name: null,
    winner_country_code: null,
  };
}

function fullR16Slots(): KnockoutPickSlotDraft[] {
  return [
    r16Slot("1", "team-can"),
    r16Slot("2", "team-ger"),
    r16Slot("3", "team-ned"),
    r16Slot("4", "team-bra"),
    r16Slot("5", "team-fra"),
    r16Slot("6", "team-rsa"),
    r16Slot("7", "team-ned"),
    r16Slot("8", "team-bra"),
    r16Slot("9", "team-ned"),
    r16Slot("10", "team-ger"),
    r16Slot("11", "team-fra"),
    r16Slot("12", "team-ger"),
    r16Slot("13", "team-can"),
    r16Slot("14", "team-ned"),
    r16Slot("15", "team-bra"),
    r16Slot("16", "team-rsa"),
  ];
}

function fullBracketCompleteSlots(): KnockoutPickSlotDraft[] {
  return [
    ...fullR16Slots(),
    qfSlot("1", "team-ger"),
    qfSlot("2", "team-can"),
    qfSlot("3", "team-bra"),
    qfSlot("4", "team-ned"),
    qfSlot("5", "team-fra"),
    qfSlot("6", "team-ger"),
    qfSlot("7", "team-ned"),
    qfSlot("8", "team-can"),
    sfSlot("1", "team-ger"),
    sfSlot("2", "team-fra"),
    sfSlot("3", "team-bra"),
    sfSlot("4", "team-ned"),
    finSlot("1", "team-ger"),
    finSlot("2", "team-fra"),
    champSlot("team-ger"),
  ];
}

function r32Fixtures(): TournamentMatchPublicRow[] {
  return Array.from({ length: 16 }, (_, i) =>
    tournamentMatch({
      match_code: `M${73 + i}`,
      stage_code: "round_of_32",
      kickoff_at: `2026-07-0${1 + Math.floor(i / 8)}T${12 + (i % 8)}:00:00Z`,
      home_country_code: "GER",
      away_country_code: "FRA",
      home_team_name: "Germany",
      away_team_name: "France",
    }),
  );
}

const nowMs = new Date("2026-06-29T12:00:00.000Z").getTime();

function progressContext(slots: KnockoutPickSlotDraft[], overrides?: {
  tournamentMatches?: TournamentMatchPublicRow[];
  officialRoundOf32Complete?: boolean;
}) {
  return {
    slots,
    teams,
    tournamentMatches: overrides?.tournamentMatches ?? r32Fixtures(),
    officialRoundOf32Complete: overrides?.officialRoundOf32Complete ?? true,
    nowMs,
  };
}

// Full bracket complete participant
{
  const slots = fullBracketCompleteSlots();
  const status = buildAdminKnockoutParticipantStatus(
    "p1",
    "Alex",
    slots,
    progressContext(slots, { tournamentMatches: [] }),
    { teams },
  );
  assert.strictEqual(status.status, "complete");
  assert.strictEqual(status.missingCount, 0);
  assert.deepStrictEqual(status.stageBreakdown, {
    roundOf32: 0,
    roundOf16: 0,
    quarterFinals: 0,
    semiFinals: 0,
    finalChampion: 0,
  });
}

// Full bracket incomplete participant (missing semi-final picks)
{
  const slots = [
    ...fullR16Slots(),
    qfSlot("1", "team-ger"),
    qfSlot("2", "team-can"),
    qfSlot("3", "team-bra"),
    qfSlot("4", "team-ned"),
    qfSlot("5", "team-fra"),
    qfSlot("6", "team-ger"),
    qfSlot("7", "team-ned"),
    qfSlot("8", "team-can"),
    sfSlot("1", ""),
    sfSlot("2", ""),
    sfSlot("3", ""),
    sfSlot("4", ""),
    finSlot("1", ""),
    finSlot("2", ""),
    champSlot(),
  ];
  const status = buildAdminKnockoutParticipantStatus(
    "p2",
    "Blair",
    slots,
    progressContext(slots, { tournamentMatches: [] }),
    { teams },
  );
  assert.strictEqual(status.status, "incomplete");
  assert.ok(status.missingCount >= 4);
}

// Gradual R32 with only 3 pickable matchups
{
  const gradualMatches = [
    tournamentMatch({
      match_code: "M73",
      stage_code: "round_of_32",
      kickoff_at: "2026-06-30T19:00:00Z",
      home_country_code: "RSA",
      away_country_code: "CAN",
      home_team_name: "South Africa",
      away_team_name: "Canada",
    }),
    tournamentMatch({
      match_code: "M74",
      stage_code: "round_of_32",
      kickoff_at: "2026-06-30T22:00:00Z",
      home_country_code: "GER",
      away_country_code: "FRA",
      home_team_name: "Germany",
      away_team_name: "France",
    }),
    tournamentMatch({
      match_code: "M75",
      stage_code: "round_of_32",
      kickoff_at: "2026-07-01T01:00:00Z",
      home_country_code: "NED",
      away_country_code: "BRA",
      home_team_name: "Netherlands",
      away_team_name: "Brazil",
    }),
  ];
  const panel = buildAdminKnockoutPickStatusPanelData({
    poolId: "pool-1",
    poolName: "Test Pool",
    participants: [{ id: "p1", displayName: "Casey" }],
    slotsByParticipantId: new Map([["p1", []]]),
    teams,
    tournamentMatches: gradualMatches,
    officialRoundOf32Complete: false,
    nowMs,
  });
  assert.strictEqual(panel.state, "ready");
  const status = panel.incompleteParticipants[0] ?? panel.completeParticipants[0];
  assert.ok(status);
  assert.strictEqual(status.missingCount, 3);
  assert.strictEqual(status.stageBreakdown.roundOf32, 3);
  assert.strictEqual(status.stageBreakdown.roundOf16, 0);
}

// Participant missing one pickable R32 match
{
  const gradualMatches = [
    tournamentMatch({
      match_code: "M73",
      stage_code: "round_of_32",
      kickoff_at: "2026-06-30T19:00:00Z",
      home_country_code: "RSA",
      away_country_code: "CAN",
      home_team_name: "South Africa",
      away_team_name: "Canada",
    }),
    tournamentMatch({
      match_code: "M74",
      stage_code: "round_of_32",
      kickoff_at: "2026-06-30T22:00:00Z",
      home_country_code: "GER",
      away_country_code: "FRA",
      home_team_name: "Germany",
      away_team_name: "France",
    }),
  ];
  const slots = [r16Slot("1", "team-rsa")];
  const status = buildAdminKnockoutParticipantStatus(
    "p3",
    "Dana",
    slots,
    progressContext(slots, {
      tournamentMatches: gradualMatches,
      officialRoundOf32Complete: false,
    }),
    { teams },
  );
  assert.strictEqual(status.missingCount, 1);
  assert.strictEqual(status.stageBreakdown.roundOf32, 1);
}

// Participant missing a locked already-started match
{
  const startedMatch = tournamentMatch({
    match_code: "M73",
    stage_code: "round_of_32",
    kickoff_at: "2026-06-28T19:00:00Z",
    status: "live",
    home_country_code: "RSA",
    away_country_code: "CAN",
    home_team_name: "South Africa",
    away_team_name: "Canada",
  });
  const status = buildAdminKnockoutParticipantStatus(
    "p4",
    "Evan",
    [],
    progressContext([], {
      tournamentMatches: [startedMatch],
      officialRoundOf32Complete: false,
    }),
    { teams },
  );
  assert.strictEqual(status.missingCount, 0);
  assert.deepStrictEqual(status.lockedMissingLabels, ["M73"]);
}

// Blocked future matchups not counted as missing
{
  const gradualMatches = [
    tournamentMatch({
      match_code: "M73",
      stage_code: "round_of_32",
      kickoff_at: "2026-06-30T19:00:00Z",
      home_country_code: "RSA",
      away_country_code: "CAN",
      home_team_name: "South Africa",
      away_team_name: "Canada",
    }),
    tournamentMatch({
      match_code: "M74",
      stage_code: "round_of_32",
      kickoff_at: "2026-06-30T22:00:00Z",
      home_country_code: "GER",
      home_team_name: "Germany",
      away_country_code: "",
      away_team_name: "TBD",
    }),
  ];
  const status = buildAdminKnockoutParticipantStatus(
    "p5",
    "Finn",
    [],
    progressContext([], {
      tournamentMatches: gradualMatches,
      officialRoundOf32Complete: false,
    }),
    { teams },
  );
  assert.strictEqual(status.missingCount, 1);
  assert.strictEqual(status.stageBreakdown.roundOf32, 1);
}

// Sorting urgent missing first
{
  const gradualMatches = [
    tournamentMatch({
      match_code: "M73",
      stage_code: "round_of_32",
      kickoff_at: "2026-06-30T22:00:00Z",
      home_country_code: "RSA",
      away_country_code: "CAN",
      home_team_name: "South Africa",
      away_team_name: "Canada",
    }),
    tournamentMatch({
      match_code: "M74",
      stage_code: "round_of_32",
      kickoff_at: "2026-06-30T19:00:00Z",
      home_country_code: "GER",
      away_country_code: "FRA",
      home_team_name: "Germany",
      away_team_name: "France",
    }),
  ];
  const urgent = buildAdminKnockoutParticipantStatus(
    "p-urgent",
    "Gina",
    [r16Slot("1", "team-rsa")],
    progressContext([r16Slot("1", "team-rsa")], {
      tournamentMatches: gradualMatches,
      officialRoundOf32Complete: false,
    }),
    { teams },
  );
  const later = buildAdminKnockoutParticipantStatus(
    "p-later",
    "Hank",
    [r16Slot("2", "team-fra")],
    progressContext([r16Slot("2", "team-fra")], {
      tournamentMatches: gradualMatches,
      officialRoundOf32Complete: false,
    }),
    { teams },
  );
  const sorted = sortAdminKnockoutParticipants([later, urgent]);
  assert.strictEqual(sorted[0]?.participantId, "p-urgent");
  assert.ok(
    (sorted[0]?.urgentKickoffMs ?? Number.POSITIVE_INFINITY) <
      (sorted[1]?.urgentKickoffMs ?? Number.POSITIVE_INFINITY),
  );
}

// Participant with only locked missing (started R32) is actionably complete
{
  const startedMatches = [
    tournamentMatch({
      match_code: "M73",
      stage_code: "round_of_32",
      kickoff_at: "2026-06-28T19:00:00Z",
      status: "live",
      home_country_code: "RSA",
      away_country_code: "CAN",
      home_team_name: "South Africa",
      away_team_name: "Canada",
    }),
    tournamentMatch({
      match_code: "M74",
      stage_code: "round_of_32",
      kickoff_at: "2026-06-28T22:00:00Z",
      status: "finished",
      home_country_code: "GER",
      away_country_code: "FRA",
      home_team_name: "Germany",
      away_team_name: "France",
    }),
    tournamentMatch({
      match_code: "M75",
      stage_code: "round_of_32",
      kickoff_at: "2026-06-29T01:00:00Z",
      status: "finished",
      home_country_code: "NED",
      away_country_code: "BRA",
      home_team_name: "Netherlands",
      away_team_name: "Brazil",
    }),
  ];
  const status = buildAdminKnockoutParticipantStatus(
    "p-locked-only",
    "Ivy",
    [r16Slot("1", "team-rsa")],
    progressContext([r16Slot("1", "team-rsa")], {
      tournamentMatches: startedMatches,
      officialRoundOf32Complete: false,
    }),
    { teams },
  );
  assert.strictEqual(status.status, "complete");
  assert.strictEqual(status.actionableMissingCount, 0);
  assert.ok(status.lockedMissingLabels.includes("M74"));
}

// Caught up on all currently pickable gradual R32 picks is complete
{
  const gradualMatches = [
    tournamentMatch({
      match_code: "M73",
      stage_code: "round_of_32",
      kickoff_at: "2026-06-30T19:00:00Z",
      home_country_code: "RSA",
      away_country_code: "CAN",
      home_team_name: "South Africa",
      away_team_name: "Canada",
    }),
  ];
  const slots = [r16Slot("1", "team-rsa")];
  const status = buildAdminKnockoutParticipantStatus(
    "p-caught-up",
    "Jordan",
    slots,
    progressContext(slots, {
      tournamentMatches: gradualMatches,
      officialRoundOf32Complete: false,
    }),
    { teams },
  );
  assert.strictEqual(status.status, "complete");
  assert.strictEqual(status.actionableMissingCount, 0);
}

// Pickable missing without kickoff does not produce next urgent match
{
  const slots = [
    ...fullR16Slots(),
    ...Array.from({ length: 8 }, (_, i) => qfSlot(String(i + 1))),
  ];
  const status = buildAdminKnockoutParticipantStatus(
    "p-no-kickoff",
    "Kelly",
    slots,
    progressContext(slots, { tournamentMatches: [] }),
    { teams },
  );
  assert.ok(status.actionableMissingCount > 0);
  assert.strictEqual(status.nextUrgentMatch, null);
}

// Reminder copy helpers
{
  const generic = formatAdminKnockoutReminderCopy({
    participantName: "Jamie",
    poolName: "AshBracket 2026",
  });
  assert.ok(generic.includes("Jamie"));
  assert.ok(generic.includes("AshBracket 2026"));

  const urgent = formatAdminKnockoutReminderCopy({
    participantName: "Jamie",
    poolName: "AshBracket 2026",
    urgentMatch: {
      fifaMatchNo: 73,
      matchLabel: "M73 South Africa vs Canada",
      kickoffIso: "2026-06-30T19:00:00Z",
      kickoffLocal: "Mon, Jun 30, 2026, 3:00 p.m. EDT",
    },
  });
  assert.ok(urgent.includes("M73 South Africa vs Canada"));
  assert.ok(urgent.includes("before kickoff"));
}

console.log("adminKnockoutPickStatus.selftest.ts: ok");
