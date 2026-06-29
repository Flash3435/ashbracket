import assert from "node:assert";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import {
  applyKnockoutMatchWinnerToSlots,
  buildKnockoutMatchPickRows,
  FINAL_MATCH_INCOMPLETE_MSG,
  incompleteR16MatchMessage,
  isKnockoutMatchDirectPickEligible,
  knockoutMatchStepComplete,
  knockoutMatchTeamPickAriaLabel,
  readConfirmedR32MatchWinner,
  readR32MatchWinnerForBracket,
  validateKnockoutLaterMatchPick,
  validatedKnockoutMatchWinner,
} from "./knockoutMatchPickRows";
import { pruneParticipantPicks } from "../predictions/knockoutPickConsistency";
import type { GradualKnockoutSelectionState } from "./gradualKnockoutUnlock";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

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
  assert.ok(
    m89.display.statusLine?.includes("M74"),
    "should name missing upstream R32 fixtures",
  );
  assert.strictEqual(
    incompleteR16MatchMessage(0, slots),
    "Complete Round of 32 first — pick winners for M74 and M77.",
  );
}

// Both R32 sides filled without a canonical winner does not unlock R16 rows.
{
  const slots: KnockoutPickSlotDraft[] = [
    r32Side("3", "team-ger"),
    r32Side("4", "team-ned"),
    r32Side("9", "team-fra"),
    r32Side("10", "team-ned"),
    ...Array.from({ length: 16 }, (_, i) => {
      const key = String(i + 1);
      return r16Slot(key, key === "2" ? "team-ger" : "");
    }),
  ];
  assert.strictEqual(readConfirmedR32MatchWinner(4, slots), "");
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots,
    teams,
    gradual: emptyGradual,
  });
  const m89 = rows.find((r) => r.fifaMatchNo === 89)!;
  assert.ok(m89.display.statusLine?.includes("M77"));
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
    r16Slot("1", "team-can"), // M73
    r16Slot("2", "team-ger"), // M74
    r16Slot("3", "team-ned"), // M75
    r16Slot("4", "team-bra"), // M76
    r16Slot("5", "team-fra"), // M77
    r16Slot("6", "team-rsa"), // M78
    r16Slot("7", "team-ned"), // M79
    r16Slot("8", "team-bra"), // M80
    r16Slot("9", "team-ned"), // M81
    r16Slot("10", "team-ger"), // M82
    r16Slot("11", "team-fra"), // M83
    r16Slot("12", "team-ger"), // M84
    r16Slot("13", "team-can"), // M85
    r16Slot("14", "team-ned"), // M86
    r16Slot("15", "team-bra"), // M87
    r16Slot("16", "team-rsa"), // M88
    qfSlot("1", "team-ger"), // M89 winner
    qfSlot("2", "team-can"), // M90 winner
    qfSlot("3", "team-bra"), // M91 winner
    qfSlot("4", "team-ned"), // M92 winner
    qfSlot("5", "team-fra"), // M93 winner
    qfSlot("6", "team-ger"), // M94 winner
    qfSlot("7", "team-ned"), // M95 winner
    qfSlot("8", "team-can"), // M96 winner
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
  assert.strictEqual(rows[0]!.homeTeamId, "team-ger");
  assert.strictEqual(rows[0]!.awayTeamId, "team-can");
  assert.strictEqual(rows[1]!.fifaMatchNo, 98);
  assert.strictEqual(rows[1]!.homeTeamId, "team-fra");
  assert.strictEqual(rows[1]!.awayTeamId, "team-ger");
  assert.strictEqual(rows[2]!.fifaMatchNo, 99);
  assert.strictEqual(rows[2]!.homeTeamId, "team-bra");
  assert.strictEqual(rows[2]!.awayTeamId, "team-ned");
  assert.strictEqual(rows[3]!.fifaMatchNo, 100);
  assert.strictEqual(rows[3]!.homeTeamId, "team-ned");
  assert.strictEqual(rows[3]!.awayTeamId, "team-can");
}

