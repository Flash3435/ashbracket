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
import { pruneParticipantPicks } from "../predictions/knockoutPickConsistency";
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
    id: "team-fra",
    name: "France",
    countryCode: "FRA",
    fifaCode: "FRA",
    fifaRank: 2,
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

function r32Side(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `round_of_32|${slotKey}`,
    sectionLabel: "R32",
    slotLabel: slotKey,
    predictionKind: "round_of_32",
    tournamentStageId: "r32",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

// R16 row stays incomplete when only round_of_32 side picks exist (no confirmed winners)
{
  const slots: KnockoutPickSlotDraft[] = [
    r32Side("3", "team-ger"),
    r32Side("4", "team-fra"),
    r32Side("9", "team-ned"),
    r32Side("10", "team-can"),
    r16Slot("1", "team-can"),
    r16Slot("3", "team-ned"),
    ...Array.from({ length: 8 }, (_, i) => qfSlot(String(i + 1))),
  ];
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots,
    teams,
    gradual: emptyGradual,
    knockoutBracketPicksUnlocked: true,
  });
  const m89 = rows.find((r) => r.fifaMatchNo === 89)!;
  assert.strictEqual(m89.lockReason, "incomplete");
  const m90 = rows.find((r) => r.fifaMatchNo === 90)!;
  assert.strictEqual(m90.lockReason, "pickable");
  const afterPick = pruneParticipantPicks(
    applyKnockoutMatchWinnerToSlots(slots, m90, "team-can"),
  );
  assert.strictEqual(
    afterPick.find((s) => s.predictionKind === "quarterfinalist" && s.slotKey === "2")
      ?.teamId,
    "team-can",
  );
}

// Gradual side picks must not populate R16 rows once the full bracket is official
{
  const slots: KnockoutPickSlotDraft[] = [
    r32Side("3", "team-ger"),
    r32Side("4", "team-ned"),
    r32Side("9", "team-fra"),
    r32Side("10", "team-rsa"),
  ];
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots,
    teams,
    gradual: emptyGradual,
    knockoutBracketPicksUnlocked: true,
  });
  const m89 = rows.find((r) => r.fifaMatchNo === 89)!;
  assert.strictEqual(m89.lockReason, "incomplete");
  assert.strictEqual(m89.homeTeamId, null);
  assert.strictEqual(m89.awayTeamId, null);
}

// Official R16 pairings (not adjacent R32 winners)
{
  const slots: KnockoutPickSlotDraft[] = [
    r16Slot("1", "team-can"), // M73
    r16Slot("2", "team-ger"), // M74
    r16Slot("3", "team-ned"), // M75
    r16Slot("4", "team-bra"), // M76
    r16Slot("5", "team-fra"), // M77
    ...Array.from({ length: 11 }, (_, i) => r16Slot(String(i + 6))),
    ...Array.from({ length: 8 }, (_, i) => qfSlot(String(i + 1))),
  ];
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots,
    teams,
    gradual: emptyGradual,
  });
  assert.strictEqual(rows.length, 8);

  // M89 = Winner M74 vs Winner M77
  assert.strictEqual(rows[0]!.fifaMatchNo, 89);
  assert.strictEqual(rows[0]!.homeTeamId, "team-ger");
  assert.strictEqual(rows[0]!.awayTeamId, "team-fra");
  assert.strictEqual(rows[0]!.display.heading, "M89 · Round of 16");
  assert.strictEqual(rows[0]!.display.emptyPrimaryLine, "Germany vs France");

  // M90 = Winner M73 vs Winner M75
  assert.strictEqual(rows[1]!.fifaMatchNo, 90);
  assert.strictEqual(rows[1]!.homeTeamId, "team-can");
  assert.strictEqual(rows[1]!.awayTeamId, "team-ned");
  assert.strictEqual(
    rows[1]!.display.emptyPrimaryLine,
    "Canada vs Netherlands",
  );

  // M91 = Winner M76 vs Winner M78
  assert.strictEqual(rows[2]!.fifaMatchNo, 91);
  assert.strictEqual(rows[2]!.homeTeamId, "team-bra");
  assert.strictEqual(rows[2]!.awayTeamId, null);

  // Canada and Germany must not meet in R16
  for (const row of rows) {
    const pair = new Set([row.homeTeamId, row.awayTeamId]);
    assert.ok(
      !(pair.has("team-can") && pair.has("team-ger")),
      "Canada vs Germany is not an official R16 pairing",
    );
  }
}

