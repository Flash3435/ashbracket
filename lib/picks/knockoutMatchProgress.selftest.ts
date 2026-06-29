import assert from "node:assert";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import {
  buildKnockoutMatchProgress,
  isKnockoutWizardStepComplete,
  resolveKnockoutProgressContext,
} from "./knockoutMatchProgress";
import type { GradualKnockoutSelectionState } from "./gradualKnockoutUnlock";

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

// R16 incomplete (6/8 winners): later steps must not appear complete
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
    ...Array.from({ length: 4 }, (_, i) => sfSlot(String(i + 1), "team-ger")),
    finSlot("1", "team-ger"),
    finSlot("2", "team-fra"),
    champSlot("team-ger"),
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

console.log("knockoutMatchProgress.selftest.ts: ok");