// Stale quarterfinalist slots must not populate QF sides (Canada/Germany regression).
{
  const slots: KnockoutPickSlotDraft[] = [
    r16Slot("1", "team-can"),
    r16Slot("2", "team-ger"),
    r16Slot("3", "team-ned"),
    r16Slot("4", "team-bra"),
    r16Slot("5", "team-fra"),
    ...Array.from({ length: 11 }, (_, i) => r16Slot(String(i + 6))),
    qfSlot("1", "team-can"), // stale: not M89 winner
    qfSlot("2", "team-ger"), // stale: not M90 winner
    ...Array.from({ length: 6 }, (_, i) => qfSlot(String(i + 3))),
  ];
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "quarterfinalist",
    slots,
    teams,
    gradual: emptyGradual,
  });
  const m97 = rows.find((r) => r.fifaMatchNo === 97)!;
  assert.strictEqual(m97.lockReason, "incomplete");
  assert.notStrictEqual(m97.homeTeamId, "team-can");
  assert.notStrictEqual(m97.awayTeamId, "team-ger");
  assert.ok(
    !(m97.homeTeamId === "team-can" && m97.awayTeamId === "team-ger"),
    "M97 must not show Canada vs Germany from stale quarterfinalist slots",
  );
}

// Semi-final pairings: M101/M102 official mapping
{
  const slots: KnockoutPickSlotDraft[] = [
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
    qfSlot("1", "team-ger"),
    qfSlot("2", "team-can"),
    qfSlot("3", "team-bra"),
    qfSlot("4", "team-ned"),
    qfSlot("5", "team-fra"),
    qfSlot("6", "team-ger"),
    qfSlot("7", "team-ned"),
    qfSlot("8", "team-can"),
    sfSlot("1", "team-ger"), // M97 winner
    sfSlot("2", "team-fra"), // M98 winner
    sfSlot("3", "team-bra"), // M99 winner
    sfSlot("4", "team-ned"), // M100 winner
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
  assert.strictEqual(rows[0]!.homeTeamId, "team-ger");
  assert.strictEqual(rows[0]!.awayTeamId, "team-bra");
  assert.strictEqual(rows[1]!.fifaMatchNo, 102);
  assert.strictEqual(rows[1]!.homeTeamId, "team-fra");
  assert.strictEqual(rows[1]!.awayTeamId, "team-ned");
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
  assert.ok(
    rows[0]!.display.statusLine?.includes("Complete Round of 32 first"),
  );
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
    qfSlot("2", "team-rsa"),
    qfSlot("3", "team-rsa"),
    qfSlot("4", "team-rsa"),
    qfSlot("5", "team-rsa"),
    qfSlot("6", "team-rsa"),
    qfSlot("7", "team-rsa"),
    qfSlot("8", "team-rsa"),
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
  assert.strictEqual(rows[0]!.display.emptyPrimaryLine, "Germany vs France");
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
  ];
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "finalist",
    slots,
    teams,
    gradual: emptyGradual,
  });
  const finalRow = rows[0]!;
  const next = applyKnockoutMatchWinnerToSlots(slots, finalRow, "team-fra");
  assert.strictEqual(
    next.find((s) => s.predictionKind === "champion")?.teamId,
    "team-fra",
  );
  assert.strictEqual(
    next.find((s) => s.predictionKind === "champion")?.rowKey,
    "champion|",
  );
}

