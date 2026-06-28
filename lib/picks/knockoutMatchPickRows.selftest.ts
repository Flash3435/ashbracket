import assert from "node:assert";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import {
  applyKnockoutMatchWinnerToSlots,
  buildKnockoutMatchPickRows,
  FINAL_MATCH_INCOMPLETE_MSG,
  knockoutMatchStepComplete,
  readR32MatchWinnerForBracket,
  validateKnockoutLaterMatchPick,
} from "./knockoutMatchPickRows";
import type { GradualKnockoutSelectionState } from "./gradualKnockoutUnlock";

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
];

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

// R16 shows 8 matchup rows from adjacent R32 winners
{
  const slots: KnockoutPickSlotDraft[] = [
    r16Slot("1", "team-rsa"),
    r16Slot("2", "team-ger"),
    r16Slot("3", "team-ned"),
    r16Slot("4", "team-bra"),
    ...Array.from({ length: 12 }, (_, i) => r16Slot(String(i + 5))),
    ...Array.from({ length: 8 }, (_, i) => qfSlot(String(i + 1))),
  ];
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots,
    teams,
    gradual: emptyGradual,
  });
  assert.strictEqual(rows.length, 8);
  assert.strictEqual(rows[0]!.homeTeamId, "team-rsa");
  assert.strictEqual(rows[0]!.awayTeamId, "team-ger");
  assert.strictEqual(rows[0]!.display.heading, "M89 · Round of 16");
  assert.strictEqual(
    rows[0]!.display.emptyPrimaryLine,
    "South Africa vs Germany",
  );
  assert.strictEqual(rows[1]!.homeTeamId, "team-ned");
  assert.strictEqual(rows[1]!.awayTeamId, "team-bra");
}

// Incomplete row when upstream missing
{
  const slots = [r16Slot("1", "team-rsa"), r16Slot("2"), ...Array.from({ length: 14 }, (_, i) => r16Slot(String(i + 3)))];
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots,
    teams,
    gradual: emptyGradual,
  });
  assert.strictEqual(rows[0]!.lockReason, "incomplete");
  assert.ok(rows[0]!.display.statusLine?.includes("Complete previous round"));
}

// Saving R16 match winner writes quarterfinalist slot
{
  const slots: KnockoutPickSlotDraft[] = [
    r16Slot("1", "team-rsa"),
    r16Slot("2", "team-ger"),
    ...Array.from({ length: 14 }, (_, i) => r16Slot(String(i + 3))),
    ...Array.from({ length: 8 }, (_, i) => qfSlot(String(i + 1))),
  ];
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots,
    teams,
    gradual: emptyGradual,
  });
  const m1 = rows[0]!;
  const next = applyKnockoutMatchWinnerToSlots(slots, m1, "team-rsa");
  assert.strictEqual(
    next.find((s) => s.predictionKind === "quarterfinalist" && s.slotKey === "1")
      ?.teamId,
    "team-rsa",
  );
}

// Step complete when all pickable matchups filled
{
  const slots: KnockoutPickSlotDraft[] = [
    ...Array.from({ length: 16 }, (_, i) => r16Slot(String(i + 1), "team-rsa")),
    qfSlot("1", "team-rsa"),
    qfSlot("2", "team-ger"),
    qfSlot("3", "team-ned"),
    qfSlot("4", "team-bra"),
    qfSlot("5", "team-rsa"),
    qfSlot("6", "team-ger"),
    qfSlot("7", "team-ned"),
    qfSlot("8", "team-bra"),
  ];
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots,
    teams,
    gradual: emptyGradual,
  });
  assert.strictEqual(knockoutMatchStepComplete(rows), true);
}

// readR32MatchWinnerForBracket uses gradual storage
{
  const slots = [r16Slot("1", "team-rsa"), r16Slot("2", "team-ger")];
  assert.strictEqual(
    readR32MatchWinnerForBracket(0, slots, teams, {}),
    "team-rsa",
  );
}

// Final row shows finalists and writes champion pick
{
  const slots: KnockoutPickSlotDraft[] = [
    finSlot("1", "team-ger"),
    finSlot("2", "team-bra"),
    champSlot(),
  ];
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "finalist",
    slots,
    teams,
    gradual: emptyGradual,
  });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0]!.display.heading, "M104 · Final");
  assert.strictEqual(rows[0]!.display.emptyPrimaryLine, "Germany vs Brazil");
  assert.strictEqual(rows[0]!.display.chooseButtonLabel, "Pick champion");
  assert.strictEqual(rows[0]!.savePredictionKind, "champion");
  assert.strictEqual(rows[0]!.lockReason, "pickable");
}

// Final row incomplete when semi-final picks missing
{
  const slots: KnockoutPickSlotDraft[] = [finSlot("1", "team-ger"), champSlot()];
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "finalist",
    slots,
    teams,
    gradual: emptyGradual,
  });
  assert.strictEqual(rows[0]!.lockReason, "incomplete");
  assert.strictEqual(rows[0]!.display.statusLine, FINAL_MATCH_INCOMPLETE_MSG);
}

// Saving final winner writes champion slot only from finalists
{
  const slots: KnockoutPickSlotDraft[] = [
    finSlot("1", "team-ger"),
    finSlot("2", "team-bra"),
    champSlot(),
  ];
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "finalist",
    slots,
    teams,
    gradual: emptyGradual,
  });
  const finalRow = rows[0]!;
  assert.strictEqual(
    validateKnockoutLaterMatchPick(finalRow, "team-ned"),
    "That team is not in this matchup.",
  );
  const next = applyKnockoutMatchWinnerToSlots(slots, finalRow, "team-ger");
  assert.strictEqual(
    next.find((s) => s.predictionKind === "champion")?.teamId,
    "team-ger",
  );
  assert.strictEqual(knockoutMatchStepComplete(rows), false);
  assert.strictEqual(
    knockoutMatchStepComplete(
      buildKnockoutMatchPickRows({
        bracketKind: "finalist",
        slots: next,
        teams,
        gradual: emptyGradual,
      }),
    ),
    true,
  );
}

// Creates champion row when missing so final picks still persist
{
  const slots: KnockoutPickSlotDraft[] = [
    finSlot("1", "team-ger"),
    finSlot("2", "team-bra"),
  ];
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "finalist",
    slots,
    teams,
    gradual: emptyGradual,
  });
  const finalRow = rows[0]!;
  const next = applyKnockoutMatchWinnerToSlots(slots, finalRow, "team-bra");
  assert.strictEqual(
    next.find((s) => s.predictionKind === "champion")?.teamId,
    "team-bra",
  );
  assert.strictEqual(
    next.find((s) => s.predictionKind === "champion")?.rowKey,
    "champion|",
  );
}

console.log("knockoutMatchPickRows.selftest.ts: ok");
