import assert from "node:assert";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import {
  buildKnockoutMatchProgress,
  firstActionableIncompleteKnockoutWizardStep,
  getKnockoutStepCompletionFromDraftState,
  getMissingFeederSummaryForStep,
  isKnockoutWizardStepComplete,
  knockoutStepPillPresentation,
  resolveKnockoutProgressContext,
} from "./knockoutMatchProgress";
import {
  buildKnockoutMatchPickRows,
  readConfirmedKnockoutMatchWinner,
} from "./knockoutMatchPickRows";
import {
  findFirstKnockoutWizardActionNeeded,
  getKnockoutRepairActionSummary,
  requiresParticipantKnockoutRepairSave,
  resolveParticipantKnockoutDraftSaveRequired,
} from "./knockoutWizardAction";
import { pruneOfficialKnockoutPathPicks } from "../predictions/pruneOfficialKnockoutPathPicks";
import type { GradualKnockoutSelectionState } from "./gradualKnockoutUnlock";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

const teams: Team[] = [
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
    id: "team-rsa",
    name: "South Africa",
    countryCode: "RSA",
    fifaCode: "RSA",
    fifaRank: 30,
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

function sfSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `semifinalist|${slotKey}`,
    sectionLabel: "Semi-finals",
    slotLabel: `Semi-finals · pick ${slotKey}`,
    predictionKind: "semifinalist",
    tournamentStageId: "sf",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

function finSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `finalist|${slotKey}`,
    sectionLabel: "The final",
    slotLabel: `Final pick ${slotKey}`,
    predictionKind: "finalist",
    tournamentStageId: "fin",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

function champSlot(teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: "champion|",
    sectionLabel: "Champion",
    slotLabel: "Champion",
    predictionKind: "champion",
    tournamentStageId: "fin",
    slotKey: null,
    groupCode: null,
    bonusKey: null,
    teamId,
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

function progressCtx(slots: KnockoutPickSlotDraft[]) {
  return resolveKnockoutProgressContext({
    slots,
    teams,
    officialRoundOf32Complete: true,
  });
}

function assertStepComplete(
  slots: KnockoutPickSlotDraft[],
  bracketKind: Parameters<typeof isKnockoutWizardStepComplete>[0],
  expected: boolean,
) {
  const ctx = progressCtx(slots);
  assert.strictEqual(
    isKnockoutWizardStepComplete(bracketKind, ctx),
    expected,
    `${bracketKind} complete expected ${expected}`,
  );
}

// QF incomplete (missing R16 slot 7): later steps must not appear complete
{
  const slots: KnockoutPickSlotDraft[] = [
    ...fullR16Slots(),
    qfSlot("1", "team-ger"),
    qfSlot("2", "team-can"),
    qfSlot("3", "team-bra"),
    qfSlot("4", "team-ned"),
    qfSlot("5", "team-fra"),
    qfSlot("6", "team-ger"),
    qfSlot("7"),
    qfSlot("8"),
  ];
  assertStepComplete(slots, "round_of_16", false);
  assertStepComplete(slots, "quarterfinalist", false);
  assertStepComplete(slots, "semifinalist", false);
  assertStepComplete(slots, "finalist", false);
  assertStepComplete(slots, "champion", false);

  const progress = buildKnockoutMatchProgress({
    slots,
    teams,
    officialRoundOf32Complete: true,
  });
  assert.strictEqual(progress.complete, false);
  assert.strictEqual(
    progress.steps.find((s) => s.bracketKind === "quarterfinalist")?.complete,
    false,
  );
}

// R16 complete but QF empty: QF incomplete, later steps blocked
{
  const slots: KnockoutPickSlotDraft[] = [
    ...fullR16Slots(),
    qfSlot("1", "team-ger"),
    qfSlot("2", "team-can"),
    qfSlot("3", "team-bra"),
    qfSlot("4", "team-ned"),
    qfSlot("5", "team-fra"),
    qfSlot("6", "team-ger"),
    qfSlot("7", "team-ned"),
    qfSlot("8", "team-can"),
    ...Array.from({ length: 4 }, (_, i) => sfSlot(String(i + 1))),
    finSlot("1"),
    finSlot("2"),
    champSlot(),
  ];
  assertStepComplete(slots, "round_of_16", true);
  assertStepComplete(slots, "quarterfinalist", false);
  assertStepComplete(slots, "semifinalist", false);
  assertStepComplete(slots, "finalist", false);
  assertStepComplete(slots, "champion", false);
}

// Full bracket complete: all knockout steps complete
{
  const slots: KnockoutPickSlotDraft[] = [
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
  assertStepComplete(slots, "round_of_16", true);
  assertStepComplete(slots, "quarterfinalist", true);
  assertStepComplete(slots, "semifinalist", true);
  assertStepComplete(slots, "finalist", true);
  assertStepComplete(slots, "champion", true);

  const progress = buildKnockoutMatchProgress({
    slots,
    teams,
    officialRoundOf32Complete: true,
  });
  assert.strictEqual(progress.complete, true);
}

// Stale downstream slot picks do not mark blocked steps complete
{
  const slots: KnockoutPickSlotDraft[] = [
    r16Slot("1", "team-can"),
    r16Slot("2", "team-ger"),
    r16Slot("3", "team-ned"),
    r16Slot("4", "team-bra"),
    r16Slot("5", "team-fra"),
    ...Array.from({ length: 11 }, (_, i) => r16Slot(String(i + 6))),
    qfSlot("1", "team-can"),
    qfSlot("2", "team-ger"),
    ...Array.from({ length: 6 }, (_, i) => qfSlot(String(i + 3), "team-ger")),
    ...Array.from({ length: 4 }, (_, i) => sfSlot(String(i + 1), "team-ger")),
    finSlot("1", "team-ger"),
    champSlot("team-ger"),
  ];
  assertStepComplete(slots, "round_of_16", false);
  assertStepComplete(slots, "quarterfinalist", false);
  assertStepComplete(slots, "semifinalist", false);
  assertStepComplete(slots, "champion", false);
}

// firstActionableIncompleteKnockoutWizardStep targets the first pickable gap
{
  const slots: KnockoutPickSlotDraft[] = [
    ...fullR16Slots(),
    ...Array.from({ length: 8 }, (_, i) => qfSlot(String(i + 1))),
    ...Array.from({ length: 4 }, (_, i) => sfSlot(String(i + 1))),
    ...Array.from({ length: 2 }, (_, i) => finSlot(String(i + 1))),
    champSlot(),
  ];
  assert.strictEqual(
    firstActionableIncompleteKnockoutWizardStep({
      slots,
      teams,
      officialRoundOf32Complete: true,
    }),
    "round_of_16",
  );
}

// Official-path repair clearing a QF pick: QF step no longer complete
{
  const slots: KnockoutPickSlotDraft[] = [
    ...fullR16Slots(),
    qfSlot("1", "team-bra"), // invalid for M97 — M89 is Canada vs Germany
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
  const { slots: repaired, cleared } = pruneOfficialKnockoutPathPicks(slots);
  assert.ok(
    cleared.some(
      (c) => c.predictionKind === "quarterfinalist" && c.slotKey === "1",
    ),
    "invalid R16 winner slot must be cleared",
  );
  const ctx = progressCtx(repaired);

  assertStepComplete(repaired, "quarterfinalist", false);
  assertStepComplete(repaired, "semifinalist", false);

  const qfStatus = getKnockoutStepCompletionFromDraftState("quarterfinalist", ctx);
  assert.strictEqual(qfStatus.complete, false);
  assert.ok(
    qfStatus.missingPickable > 0 || qfStatus.kind === "locked_upstream",
    "QF must not appear complete when repair cleared an upstream pick",
  );

  const sfGate = getMissingFeederSummaryForStep("semifinalist", ctx);
  assert.ok(sfGate);
  assert.doesNotMatch(sfGate, /four semi-finalists/i);
  assert.match(sfGate, /blocked by an earlier round pick/i);
  assert.doesNotMatch(sfGate, /Complete Round of 16 picks first/i);
  assert.doesNotMatch(sfGate, /M101 is waiting/i);
}

// Official R16 feeder result counts as resolved for QF availability
{
  const tournamentMatches: TournamentMatchPublicRow[] = [
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
      home_team_name: "Canada",
      home_country_code: "CAN",
      away_team_name: "Mexico",
      away_country_code: "MEX",
      winner_team_name: "Canada",
      winner_country_code: "CAN",
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
      away_team_name: "Canada",
      away_country_code: "CAN",
      winner_team_name: "Germany",
      winner_country_code: "GER",
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
    qfSlot("1", ""),
    qfSlot("2", ""),
    qfSlot("3", "team-bra"),
    qfSlot("4", "team-ned"),
    qfSlot("5", "team-fra"),
    qfSlot("6", "team-ger"),
    qfSlot("7", "team-ned"),
    qfSlot("8", "team-can"),
    sfSlot("1", ""),
    sfSlot("2", "team-fra"),
    sfSlot("3", "team-bra"),
    sfSlot("4", "team-ned"),
    finSlot("1", "team-ger"),
    finSlot("2", "team-fra"),
    champSlot("team-ger"),
  ];
  const ctx = resolveKnockoutProgressContext({
    slots,
    teams,
    tournamentMatches,
    officialRoundOf32Complete: true,
  });
  const qfRows = buildKnockoutMatchPickRows({
    bracketKind: "quarterfinalist",
    slots,
    teams,
    tournamentMatches,
    gradual: emptyGradual,
    knockoutBracketPicksUnlocked: true,
  });
  const m97 = qfRows.find((r) => r.fifaMatchNo === 97)!;
  assert.strictEqual(m97.homeTeamId, "team-ger");
  assert.strictEqual(m97.awayTeamId, "team-ned");
  assert.notStrictEqual(m97.lockReason, "incomplete");
  assert.ok(
    m97.lockReason === "pickable" || m97.lockReason === "frozen",
    `expected pickable or frozen, got ${m97.lockReason}`,
  );

  const r16Rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots,
    teams,
    tournamentMatches,
    gradual: emptyGradual,
    knockoutBracketPicksUnlocked: true,
  });
  const m89 = r16Rows.find((r) => r.fifaMatchNo === 89)!;
  assert.strictEqual(
    readConfirmedKnockoutMatchWinner(m89, "round_of_16", {
      bracketKind: "round_of_16",
      slots,
      teams,
      tournamentMatches,
      knockoutBracketPicksUnlocked: true,
    }),
    "team-ger",
  );

  const qfGate = getMissingFeederSummaryForStep("quarterfinalist", ctx);
  if (qfGate) {
    assert.doesNotMatch(qfGate, /Complete Round of 16 picks first/i);
  }
  assert.doesNotMatch(
    m97.display.emptyPrimaryLine ?? "",
    /Complete Round of 16 picks first/i,
  );
}

// Repair-cleared R16 winner is reported on the R16 step, not as generic upstream block
{
  const slots: KnockoutPickSlotDraft[] = [
    ...fullR16Slots(),
    qfSlot("1", "team-bra"),
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
  const { slots: repaired, cleared } = pruneOfficialKnockoutPathPicks(slots);
  const progressInput = {
    slots: repaired,
    teams,
    officialRoundOf32Complete: true,
  };
  const action = findFirstKnockoutWizardActionNeeded(progressInput, {
    clearedPicks: cleared,
  });
  assert.ok(action);
  assert.strictEqual(action!.bracketKind, "round_of_16");
  assert.match(action!.statusCardDetail, /cleared|Pick a winner/i);
  assert.doesNotMatch(
    action!.sectionGateMessage,
    /Complete Round of 16 picks first/i,
  );

  const repairSummary = getKnockoutRepairActionSummary(progressInput, cleared);
  assert.match(repairSummary.detail, /Pick a winner|cleared/i);
  assert.doesNotMatch(repairSummary.detail, /Complete Round of 16 picks first/i);
}

// Repair-cleared QF pick is reported as QF action, not R16 missing
{
  const slots: KnockoutPickSlotDraft[] = [
    ...fullR16Slots(),
    qfSlot("1", "team-ger"),
    qfSlot("2", "team-can"),
    qfSlot("3", "team-bra"),
    qfSlot("4", "team-ned"),
    qfSlot("5", "team-fra"),
    qfSlot("6", "team-ger"),
    qfSlot("7", "team-ned"),
    qfSlot("8", "team-can"),
    sfSlot("1", "team-bra"), // invalid for M97 when feeders are GER vs CAN
    sfSlot("2", "team-fra"),
    sfSlot("3", "team-bra"),
    sfSlot("4", "team-ned"),
    finSlot("1", "team-ger"),
    finSlot("2", "team-fra"),
    champSlot("team-ger"),
  ];
  const { slots: repaired, cleared } = pruneOfficialKnockoutPathPicks(slots);
  assert.ok(
    cleared.some(
      (c) => c.predictionKind === "semifinalist" && c.slotKey === "1",
    ),
  );
  const progressInput = {
    slots: repaired,
    teams,
    officialRoundOf32Complete: true,
  };
  const action = findFirstKnockoutWizardActionNeeded(progressInput, {
    clearedPicks: cleared,
  });
  assert.ok(action);
  assert.strictEqual(action!.bracketKind, "quarterfinalist");
  assert.match(action!.statusCardDetail, /cleared|Pick a winner/i);
  assert.doesNotMatch(
    action!.sectionGateMessage,
    /Complete Round of 16 picks first/i,
  );

  const qfGate = getMissingFeederSummaryForStep(
    "quarterfinalist",
    progressCtx(repaired),
  );
  assert.ok(qfGate);
  assert.doesNotMatch(qfGate, /Complete Round of 16 picks first/i);
}

// Step completion uses repaired draft slots, not stale persisted downstream picks
{
  const persisted: KnockoutPickSlotDraft[] = [
    ...fullR16Slots(),
    qfSlot("1", "team-bra"), // cleared on repair — persisted DB still had it
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
  const { slots: repaired, cleared } = pruneOfficialKnockoutPathPicks(persisted);
  assert.ok(cleared.length > 0, "repair must clear at least one stale pick");
  assert.strictEqual(
    repaired.find((s) => s.predictionKind === "quarterfinalist" && s.slotKey === "1")
      ?.teamId,
    "",
  );
  assertStepComplete(repaired, "round_of_16", false);
  assertStepComplete(repaired, "quarterfinalist", false);
  assertStepComplete(persisted, "round_of_16", false);
}

// Active step styling must not imply completion when the step is only waiting
{
  const tournamentMatches: TournamentMatchPublicRow[] = [
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
  ];
  const waitingStatus = getKnockoutStepCompletionFromDraftState(
    "quarterfinalist",
    resolveKnockoutProgressContext({
      slots: [
        r16Slot("2", "team-ger"),
        r16Slot("5", "team-par"),
        qfSlot("1", ""),
        ...Array.from({ length: 7 }, (_, i) => qfSlot(String(i + 2), "team-ger")),
      ],
      teams,
      tournamentMatches,
      officialRoundOf32Complete: true,
    }),
  );
  assert.strictEqual(waitingStatus.complete, false);
  assert.strictEqual(waitingStatus.kind, "locked_upstream");
  const activePill = knockoutStepPillPresentation({
    status: waitingStatus,
    active: true,
  });
  const inactivePill = knockoutStepPillPresentation({
    status: waitingStatus,
    active: false,
  });
  assert.strictEqual(activePill.visualKind, "waiting");
  assert.strictEqual(inactivePill.visualKind, "waiting");
  assert.strictEqual(activePill.suffix, "waiting");
  assert.match(activePill.statusClassName, /amber/);
  assert.match(activePill.activeClassName, /ring-sky-400/);
  assert.doesNotMatch(activePill.statusClassName, /emerald/);

  const completeActive = knockoutStepPillPresentation({
    status: {
      kind: "complete",
      complete: true,
      missingPickable: 0,
      totalPickable: 8,
      gateMessage: null,
    },
    active: true,
  });
  assert.strictEqual(completeActive.visualKind, "complete");
  assert.match(completeActive.statusClassName, /emerald/);
}

// Waiting-for-result blocked rows do not require participant save
{
  const tournamentMatches: TournamentMatchPublicRow[] = [
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
  ];
  const slots: KnockoutPickSlotDraft[] = [
    r16Slot("2", "team-ger"),
    r16Slot("5", "team-par"),
    qfSlot("1", ""),
    ...Array.from({ length: 7 }, (_, i) => qfSlot(String(i + 2), "team-ger")),
  ];
  const progressInput = {
    slots,
    teams,
    tournamentMatches,
    officialRoundOf32Complete: true,
  };
  assert.strictEqual(
    requiresParticipantKnockoutRepairSave(progressInput, []),
    false,
  );
  assert.strictEqual(
    resolveParticipantKnockoutDraftSaveRequired({
      draftSignature: "draft",
      savedSignature: "draft",
      userEditedPicks: false,
      progressContext: progressInput,
    }),
    false,
  );
  assert.strictEqual(
    resolveParticipantKnockoutDraftSaveRequired({
      draftSignature: "draft-a",
      savedSignature: "draft-b",
      userEditedPicks: false,
      progressContext: progressInput,
    }),
    false,
  );
}

// User-edited picks still require save when the draft signature changes
{
  assert.strictEqual(
    resolveParticipantKnockoutDraftSaveRequired({
      draftSignature: "draft-a",
      savedSignature: "draft-b",
      userEditedPicks: true,
      progressContext: {
        slots: [],
        teams,
        officialRoundOf32Complete: true,
      },
    }),
    true,
  );
}

console.log("knockoutMatchProgress.selftest.ts: ok");