// Pickable rows with both teams expose direct-pick eligibility
{
  const slots: KnockoutPickSlotDraft[] = [
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
  for (const row of rows) {
    assert.strictEqual(isKnockoutMatchDirectPickEligible(row), true);
    assert.ok(row.homeTeamId);
    assert.ok(row.awayTeamId);
  }
}

// Semi-final winner picks write finalist slots and complete the step
{
  const slots: KnockoutPickSlotDraft[] = [
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
    finSlot("1"),
    finSlot("2"),
  ];
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "semifinalist",
    slots,
    teams,
    gradual: emptyGradual,
  });
  assert.strictEqual(knockoutMatchStepComplete(rows), false);
  const m101 = rows.find((r) => r.fifaMatchNo === 101)!;
  const m102 = rows.find((r) => r.fifaMatchNo === 102)!;
  const afterM101 = applyKnockoutMatchWinnerToSlots(slots, m101, "team-ger");
  assert.strictEqual(
    afterM101.find((s) => s.predictionKind === "finalist" && s.slotKey === "1")
      ?.teamId,
    "team-ger",
  );
  const afterBoth = applyKnockoutMatchWinnerToSlots(afterM101, m102, "team-fra");
  assert.strictEqual(
    afterBoth.find((s) => s.predictionKind === "finalist" && s.slotKey === "2")
      ?.teamId,
    "team-fra",
  );
  const completedRows = buildKnockoutMatchPickRows({
    bracketKind: "semifinalist",
    slots: afterBoth,
    teams,
    gradual: emptyGradual,
  });
  assert.strictEqual(knockoutMatchStepComplete(completedRows), true);
}

// Accessibility labels include match code for later-round picks
{
  assert.strictEqual(
    knockoutMatchTeamPickAriaLabel({
      teamName: "England",
      fifaMatchNo: 101,
      pickKind: "winner",
    }),
    "Pick England to win M101",
  );
  assert.strictEqual(
    knockoutMatchTeamPickAriaLabel({
      teamName: "France",
      fifaMatchNo: 104,
      pickKind: "champion",
    }),
    "Pick France as champion in M104",
  );
}

// Blocked steps with no pickable rows must not count as complete
{
  const slots: KnockoutPickSlotDraft[] = [
    r16Slot("1", "team-can"),
    r16Slot("2", "team-ger"),
    r16Slot("3", "team-ned"),
    r16Slot("4", "team-bra"),
    r16Slot("5", "team-fra"),
    ...Array.from({ length: 11 }, (_, i) => r16Slot(String(i + 6))),
    ...Array.from({ length: 8 }, (_, i) => qfSlot(String(i + 1), "team-ger")),
    ...Array.from({ length: 4 }, (_, i) => sfSlot(String(i + 1), "team-ger")),
    finSlot("1", "team-ger"),
    champSlot("team-ger"),
  ];
  const qfRows = buildKnockoutMatchPickRows({
    bracketKind: "quarterfinalist",
    slots,
    teams,
    gradual: emptyGradual,
  });
  assert.ok(qfRows.every((r) => r.lockReason === "incomplete"));
  assert.strictEqual(knockoutMatchStepComplete(qfRows), false);

  const sfRows = buildKnockoutMatchPickRows({
    bracketKind: "semifinalist",
    slots,
    teams,
    gradual: emptyGradual,
  });
  assert.strictEqual(knockoutMatchStepComplete(sfRows), false);

  const finalRows = buildKnockoutMatchPickRows({
    bracketKind: "finalist",
    slots,
    teams,
    gradual: emptyGradual,
  });
  assert.strictEqual(knockoutMatchStepComplete(finalRows), false);
}

// Stale winner ids do not count as filled or selected
{
  const slots: KnockoutPickSlotDraft[] = [
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
    finSlot("1", "team-can"), // stale: not in M101 (Germany vs Brazil)
    finSlot("2"),
  ];
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "semifinalist",
    slots,
    teams,
    gradual: emptyGradual,
  });
  const m101 = rows.find((r) => r.fifaMatchNo === 101)!;
  assert.strictEqual(validatedKnockoutMatchWinner(m101), null);
  assert.strictEqual(knockoutMatchStepComplete(rows), false);
}