// M76 + M78 -> M91; M81 + M82 -> M94
{
  const slots: KnockoutPickSlotDraft[] = [
    ...Array.from({ length: 16 }, (_, i) => r16Slot(String(i + 1))),
    ...Array.from({ length: 8 }, (_, i) => qfSlot(String(i + 1))),
  ];
  slots.find((s) => s.slotKey === "4")!.teamId = "team-bra"; // M76
  slots.find((s) => s.slotKey === "6")!.teamId = "team-rsa"; // M78
  slots.find((s) => s.slotKey === "9")!.teamId = "team-ned"; // M81
  slots.find((s) => s.slotKey === "10")!.teamId = "team-ger"; // M82
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots,
    teams,
    gradual: emptyGradual,
  });
  const m91 = rows.find((r) => r.fifaMatchNo === 91)!;
  assert.strictEqual(m91.homeTeamId, "team-bra");
  assert.strictEqual(m91.awayTeamId, "team-rsa");
  const m94 = rows.find((r) => r.fifaMatchNo === 94)!;
  assert.strictEqual(m94.homeTeamId, "team-ned");
  assert.strictEqual(m94.awayTeamId, "team-ger");
}

// Quarter-final pairings: M97/M98/M99/M100 official mapping
{
  const slots: KnockoutPickSlotDraft[] = [
    qfSlot("1", "team-can"), // M89 winner
    qfSlot("2", "team-ned"), // M90 winner
    qfSlot("3", "team-bra"), // M91 winner
    qfSlot("4", "team-rsa"), // M92 winner
    qfSlot("5", "team-fra"), // M93 winner
    qfSlot("6", "team-ger"), // M94 winner
    qfSlot("7", "team-can"),
    qfSlot("8", "team-ned"),
    ...Array.from({ length: 4 }, (_, i) => sfSlot(String(i + 1))),
  ];
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "quarterfinalist",
    slots,
    teams,
    gradual: emptyGradual,
  });
  assert.strictEqual(rows.length, 4);
  assert.strictEqual(rows[0]!.fifaMatchNo, 97);
  assert.strictEqual(rows[0]!.homeTeamId, "team-can");
  assert.strictEqual(rows[0]!.awayTeamId, "team-ned");
  assert.strictEqual(rows[1]!.fifaMatchNo, 98);
  assert.strictEqual(rows[1]!.homeTeamId, "team-fra");
  assert.strictEqual(rows[1]!.awayTeamId, "team-ger");
  assert.strictEqual(rows[2]!.fifaMatchNo, 99);
  assert.strictEqual(rows[2]!.homeTeamId, "team-bra");
  assert.strictEqual(rows[2]!.awayTeamId, "team-rsa");
  assert.strictEqual(rows[3]!.fifaMatchNo, 100);
}

// Semi-final pairings: M101/M102 official mapping
{
  const slots: KnockoutPickSlotDraft[] = [
    sfSlot("1", "team-can"), // M97 winner
    sfSlot("2", "team-fra"), // M98 winner
    sfSlot("3", "team-bra"), // M99 winner
    sfSlot("4", "team-ger"), // M100 winner
    finSlot("1"),
    finSlot("2"),
  ];
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "semifinalist",
    slots,
    teams,
    gradual: emptyGradual,
  });
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0]!.fifaMatchNo, 101);
  assert.strictEqual(rows[0]!.homeTeamId, "team-can");
  assert.strictEqual(rows[0]!.awayTeamId, "team-bra");
  assert.strictEqual(rows[1]!.fifaMatchNo, 102);
  assert.strictEqual(rows[1]!.homeTeamId, "team-fra");
  assert.strictEqual(rows[1]!.awayTeamId, "team-ger");
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
    ...Array.from({ length: 16 }, (_, i) => r16Slot(String(i + 1))),
    ...Array.from({ length: 8 }, (_, i) => qfSlot(String(i + 1))),
  ];
  slots.find((s) => s.slotKey === "2")!.teamId = "team-ger"; // M74
  slots.find((s) => s.slotKey === "5")!.teamId = "team-fra"; // M77
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots,
    teams,
    gradual: emptyGradual,
  });
  const m89 = rows.find((r) => r.fifaMatchNo === 89)!;
  assert.strictEqual(m89.lockReason, "pickable");
  const next = applyKnockoutMatchWinnerToSlots(slots, m89, "team-ger");
  assert.strictEqual(
    next.find((s) => s.predictionKind === "quarterfinalist" && s.slotKey === "1")
      ?.teamId,
    "team-ger",
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
