import assert from "node:assert/strict";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import type { GradualKnockoutSelectionState } from "./gradualKnockoutUnlock";
import {
  blockedKnockoutStepGateCopy,
  clearedPickRowKeySet,
  LOCKED_KNOCKOUT_NO_ACTION_HEADLINE,
  participantLockedKnockoutRowBody,
  participantLockedKnockoutRowKind,
  participantLockedKnockoutStatusHeadline,
  participantNonActionableLockedKnockoutRows,
} from "./knockoutBlockedRowExplanation";
import { getGradualKnockoutSelectionState } from "./gradualKnockoutUnlock";
import { buildKnockoutMatchPickRows } from "./knockoutMatchPickRows";
import {
  getKnockoutStepCompletionFromDraftState,
  getMissingFeederSummaryForStep,
  resolveKnockoutProgressContext,
} from "./knockoutMatchProgress";
import { getKnockoutRepairActionSummary } from "./knockoutWizardAction";
import { pruneOfficialKnockoutPathPicks } from "../predictions/pruneOfficialKnockoutPathPicks";

const teams: Team[] = [
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
    id: "team-par",
    name: "Paraguay",
    countryCode: "PAR",
    fifaCode: "PAR",
    fifaRank: 50,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-swe",
    name: "Sweden",
    countryCode: "SWE",
    fifaCode: "SWE",
    fifaRank: 20,
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

const emptyGradual = {
  r32MatchCount: 16,
  confirmedCount: 16,
  pickableCount: 16,
  pendingCount: 0,
  allR32Confirmed: true,
  anyR32Started: false,
  earliestPickableKickoffIso: null,
  matchStates: [],
} satisfies GradualKnockoutSelectionState;

function qfSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `quarterfinalist|${slotKey}`,
    sectionLabel: "Quarter-finals",
    slotLabel: `Quarter-finals · pick ${slotKey}`,
    predictionKind: "quarterfinalist",
    tournamentStageId: "qf",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

function r16Slot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `round_of_16|${slotKey}`,
    sectionLabel: "Round of 16",
    slotLabel: `Round of 16 · pick ${slotKey}`,
    predictionKind: "round_of_16",
    tournamentStageId: "r16",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

function r32Side(slotKey: string, teamId: string): KnockoutPickSlotDraft {
  return {
    rowKey: `round_of_32|${slotKey}`,
    sectionLabel: "Round of 32",
    slotLabel: `R32 ${slotKey}`,
    predictionKind: "round_of_32",
    tournamentStageId: "r32",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

const r32OfficialResults: TournamentMatchPublicRow[] = [
  {
    match_id: "m74",
    edition_id: "ed",
    edition_code: "2026",
    match_code: "M74",
    stage_code: "round_of_32",
    stage_label: "Round of 32",
    stage_sort_order: 2,
    group_code: null,
    round_index: 1,
    kickoff_at: "2026-07-01T18:00:00Z",
    status: "finished",
    home_goals: 2,
    away_goals: 0,
    home_penalties: null,
    away_penalties: null,
    home_team_name: "Germany",
    home_country_code: "GER",
    away_team_name: "France",
    away_country_code: "FRA",
    winner_team_name: "Germany",
    winner_country_code: "GER",
  },
  {
    match_id: "m77",
    edition_id: "ed",
    edition_code: "2026",
    match_code: "M77",
    stage_code: "round_of_32",
    stage_label: "Round of 32",
    stage_sort_order: 2,
    group_code: null,
    round_index: 4,
    kickoff_at: "2026-07-01T21:00:00Z",
    status: "finished",
    home_goals: 1,
    away_goals: 0,
    home_penalties: null,
    away_penalties: null,
    home_team_name: "Paraguay",
    home_country_code: "PAR",
    away_team_name: "Sweden",
    away_country_code: "SWE",
    winner_team_name: "Paraguay",
    winner_country_code: "PAR",
  },
  {
    match_id: "m73",
    edition_id: "ed",
    edition_code: "2026",
    match_code: "M73",
    stage_code: "round_of_32",
    stage_label: "Round of 32",
    stage_sort_order: 2,
    group_code: null,
    round_index: 0,
    kickoff_at: "2026-07-01T15:00:00Z",
    status: "finished",
    home_goals: 2,
    away_goals: 1,
    home_penalties: null,
    away_penalties: null,
    home_team_name: "Netherlands",
    home_country_code: "NED",
    away_team_name: "USA",
    away_country_code: "USA",
    winner_team_name: "Netherlands",
    winner_country_code: "NED",
  },
  {
    match_id: "m75",
    edition_id: "ed",
    edition_code: "2026",
    match_code: "M75",
    stage_code: "round_of_32",
    stage_label: "Round of 32",
    stage_sort_order: 2,
    group_code: null,
    round_index: 2,
    kickoff_at: "2026-07-01T18:00:00Z",
    status: "finished",
    home_goals: 0,
    away_goals: 1,
    home_penalties: null,
    away_penalties: null,
    home_team_name: "Brazil",
    home_country_code: "BRA",
    away_team_name: "Japan",
    away_country_code: "JPN",
    winner_team_name: "Brazil",
    winner_country_code: "BRA",
  },
];

// QF blocked by frozen R16 feeder waiting for official winner
{
  const tournamentMatches: TournamentMatchPublicRow[] = [
    ...r32OfficialResults,
    {
      match_id: "m89",
      edition_id: "ed",
      edition_code: "2026",
      match_code: "M89",
      stage_code: "round_of_16",
      stage_label: "Round of 16",
      stage_sort_order: 3,
      group_code: null,
      round_index: 0,
      kickoff_at: "2026-07-05T18:00:00Z",
      status: "live",
      home_goals: null,
      away_goals: null,
      home_penalties: null,
      away_penalties: null,
      home_team_name: "Germany",
      home_country_code: "GER",
      away_team_name: "Paraguay",
      away_country_code: "PAR",
      winner_team_name: null,
      winner_country_code: null,
    },
    {
      match_id: "m90",
      edition_id: "ed",
      edition_code: "2026",
      match_code: "M90",
      stage_code: "round_of_16",
      stage_label: "Round of 16",
      stage_sort_order: 3,
      group_code: null,
      round_index: 1,
      kickoff_at: "2026-07-05T21:00:00Z",
      status: "finished",
      home_goals: 1,
      away_goals: 0,
      home_penalties: null,
      away_penalties: null,
      home_team_name: "Netherlands",
      home_country_code: "NED",
      away_team_name: "Brazil",
      away_country_code: "BRA",
      winner_team_name: "Netherlands",
      winner_country_code: "NED",
    },
  ];
  const slots: KnockoutPickSlotDraft[] = [
    r32Side("2", "team-ger"),
    r32Side("5", "team-par"),
    qfSlot("1", ""),
    qfSlot("2", "team-ned"),
    ...Array.from({ length: 6 }, (_, i) => qfSlot(String(i + 3), "team-ger")),
  ];
  const input = {
    bracketKind: "quarterfinalist" as const,
    slots,
    teams,
    tournamentMatches,
    gradual: emptyGradual,
    knockoutBracketPicksUnlocked: true,
  };
  const qfRows = buildKnockoutMatchPickRows(input);
  const m97 = qfRows.find((r) => r.fifaMatchNo === 97)!;
  assert.strictEqual(m97.lockReason, "incomplete");
  assert.match(
    m97.display.emptyPrimaryLine!,
    /M97 is waiting for the winner of Germany vs Paraguay/i,
  );
  assert.strictEqual(m97.display.statusLine, null);
  assert.doesNotMatch(
    m97.display.emptyPrimaryLine!,
    /Complete previous round picks first/i,
  );

  const gate = blockedKnockoutStepGateCopy("quarterfinalist", input);
  assert.match(gate!, /waiting on an earlier result/i);
  assert.doesNotMatch(gate!, /M97 is waiting for the winner/i);
}

// QF blocked by editable missing R16 pick
{
  const slots: KnockoutPickSlotDraft[] = [
    r16Slot("2", "team-ger"),
    r16Slot("5", "team-par"),
    r16Slot("1", "team-ned"),
    r16Slot("4", "team-bra"),
    qfSlot("1", ""),
    qfSlot("2", "team-ned"),
    ...Array.from({ length: 6 }, (_, i) => qfSlot(String(i + 3), "team-ger")),
  ];
  const input = {
    bracketKind: "quarterfinalist" as const,
    slots,
    teams,
    tournamentMatches: null,
    gradual: emptyGradual,
    knockoutBracketPicksUnlocked: true,
  };
  const r16Rows = buildKnockoutMatchPickRows({
    ...input,
    bracketKind: "round_of_16",
  });
  const m89 = r16Rows.find((r) => r.fifaMatchNo === 89)!;
  assert.strictEqual(m89.lockReason, "pickable");
  assert.strictEqual(m89.homeTeamId, "team-ger");
  assert.strictEqual(m89.awayTeamId, "team-par");
  const m97 = buildKnockoutMatchPickRows(input).find((r) => r.fifaMatchNo === 97)!;
  assert.match(
    m97.display.emptyPrimaryLine!,
    /Pick a winner for Germany vs Paraguay first/i,
  );
  assert.strictEqual(m97.display.statusLine, null);
}

// QF blocked by locked cleared R16 feeder
{
  const tournamentMatches: TournamentMatchPublicRow[] = [
    ...r32OfficialResults,
    {
      match_id: "m89",
      edition_id: "ed",
      edition_code: "2026",
      match_code: "M89",
      stage_code: "round_of_16",
      stage_label: "Round of 16",
      stage_sort_order: 3,
      group_code: null,
      round_index: 0,
      kickoff_at: "2026-07-05T18:00:00Z",
      status: "finished",
      home_goals: 2,
      away_goals: 1,
      home_penalties: null,
      away_penalties: null,
      home_team_name: "Germany",
      home_country_code: "GER",
      away_team_name: "Paraguay",
      away_country_code: "PAR",
      winner_team_name: null,
      winner_country_code: null,
    },
  ];
  const before: KnockoutPickSlotDraft[] = [
    r32Side("2", "team-ger"),
    r32Side("5", "team-par"),
    qfSlot("1", "team-can"),
    ...Array.from({ length: 7 }, (_, i) => qfSlot(String(i + 2), "team-ger")),
  ];
  const { slots: repaired, cleared } = pruneOfficialKnockoutPathPicks(before);
  const clearedKeys = clearedPickRowKeySet(cleared);
  const input = {
    bracketKind: "quarterfinalist" as const,
    slots: repaired,
    teams,
    tournamentMatches,
    gradual: emptyGradual,
    knockoutBracketPicksUnlocked: true,
    clearedPickRowKeys: clearedKeys,
  };
  const m97 = buildKnockoutMatchPickRows(input).find((r) => r.fifaMatchNo === 97)!;
  assert.match(
    m97.display.emptyPrimaryLine!,
    /This path depended on Germany vs Paraguay and is no longer alive/i,
  );
  assert.strictEqual(m97.display.statusLine, null);
  assert.doesNotMatch(m97.display.emptyPrimaryLine!, /waiting for the winner/i);
  assert.doesNotMatch(m97.display.emptyPrimaryLine!, /Save/i);

  const repairSummary = getKnockoutRepairActionSummary(
    {
      slots: repaired,
      teams,
      tournamentMatches,
      officialRoundOf32Complete: true,
      clearedPickRowKeys: clearedKeys,
    },
    cleared,
  );
  assert.equal(repairSummary.headline, LOCKED_KNOCKOUT_NO_ACTION_HEADLINE);
  assert.match(
    repairSummary.detail,
    /Germany vs Paraguay: No pick saved — match has kicked off/i,
  );
  assert.match(repairSummary.detail, /No action is needed/i);
  assert.equal(repairSummary.ctaLabel, null);
}

// SF blocked indirectly by cleared locked QF feeder
{
  const tournamentMatches: TournamentMatchPublicRow[] = [
    ...r32OfficialResults,
    {
      match_id: "m89",
      edition_id: "ed",
      edition_code: "2026",
      match_code: "M89",
      stage_code: "round_of_16",
      stage_label: "Round of 16",
      stage_sort_order: 3,
      group_code: null,
      round_index: 0,
      kickoff_at: "2026-07-05T18:00:00Z",
      status: "finished",
      home_goals: 2,
      away_goals: 1,
      home_penalties: null,
      away_penalties: null,
      home_team_name: "Germany",
      home_country_code: "GER",
      away_team_name: "Paraguay",
      away_country_code: "PAR",
      winner_team_name: null,
      winner_country_code: null,
    },
  ];
  const before: KnockoutPickSlotDraft[] = [
    r32Side("2", "team-ger"),
    r32Side("5", "team-par"),
    qfSlot("1", "team-can"),
    qfSlot("2", "team-ned"),
    qfSlot("3", "team-bra"),
    qfSlot("4", "team-ned"),
    qfSlot("5", "team-ger"),
    qfSlot("6", "team-ger"),
    qfSlot("7", "team-ned"),
    qfSlot("8", "team-can"),
    {
      rowKey: "semifinalist|1",
      sectionLabel: "Semi-finals",
      slotLabel: "Semi-finals · pick 1",
      predictionKind: "semifinalist",
      tournamentStageId: "sf",
      slotKey: "1",
      groupCode: null,
      bonusKey: null,
      teamId: "team-ger",
    },
  ];
  const { slots: repaired, cleared } = pruneOfficialKnockoutPathPicks(before);
  const clearedKeys = clearedPickRowKeySet(cleared);
  const sfInput = {
    bracketKind: "semifinalist" as const,
    slots: repaired,
    teams,
    tournamentMatches,
    gradual: emptyGradual,
    knockoutBracketPicksUnlocked: true,
    clearedPickRowKeys: clearedKeys,
  };
  const m101 = buildKnockoutMatchPickRows(sfInput).find((r) => r.fifaMatchNo === 101)!;
  assert.match(
    m101.display.emptyPrimaryLine!,
    /This path is out because your M97 quarter-final pick was eliminated/i,
  );
  assert.strictEqual(m101.display.statusLine, null);
  assert.doesNotMatch(m101.display.emptyPrimaryLine!, /waiting for the winner/i);
  assert.doesNotMatch(m101.display.emptyPrimaryLine!, /Pick a winner for/i);
  assert.doesNotMatch(m101.display.emptyPrimaryLine!, /Save/i);

  const r16Status = getKnockoutStepCompletionFromDraftState(
    "round_of_16",
    resolveKnockoutProgressContext({
      slots: repaired,
      teams,
      tournamentMatches,
      officialRoundOf32Complete: true,
      clearedPickRowKeys: clearedKeys,
    }),
  );
  assert.strictEqual(r16Status.kind, "locked_out");
  assert.strictEqual(r16Status.complete, false);

  const qfStatus = getKnockoutStepCompletionFromDraftState(
    "quarterfinalist",
    resolveKnockoutProgressContext({
      slots: repaired,
      teams,
      tournamentMatches,
      officialRoundOf32Complete: true,
      clearedPickRowKeys: clearedKeys,
    }),
  );
  assert.strictEqual(qfStatus.kind, "complete");
  assert.strictEqual(qfStatus.complete, true);
}

// Green R16 pill + blocked QF never emits generic previous-round copy
{
  const tournamentMatches: TournamentMatchPublicRow[] = [
    ...r32OfficialResults,
    {
      match_id: "m89",
      edition_id: "ed",
      edition_code: "2026",
      match_code: "M89",
      stage_code: "round_of_16",
      stage_label: "Round of 16",
      stage_sort_order: 3,
      group_code: null,
      round_index: 0,
      kickoff_at: "2026-07-05T18:00:00Z",
      status: "live",
      home_goals: null,
      away_goals: null,
      home_penalties: null,
      away_penalties: null,
      home_team_name: "Germany",
      home_country_code: "GER",
      away_team_name: "Paraguay",
      away_country_code: "PAR",
      winner_team_name: null,
      winner_country_code: null,
    },
    {
      match_id: "m90",
      edition_id: "ed",
      edition_code: "2026",
      match_code: "M90",
      stage_code: "round_of_16",
      stage_label: "Round of 16",
      stage_sort_order: 3,
      group_code: null,
      round_index: 1,
      kickoff_at: "2026-07-05T21:00:00Z",
      status: "finished",
      home_goals: 1,
      away_goals: 0,
      home_penalties: null,
      away_penalties: null,
      home_team_name: "Netherlands",
      home_country_code: "NED",
      away_team_name: "Brazil",
      away_country_code: "BRA",
      winner_team_name: "Netherlands",
      winner_country_code: "NED",
    },
  ];
  const slots: KnockoutPickSlotDraft[] = [
    r32Side("2", "team-ger"),
    r32Side("5", "team-par"),
    qfSlot("1", ""),
    qfSlot("2", "team-ned"),
    ...Array.from({ length: 6 }, (_, i) => qfSlot(String(i + 3), "team-ger")),
  ];
  const ctx = resolveKnockoutProgressContext({
    slots,
    teams,
    tournamentMatches,
    officialRoundOf32Complete: true,
  });
  const r16Status = getKnockoutStepCompletionFromDraftState("round_of_16", ctx);
  assert.strictEqual(r16Status.missingPickable, 0);
  const qfGate = getMissingFeederSummaryForStep("quarterfinalist", ctx);
  assert.ok(qfGate);
  assert.doesNotMatch(qfGate, /Complete previous round picks first/i);
  assert.match(qfGate, /waiting on an earlier result/i);
  assert.doesNotMatch(qfGate, /M97 is waiting for the winner/i);
}

// Missing M94 before kickoff (Seema-style): pickable, not a locked-empty row
{
  const seemaTeams: Team[] = [
    ...teams,
    {
      id: "team-us",
      name: "United States",
      countryCode: "USA",
      fifaCode: "USA",
      fifaRank: 15,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "team-bel",
      name: "Belgium",
      countryCode: "BEL",
      fifaCode: "BEL",
      fifaRank: 12,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "team-fra",
      name: "France",
      countryCode: "FRA",
      fifaCode: "FRA",
      fifaRank: 10,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "team-eng",
      name: "England",
      countryCode: "ENG",
      fifaCode: "ENG",
      fifaRank: 4,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
  ];
  const seemaMatches: TournamentMatchPublicRow[] = [
    {
      match_id: "m81",
      edition_id: "ed",
      edition_code: "wc2026",
      match_code: "M81",
      stage_code: "round_of_32",
      stage_label: "Round of 32",
      stage_sort_order: 2,
      group_code: null,
      round_index: 0,
      kickoff_at: "2026-07-01T19:00:00Z",
      status: "finished",
      home_goals: 2,
      away_goals: 1,
      home_penalties: null,
      away_penalties: null,
      home_team_name: "United States",
      home_country_code: "USA",
      away_team_name: "Bosnia and Herzegovina",
      away_country_code: "BIH",
      winner_team_name: "United States",
      winner_country_code: "USA",
    },
    {
      match_id: "m82",
      edition_id: "ed",
      edition_code: "wc2026",
      match_code: "M82",
      stage_code: "round_of_32",
      stage_label: "Round of 32",
      stage_sort_order: 2,
      group_code: null,
      round_index: 0,
      kickoff_at: "2026-07-01T22:00:00Z",
      status: "finished",
      home_goals: 1,
      away_goals: 0,
      home_penalties: null,
      away_penalties: null,
      home_team_name: "Belgium",
      home_country_code: "BEL",
      away_team_name: "Senegal",
      away_country_code: "SEN",
      winner_team_name: "Belgium",
      winner_country_code: "BEL",
    },
  ];
  const seemaSlots: KnockoutPickSlotDraft[] = [
    ...Array.from({ length: 16 }, (_, i) =>
      qfSlot(String(i + 1), i + 1 === 6 ? "" : "team-fra"),
    ),
    ...Array.from({ length: 16 }, (_, i) => ({
      rowKey: `round_of_32|${i + 1}`,
      sectionLabel: "Round of 32",
      slotLabel: `R32 ${i + 1}`,
      predictionKind: "round_of_32" as const,
      tournamentStageId: "r32",
      slotKey: String(i + 1),
      groupCode: null,
      bonusKey: null,
      teamId: "team-fra",
    })),
    {
      rowKey: "semifinalist|1",
      sectionLabel: "Semi-finals",
      slotLabel: "Semi-finals · pick 1",
      predictionKind: "semifinalist",
      tournamentStageId: "sf",
      slotKey: "1",
      groupCode: null,
      bonusKey: null,
      teamId: "team-fra",
    },
    {
      rowKey: "finalist|1",
      sectionLabel: "Final",
      slotLabel: "Final · pick 1",
      predictionKind: "finalist",
      tournamentStageId: "fin",
      slotKey: "1",
      groupCode: null,
      bonusKey: null,
      teamId: "team-eng",
    },
  ];
  const seemaGradual = getGradualKnockoutSelectionState({
    matches: seemaMatches,
    teams: seemaTeams,
    fullRoundOf32Official: true,
  });
  const matchInput = {
    slots: seemaSlots,
    teams: seemaTeams,
    tournamentMatches: seemaMatches,
    gradual: seemaGradual,
    knockoutBracketPicksUnlocked: true,
  };
  const m94 = buildKnockoutMatchPickRows({
    ...matchInput,
    bracketKind: "round_of_16",
  }).find((r) => r.fifaMatchNo === 94)!;
  assert.strictEqual(m94.lockReason, "pickable");
  assert.strictEqual(participantLockedKnockoutRowKind(m94), null);

  const lockedRows = participantNonActionableLockedKnockoutRows(matchInput);
  assert.ok(!lockedRows.some((r) => r.fifaMatchNo === 94));
}

// Missing R16 pick after kickoff: locked-empty with kickoff copy
{
  const kickoffTeams: Team[] = [
    ...teams,
    {
      id: "team-us",
      name: "United States",
      countryCode: "USA",
      fifaCode: "USA",
      fifaRank: 15,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "team-bel",
      name: "Belgium",
      countryCode: "BEL",
      fifaCode: "BEL",
      fifaRank: 12,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
  ];
  const kickoffSlots: KnockoutPickSlotDraft[] = [
    qfSlot("6", ""),
    r16Slot("9", "team-us"),
    r16Slot("10", "team-bel"),
  ];
  const kickoffPast = "2020-01-01T12:00:00Z";
  const afterKickoffMatches: TournamentMatchPublicRow[] = [
    {
      match_id: "m81",
      edition_id: "ed",
      edition_code: "wc2026",
      match_code: "M81",
      stage_code: "round_of_32",
      stage_label: "Round of 32",
      stage_sort_order: 2,
      group_code: null,
      round_index: 0,
      kickoff_at: "2019-06-01T19:00:00Z",
      status: "finished",
      home_goals: 2,
      away_goals: 1,
      home_penalties: null,
      away_penalties: null,
      home_team_name: "United States",
      home_country_code: "USA",
      away_team_name: "Bosnia and Herzegovina",
      away_country_code: "BIH",
      winner_team_name: "United States",
      winner_country_code: "USA",
    },
    {
      match_id: "m82",
      edition_id: "ed",
      edition_code: "wc2026",
      match_code: "M82",
      stage_code: "round_of_32",
      stage_label: "Round of 32",
      stage_sort_order: 2,
      group_code: null,
      round_index: 0,
      kickoff_at: "2019-06-01T22:00:00Z",
      status: "finished",
      home_goals: 1,
      away_goals: 0,
      home_penalties: null,
      away_penalties: null,
      home_team_name: "Belgium",
      home_country_code: "BEL",
      away_team_name: "Senegal",
      away_country_code: "SEN",
      winner_team_name: "Belgium",
      winner_country_code: "BEL",
    },
    {
      match_id: "m94",
      edition_id: "ed",
      edition_code: "wc2026",
      match_code: "M94",
      stage_code: "round_of_16",
      stage_label: "Round of 16",
      stage_sort_order: 3,
      group_code: null,
      round_index: 0,
      kickoff_at: kickoffPast,
      status: "live",
      home_goals: null,
      away_goals: null,
      home_penalties: null,
      away_penalties: null,
      home_team_name: "United States",
      home_country_code: "USA",
      away_team_name: "Belgium",
      away_country_code: "BEL",
      winner_team_name: null,
      winner_country_code: null,
    },
  ];
  const afterKickoffGradual = getGradualKnockoutSelectionState({
    matches: afterKickoffMatches,
    teams: kickoffTeams,
    nowMs: Date.parse("2020-06-01T12:00:00Z"),
    fullRoundOf32Official: true,
  });
  const afterKickoffInput = {
    slots: kickoffSlots,
    teams: kickoffTeams,
    tournamentMatches: afterKickoffMatches,
    gradual: afterKickoffGradual,
    knockoutBracketPicksUnlocked: true,
    nowMs: Date.parse("2020-06-01T12:00:00Z"),
  };
  const m94After = buildKnockoutMatchPickRows({
    ...afterKickoffInput,
    bracketKind: "round_of_16",
  }).find((r) => r.fifaMatchNo === 94)!;
  assert.strictEqual(m94After.lockReason, "started");
  assert.strictEqual(participantLockedKnockoutRowKind(m94After), "locked_empty");
  assert.match(
    participantLockedKnockoutRowBody(m94After, kickoffTeams),
    /No pick saved — match has kicked off/i,
  );
  assert.ok(
    participantNonActionableLockedKnockoutRows(afterKickoffInput).some(
      (r) => r.fifaMatchNo === 94,
    ),
  );
}

console.log("knockoutBlockedRowExplanation.selftest.ts: ok");