// M89 winner pick must not change matchup sides (Germany/France regression)
{
  const slots: KnockoutPickSlotDraft[] = [
    r16Slot("2", "team-ger"), // M74
    r16Slot("5", "team-fra"), // M77
    ...Array.from({ length: 14 }, (_, i) =>
      r16Slot(String(i < 1 ? i + 1 : i + 2)),
    ),
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
  assert.strictEqual(m89.homeTeamId, "team-ger");
  assert.strictEqual(m89.awayTeamId, "team-fra");
  assert.strictEqual(isKnockoutMatchDirectPickEligible(m89), true);

  const afterPick = pruneParticipantPicks(
    applyKnockoutMatchWinnerToSlots(slots, m89, "team-fra"),
  );
  assert.strictEqual(
    afterPick.find(
      (s) => s.predictionKind === "quarterfinalist" && s.slotKey === "1",
    )?.teamId,
    "team-fra",
  );
  assert.strictEqual(
    afterPick.find(
      (s) => s.predictionKind === "round_of_16" && s.slotKey === "5",
    )?.teamId,
    "team-fra",
  );
  const afterRows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots: afterPick,
    teams,
    gradual: emptyGradual,
    knockoutBracketPicksUnlocked: true,
  });
  const m89After = afterRows.find((r) => r.fifaMatchNo === 89)!;
  assert.strictEqual(m89After.homeTeamId, "team-ger");
  assert.strictEqual(m89After.awayTeamId, "team-fra");
  assert.strictEqual(validatedKnockoutMatchWinner(m89After), "team-fra");
}

// M77 winner Sweden: France must not appear as an M89 side or pick option
{
  const slots: KnockoutPickSlotDraft[] = [
    r16Slot("2", "team-ger"), // M74
    r16Slot("5", "team-swe"), // M77
    ...Array.from({ length: 14 }, (_, i) =>
      r16Slot(String(i < 1 ? i + 1 : i + 2)),
    ),
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
  assert.strictEqual(m89.homeTeamId, "team-ger");
  assert.strictEqual(m89.awayTeamId, "team-swe");
  assert.strictEqual(
    validateKnockoutLaterMatchPick(m89, "team-fra"),
    "That team is not in this matchup.",
  );
}

// Stale round_of_16 slot must not show France when M77 R32 winner is Sweden
{
  const slots: KnockoutPickSlotDraft[] = [
    r16Slot("2", "team-ger"),
    r16Slot("5", "team-fra"), // stale: not in M77 R32 match below
    ...Array.from({ length: 14 }, (_, i) =>
      r16Slot(String(i < 1 ? i + 1 : i + 2)),
    ),
    r32Side("9", "team-swe"),
    r32Side("10", ""),
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
  assert.strictEqual(m89.homeTeamId, "team-ger");
  assert.strictEqual(m89.awayTeamId, "team-swe");
  assert.notStrictEqual(m89.awayTeamId, "team-fra");
  assert.strictEqual(
    validateKnockoutLaterMatchPick(m89, "team-fra"),
    "That team is not in this matchup.",
  );

  const afterPick = pruneParticipantPicks(
    applyKnockoutMatchWinnerToSlots(slots, m89, "team-swe"),
  );
  const afterRows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots: afterPick,
    teams,
    gradual: emptyGradual,
    knockoutBracketPicksUnlocked: true,
  });
  const m89After = afterRows.find((r) => r.fifaMatchNo === 89)!;
  assert.strictEqual(m89After.homeTeamId, "team-ger");
  assert.strictEqual(m89After.awayTeamId, "team-swe");
}

// Stale quarterfinalist slot must not change M89 sides
{
  const slots: KnockoutPickSlotDraft[] = [
    r16Slot("2", "team-ger"),
    r16Slot("5", "team-fra"),
    ...Array.from({ length: 14 }, (_, i) =>
      r16Slot(String(i < 1 ? i + 1 : i + 2)),
    ),
    qfSlot("1", "team-can"), // stale downstream pick
    ...Array.from({ length: 7 }, (_, i) => qfSlot(String(i + 2))),
  ];
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots,
    teams,
    gradual: emptyGradual,
    knockoutBracketPicksUnlocked: true,
  });
  const m89 = rows.find((r) => r.fifaMatchNo === 89)!;
  assert.strictEqual(m89.homeTeamId, "team-ger");
  assert.strictEqual(m89.awayTeamId, "team-fra");
  assert.strictEqual(validatedKnockoutMatchWinner(m89), null);
}

// Stale M77 slot ignored when official tournament result is Sweden (initial render).
{
  const tournamentMatches: TournamentMatchPublicRow[] = [
    {
      match_id: "m77",
      edition_id: "ed",
      edition_code: "2026",
      match_code: "M77",
      stage_code: "round_of_32",
      stage_label: "Round of 32",
      stage_sort_order: 1,
      group_code: null,
      round_index: 0,
      kickoff_at: "2026-07-01T18:00:00Z",
      status: "finished",
      home_goals: 2,
      away_goals: 1,
      home_penalties: null,
      away_penalties: null,
      home_team_name: "Sweden",
      home_country_code: "SWE",
      away_team_name: "France",
      away_country_code: "FRA",
      winner_team_name: "Sweden",
      winner_country_code: "SWE",
    },
  ];
  const slots: KnockoutPickSlotDraft[] = [
    r16Slot("2", "team-ger"),
    r16Slot("5", "team-fra"), // stale upstream slot
    ...Array.from({ length: 14 }, (_, i) =>
      r16Slot(String(i < 1 ? i + 1 : i + 2)),
    ),
    ...Array.from({ length: 8 }, (_, i) => qfSlot(String(i + 1))),
  ];
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots,
    teams,
    tournamentMatches,
    gradual: emptyGradual,
    knockoutBracketPicksUnlocked: true,
  });
  const m89 = rows.find((r) => r.fifaMatchNo === 89)!;
  assert.strictEqual(m89.homeTeamId, "team-ger");
  assert.strictEqual(m89.awayTeamId, "team-swe");
  assert.strictEqual(
    validateKnockoutLaterMatchPick(m89, "team-fra"),
    "That team is not in this matchup.",
  );
  assert.strictEqual(isKnockoutMatchDirectPickEligible(m89), true);

  const afterPick = pruneParticipantPicks(
    applyKnockoutMatchWinnerToSlots(slots, m89, "team-swe"),
    { r32WinnerContext: { teams, tournamentMatches, knockoutBracketPicksUnlocked: true } },
  );
  assert.strictEqual(
    afterPick.find(
      (s) => s.predictionKind === "quarterfinalist" && s.slotKey === "1",
    )?.teamId,
    "team-swe",
  );
  const afterRows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots: afterPick,
    teams,
    tournamentMatches,
    gradual: emptyGradual,
    knockoutBracketPicksUnlocked: true,
  });
  const m89After = afterRows.find((r) => r.fifaMatchNo === 89)!;
  assert.strictEqual(m89After.homeTeamId, "team-ger");
  assert.strictEqual(m89After.awayTeamId, "team-swe");
  assert.strictEqual(validatedKnockoutMatchWinner(m89After), "team-swe");
}

// Valid M77 winner France stays stable through M89 selection.
{
  const slots: KnockoutPickSlotDraft[] = [
    r16Slot("2", "team-ger"),
    r16Slot("5", "team-fra"),
    ...Array.from({ length: 14 }, (_, i) =>
      r16Slot(String(i < 1 ? i + 1 : i + 2)),
    ),
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
  assert.strictEqual(m89.homeTeamId, "team-ger");
  assert.strictEqual(m89.awayTeamId, "team-fra");
  const afterPick = pruneParticipantPicks(
    applyKnockoutMatchWinnerToSlots(slots, m89, "team-fra"),
  );
  const afterRows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots: afterPick,
    teams,
    gradual: emptyGradual,
    knockoutBracketPicksUnlocked: true,
  });
  const m89After = afterRows.find((r) => r.fifaMatchNo === 89)!;
  assert.strictEqual(m89After.homeTeamId, "team-ger");
  assert.strictEqual(m89After.awayTeamId, "team-fra");
  assert.strictEqual(validatedKnockoutMatchWinner(m89After), "team-fra");
}

console.log("knockoutMatchPickRows.selftest.ts: ok");
