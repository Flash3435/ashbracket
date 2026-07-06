import assert from "node:assert";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import {
  applyKnockoutMatchWinnerToSlots,
  buildKnockoutMatchPickRows,
  FINAL_MATCH_INCOMPLETE_MSG,
  incompleteR16MatchMessage,
  isKnockoutMatchDirectPickEligible,
  knockoutMatchSavedPickPresentation,
  knockoutMatchStepComplete,
  knockoutMatchTeamPickAriaLabel,
  mergeKnockoutMatchRowSavedPickFromSlots,
  readConfirmedR32MatchWinner,
  readR32MatchWinnerForBracket,
  savedPickMatchesRowMatchup,
  savedPickIsStaleForKnockoutRow,
  validateKnockoutLaterMatchPick,
  validatedKnockoutMatchWinner,
} from "./knockoutMatchPickRows";
import {
  blockedKnockoutRowUserCopy,
  blockedKnockoutStepGateCopy,
} from "./knockoutBlockedRowExplanation";
import {
  getKnockoutStepCompletionFromDraftState,
  resolveKnockoutProgressContext,
} from "./knockoutMatchProgress";
import {
  pruneOfficialKnockoutPathPicks,
} from "../predictions/pruneOfficialKnockoutPathPicks";
import {
  canMeetInFinalByQfPath,
  semifinalMatchIndexForR16Slot,
} from "../bracket/wc2026KnockoutPairings";
import { applyKnockoutPathInvalidation } from "../predictions/knockoutPathInvalidation";
import { pruneParticipantPicks } from "../predictions/knockoutPickConsistency";
import {
  applyGradualKnockoutPickSaveGuards,
  validateKnockoutParticipantPickChanges,
} from "../predictions/validateGradualKnockoutPickSave";
import { encodeKnockoutPickStatusMetadata } from "../predictions/knockoutPickStatus";
import type { GradualKnockoutSelectionState } from "./gradualKnockoutUnlock";
import {
  buildGradualR32MatchPickRows,
  getGradualKnockoutSelectionState,
  readGradualR32MatchWinner,
} from "./gradualKnockoutUnlock";
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
    id: "team-por",
    name: "Portugal",
    countryCode: "POR",
    fifaCode: "POR",
    fifaRank: 6,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-arg",
    name: "Argentina",
    countryCode: "ARG",
    fifaCode: "ARG",
    fifaRank: 1,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-col",
    name: "Colombia",
    countryCode: "COL",
    fifaCode: "COL",
    fifaRank: 11,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
];

function r16Slot(
  slotKey: string,
  teamId = "",
  pickStatus?: "out",
): KnockoutPickSlotDraft {
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
    pickStatus: pickStatus ?? null,
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

function sfSlot(
  slotKey: string,
  teamId = "",
  pickStatus?: "out",
): KnockoutPickSlotDraft {
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
    pickStatus: pickStatus ?? null,
    invalidReason: pickStatus === "out" ? "not_in_official_matchup" : null,
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
    m89.display.emptyPrimaryLine?.includes("M74"),
    "should name missing upstream R32 fixtures",
  );
  assert.strictEqual(m89.display.statusLine, null);
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
  assert.ok(m89.display.emptyPrimaryLine?.includes("M77"));
  assert.strictEqual(m89.display.statusLine, null);
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
  assert.strictEqual(rows[0]!.awayTeamId, "team-fra");
  assert.strictEqual(rows[1]!.fifaMatchNo, 102);
  assert.strictEqual(rows[1]!.homeTeamId, "team-bra");
  assert.strictEqual(rows[1]!.awayTeamId, "team-ned");
}

// SF sides use stored feeder picks when upstream QF validation is incomplete (poster/wizard parity)
{
  const slots: KnockoutPickSlotDraft[] = [
    sfSlot("1", "team-fra"),
    sfSlot("2", "team-ger"),
    finSlot("1", "team-fra"),
  ];
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "semifinalist",
    slots,
    teams,
    gradual: emptyGradual,
    knockoutBracketPicksUnlocked: true,
  });
  assert.strictEqual(rows[0]!.fifaMatchNo, 101);
  assert.strictEqual(rows[0]!.homeTeamId, "team-fra");
  assert.strictEqual(rows[0]!.awayTeamId, "team-ger");
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
    rows[0]!.display.emptyPrimaryLine?.includes("Complete Round of 32 first"),
  );
  assert.strictEqual(rows[0]!.display.statusLine, null);
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
  assert.match(
    rows[0]!.display.emptyPrimaryLine!,
    /M74|semi-final|Pick a winner/i,
  );
  assert.strictEqual(rows[0]!.display.statusLine, null);
  assert.notStrictEqual(rows[0]!.display.emptyPrimaryLine, FINAL_MATCH_INCOMPLETE_MSG);
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
  const afterBoth = applyKnockoutMatchWinnerToSlots(afterM101, m102, "team-ned");
  assert.strictEqual(
    afterBoth.find((s) => s.predictionKind === "finalist" && s.slotKey === "2")
      ?.teamId,
    "team-ned",
  );
  const completedRows = buildKnockoutMatchPickRows({
    bracketKind: "semifinalist",
    slots: afterBoth,
    teams,
    gradual: emptyGradual,
  });
  assert.strictEqual(knockoutMatchStepComplete(completedRows), true);
}

// Semi-final winner picks survive prune when only one side of the final is known
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
  const m101 = rows.find((r) => r.fifaMatchNo === 101)!;
  const m102 = rows.find((r) => r.fifaMatchNo === 102)!;
  const afterM101 = pruneParticipantPicks(
    applyKnockoutMatchWinnerToSlots(slots, m101, "team-ger"),
  );
  assert.strictEqual(
    afterM101.find((s) => s.predictionKind === "finalist" && s.slotKey === "1")
      ?.teamId,
    "team-ger",
    "M101 winner must not be pruned before M102 is picked",
  );
  const afterBoth = pruneParticipantPicks(
    applyKnockoutMatchWinnerToSlots(afterM101, m102, "team-ned"),
  );
  assert.strictEqual(
    afterBoth.find((s) => s.predictionKind === "finalist" && s.slotKey === "1")
      ?.teamId,
    "team-ger",
  );
  assert.strictEqual(
    afterBoth.find((s) => s.predictionKind === "finalist" && s.slotKey === "2")
      ?.teamId,
    "team-ned",
  );
  const { cleared } = pruneOfficialKnockoutPathPicks(afterBoth);
  assert.strictEqual(cleared.length, 0);
}

// Semi-final winner not in the official matchup is pruned
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
    finSlot("1", "team-can"),
    finSlot("2"),
  ];
  const { slots: pruned, cleared } = pruneOfficialKnockoutPathPicks(slots);
  assert.ok(
    cleared.some(
      (c) =>
        c.predictionKind === "finalist" &&
        c.slotKey === "1" &&
        c.teamId === "team-can",
    ),
    "Canada is not in M101 and must be cleared from finalist slot 1",
  );
  assert.strictEqual(
    pruned.find((s) => s.predictionKind === "finalist" && s.slotKey === "1")
      ?.teamId,
    "",
  );
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
    finSlot("1", "team-can"), // stale: not in M101 (Germany vs France)
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
  assert.strictEqual(m89.lockReason, "pickable");
  assert.strictEqual(
    validateKnockoutLaterMatchPick(m89, "team-swe"),
    null,
    "first-time pick allowed when feeders official and match not started",
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

// Locked admin-corrected R32 winner feeds Round of 16 when stale round_of_32 slots disagree
{
  const m73 = {
    match_id: "M73",
    edition_id: "ed",
    edition_code: "wc2026",
    match_code: "M73",
    stage_code: "round_of_32",
    stage_label: "R32",
    stage_sort_order: 2,
    group_code: null,
    round_index: 0,
    kickoff_at: "2026-06-28T19:00:00Z",
    status: "live",
    home_goals: null,
    away_goals: null,
    home_penalties: null,
    away_penalties: null,
    home_team_name: "South Africa",
    home_country_code: "RSA",
    away_team_name: "Canada",
    away_country_code: "CAN",
    winner_team_name: null,
    winner_country_code: null,
  } satisfies TournamentMatchPublicRow;
  const m75 = {
    ...m73,
    match_id: "M75",
    match_code: "M75",
    round_index: 2,
    home_team_name: "Morocco",
    home_country_code: "MAR",
    away_team_name: "Portugal",
    away_country_code: "POR",
  } satisfies TournamentMatchPublicRow;
  const tournamentMatches = [m73, m75];
  const nowMs = new Date("2026-06-29T00:00:00Z").getTime();
  const gradual = getGradualKnockoutSelectionState({
    matches: tournamentMatches,
    teams,
    nowMs,
    fullRoundOf32Official: true,
  });
  const ctx = {
    teams,
    tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: true,
  };
  const slots: KnockoutPickSlotDraft[] = [
    r32Side("1", "team-por"),
    r32Side("2", "team-mar"),
    r32Side("5", "team-mar"),
    r32Side("6", "team-por"),
    r16Slot("1", "team-can"),
    r16Slot("3", "team-mar"),
  ];
  const ms73 = gradual.matchStates[0]!;
  assert.strictEqual(
    readGradualR32MatchWinner(0, slots, teams, ms73),
    "team-can",
    "R32 display reads corrected winner",
  );
  assert.strictEqual(
    readConfirmedR32MatchWinner(0, slots, ctx),
    "team-can",
    "downstream builder reads same corrected winner",
  );
  const uiRows = buildGradualR32MatchPickRows({
    slots,
    state: gradual,
    teams,
    fullRoundOf32Official: true,
  });
  assert.strictEqual(uiRows[0]!.winnerTeamId, "team-can");
  const r16Rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots,
    teams,
    tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: true,
    nowMs,
  });
  const m90 = r16Rows.find((r) => r.fifaMatchNo === 90)!;
  assert.strictEqual(m90.homeTeamId, "team-can");
  assert.strictEqual(m90.awayTeamId, "team-mar");
  assert.strictEqual(m90.lockReason, "pickable");
  const { slots: pruned, cleared } = pruneOfficialKnockoutPathPicks(slots, ctx);
  assert.strictEqual(cleared.length, 0);
  assert.strictEqual(
    pruned.find((s) => s.predictionKind === "round_of_16" && s.slotKey === "1")
      ?.teamId,
    "team-can",
  );
}

// Missing locked M73 still reports missing when no correction exists
{
  const m73 = {
    match_id: "M73",
    edition_id: "ed",
    edition_code: "wc2026",
    match_code: "M73",
    stage_code: "round_of_32",
    stage_label: "R32",
    stage_sort_order: 2,
    group_code: null,
    round_index: 0,
    kickoff_at: "2026-06-28T19:00:00Z",
    status: "live",
    home_goals: null,
    away_goals: null,
    home_penalties: null,
    away_penalties: null,
    home_team_name: "South Africa",
    home_country_code: "RSA",
    away_team_name: "Canada",
    away_country_code: "CAN",
    winner_team_name: null,
    winner_country_code: null,
  } satisfies TournamentMatchPublicRow;
  const gradual = getGradualKnockoutSelectionState({
    matches: [m73],
    teams,
    nowMs: new Date("2026-06-29T00:00:00Z").getTime(),
    fullRoundOf32Official: true,
  });
  const ctx = {
    teams,
    tournamentMatches: [m73],
    gradual,
    knockoutBracketPicksUnlocked: true,
  };
  const slots: KnockoutPickSlotDraft[] = [
    r32Side("1", "team-por"),
    r32Side("2", "team-mar"),
    r16Slot("1", ""),
  ];
  assert.strictEqual(readConfirmedR32MatchWinner(0, slots, ctx), "");
  const uiRows = buildGradualR32MatchPickRows({
    slots,
    state: gradual,
    teams,
    fullRoundOf32Official: true,
  });
  assert.strictEqual(uiRows[0]!.winnerTeamId, "");
  assert.strictEqual(uiRows[0]!.lockReason, "started");
}

// R32 display and R16 builder share the same winner source for M74/M78/M80
{
  const norEngTeams: Team[] = [
    {
      id: "team-nor",
      name: "Norway",
      countryCode: "NOR",
      fifaCode: "NOR",
      fifaRank: 45,
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
    {
      id: "team-sui",
      name: "Switzerland",
      countryCode: "SUI",
      fifaCode: "SUI",
      fifaRank: 18,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "team-cro",
      name: "Croatia",
      countryCode: "CRO",
      fifaCode: "CRO",
      fifaRank: 10,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "team-esp",
      name: "Spain",
      countryCode: "ESP",
      fifaCode: "ESP",
      fifaRank: 7,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "team-jpn",
      name: "Japan",
      countryCode: "JPN",
      fifaCode: "JPN",
      fifaRank: 17,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "team-sen",
      name: "Senegal",
      countryCode: "SEN",
      fifaCode: "SEN",
      fifaRank: 22,
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
      id: "team-col",
      name: "Colombia",
      countryCode: "COL",
      fifaCode: "COL",
      fifaRank: 11,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
  ];
  const allTeams = [...teams, ...norEngTeams];
  function r32Pub(
    code: string,
    home: string,
    away: string,
  ): TournamentMatchPublicRow {
    return {
      match_id: code,
      edition_id: "ed",
      edition_code: "wc2026",
      match_code: code,
      stage_code: "round_of_32",
      stage_label: "R32",
      stage_sort_order: 2,
      group_code: null,
      round_index: 0,
      kickoff_at: "2026-07-01T19:00:00Z",
      status: "live",
      home_goals: null,
      away_goals: null,
      home_penalties: null,
      away_penalties: null,
      home_team_name: home,
      home_country_code: home,
      away_team_name: away,
      away_country_code: away,
      winner_team_name: null,
      winner_country_code: null,
    };
  }
  const tournamentMatches = [
    r32Pub("M74", "GER", "SUI"),
    r32Pub("M76", "COL", "POR"),
    r32Pub("M77", "FRA", "BEL"),
    r32Pub("M78", "NOR", "CRO"),
    r32Pub("M79", "ESP", "JPN"),
    r32Pub("M80", "ENG", "SEN"),
  ];
  const nowMs = new Date("2026-06-29T00:00:00Z").getTime();
  const gradual = getGradualKnockoutSelectionState({
    matches: tournamentMatches,
    teams: allTeams,
    nowMs,
    fullRoundOf32Official: true,
  });
  const ctx = {
    teams: allTeams,
    tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: true,
  };
  const r16Winners: Record<string, string> = {
    "2": "team-ger",
    "4": "team-col",
    "5": "team-fra",
    "6": "team-nor",
    "7": "team-esp",
    "8": "team-eng",
  };
  const slots: KnockoutPickSlotDraft[] = [
    r32Side("3", "team-bra"),
    r32Side("4", "team-ned"),
    r32Side("11", "team-mar"),
    r32Side("12", "team-por"),
    r32Side("15", "team-rsa"),
    r32Side("16", "team-can"),
    ...Array.from({ length: 16 }, (_, i) =>
      r16Slot(String(i + 1), r16Winners[String(i + 1)] ?? ""),
    ),
  ];
  for (const matchIndex of [1, 5, 7] as const) {
    const ms = gradual.matchStates[matchIndex]!;
    const gradualWinner = readGradualR32MatchWinner(
      matchIndex,
      slots,
      allTeams,
      ms,
    );
    const confirmedWinner = readConfirmedR32MatchWinner(
      matchIndex,
      slots,
      ctx,
    );
    assert.strictEqual(
      confirmedWinner,
      gradualWinner,
      `M${73 + matchIndex} display and R16 source must agree`,
    );
    assert.ok(gradualWinner, `M${73 + matchIndex} should have a winner`);
  }
  const uiRows = buildGradualR32MatchPickRows({
    slots,
    state: gradual,
    teams: allTeams,
    fullRoundOf32Official: true,
  });
  assert.strictEqual(uiRows.find((r) => r.fifaMatchNo === 74)!.winnerTeamId, "team-ger");
  assert.strictEqual(uiRows.find((r) => r.fifaMatchNo === 78)!.winnerTeamId, "team-nor");
  assert.strictEqual(uiRows.find((r) => r.fifaMatchNo === 80)!.winnerTeamId, "team-eng");
  const r16Rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots,
    teams: allTeams,
    tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: true,
    nowMs,
  });
  const m89 = r16Rows.find((r) => r.fifaMatchNo === 89)!;
  const m91 = r16Rows.find((r) => r.fifaMatchNo === 91)!;
  const m92 = r16Rows.find((r) => r.fifaMatchNo === 92)!;
  assert.ok(
    !m89.display.emptyPrimaryLine?.includes("M74"),
    "M89 must not report M74 missing when R32 shows Germany",
  );
  assert.ok(
    !m91.display.emptyPrimaryLine?.includes("M78"),
    "M91 must not report M78 missing when R32 shows Norway",
  );
  assert.ok(
    !m92.display.emptyPrimaryLine?.includes("M80"),
    "M92 must not report M80 missing when R32 shows England",
  );
  assert.strictEqual(m89.homeTeamId, "team-ger");
  assert.strictEqual(m89.awayTeamId, "team-fra");
  assert.strictEqual(m91.homeTeamId, "team-col");
  assert.strictEqual(m91.awayTeamId, "team-nor");
  assert.strictEqual(m92.homeTeamId, "team-esp");
  assert.strictEqual(m92.awayTeamId, "team-eng");
  const { slots: pruned, cleared } = pruneOfficialKnockoutPathPicks(slots, ctx);
  assert.strictEqual(cleared.length, 0);
  assert.strictEqual(
    pruned.find((s) => s.predictionKind === "round_of_16" && s.slotKey === "2")
      ?.teamId,
    "team-ger",
  );
  const displaySlots = pruneParticipantPicks(slots, { r32WinnerContext: ctx });
  const displayR16 = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots: displaySlots,
    teams: allTeams,
    tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: true,
    nowMs,
  });
  assert.ok(
    !displayR16.find((r) => r.fifaMatchNo === 89)!.display.emptyPrimaryLine?.includes(
      "M74",
    ),
  );
}

// Locked Round of 16 rows expose saved pick state for admin display.
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
  const baseSlots: KnockoutPickSlotDraft[] = [
    r16Slot("2", "team-ger"),
    r16Slot("5", "team-fra"),
    ...Array.from({ length: 14 }, (_, i) =>
      r16Slot(String(i < 1 ? i + 1 : i + 2)),
    ),
    ...Array.from({ length: 8 }, (_, i) => qfSlot(String(i + 1))),
  ];
  const frozenRows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots: baseSlots,
    teams,
    tournamentMatches,
    gradual: emptyGradual,
    knockoutBracketPicksUnlocked: true,
  });
  const frozenM89 = frozenRows.find((r) => r.fifaMatchNo === 89)!;
  assert.strictEqual(frozenM89.lockReason, "pickable");

  const missingPick = knockoutMatchSavedPickPresentation(frozenM89, teams);
  assert.strictEqual(missingPick.savedPickStatus, "missing");
  assert.strictEqual(missingPick.savedPickSummaryLine, "No pick saved");
  assert.strictEqual(missingPick.lockStatusLine, null);
  assert.strictEqual(missingPick.matchupLine, "Germany vs Sweden");
  assert.ok(
    !missingPick.savedPickSummaryLine.toLowerCase().includes("admin"),
    "participant-facing saved pick copy must not mention admin correction",
  );

  const withValidPick = applyKnockoutMatchWinnerToSlots(
    baseSlots,
    frozenM89,
    "team-swe",
  );
  const validRows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots: withValidPick,
    teams,
    tournamentMatches,
    gradual: emptyGradual,
    knockoutBracketPicksUnlocked: true,
  });
  const validM89 = validRows.find((r) => r.fifaMatchNo === 89)!;
  const validPick = knockoutMatchSavedPickPresentation(validM89, teams);
  assert.strictEqual(validPick.savedPickStatus, "valid");
  assert.strictEqual(validPick.savedPickSummaryLine, "Saved pick: Sweden");
  assert.strictEqual(validPick.savedPickTeamId, "team-swe");
  assert.strictEqual(validPick.lockStatusLine, null);
  assert.strictEqual(validPick.savedPickWarning, null);

  const staleSlots = [
    ...baseSlots.filter(
      (s) => !(s.predictionKind === "quarterfinalist" && s.slotKey === "1"),
    ),
    qfSlot("1", "team-bra"),
  ];
  const staleRows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots: staleSlots,
    teams,
    tournamentMatches,
    gradual: emptyGradual,
    knockoutBracketPicksUnlocked: true,
  });
  const staleM89 = staleRows.find((r) => r.fifaMatchNo === 89)!;
  assert.strictEqual(staleM89.lockReason, "pickable");
  const stalePick = knockoutMatchSavedPickPresentation(staleM89, teams);
  assert.strictEqual(stalePick.savedPickStatus, "stale");
  assert.strictEqual(
    stalePick.savedPickSummaryLine,
    "Previous saved pick: Brazil",
  );
  assert.strictEqual(
    stalePick.savedPickWarning,
    "That pick is out — it no longer matches this matchup.",
  );
  assert.strictEqual(stalePick.lockStatusLine, null);
  assert.strictEqual(stalePick.savedPickTeamId, "team-bra");
}

// M94 stale R16 winner survives path invalidation when R32 feeders are official (Seema scenario).
{
  const m94Teams: Team[] = [
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
      id: "team-bih",
      name: "Bosnia and Herzegovina",
      countryCode: "BIH",
      fifaCode: "BIH",
      fifaRank: 60,
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
      id: "team-sen",
      name: "Senegal",
      countryCode: "SEN",
      fifaCode: "SEN",
      fifaRank: 22,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
  ];
  function finishedR32(
    code: string,
    home: string,
    away: string,
    winner: string,
  ): TournamentMatchPublicRow {
    return {
      match_id: code,
      edition_id: "ed",
      edition_code: "wc2026",
      match_code: code,
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
      home_team_name: home,
      home_country_code: home,
      away_team_name: away,
      away_country_code: away,
      winner_team_name: winner,
      winner_country_code: winner,
    };
  }
  const m94Matches = [
    finishedR32("M81", "USA", "BIH", "USA"),
    finishedR32("M82", "BEL", "SEN", "BEL"),
    {
      match_id: "M94",
      edition_id: "ed",
      edition_code: "wc2026",
      match_code: "M94",
      stage_code: "round_of_16",
      stage_label: "Round of 16",
      stage_sort_order: 3,
      group_code: null,
      round_index: 0,
      kickoff_at: "2026-07-06T19:00:00Z",
      status: "scheduled",
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
  const m94NowMs = Date.parse("2026-07-06T12:00:00Z");
  const m94Gradual = getGradualKnockoutSelectionState({
    matches: m94Matches,
    teams: m94Teams,
    nowMs: m94NowMs,
    fullRoundOf32Official: true,
  });
  const m94Ctx = {
    teams: m94Teams,
    tournamentMatches: m94Matches,
    gradual: m94Gradual,
    knockoutBracketPicksUnlocked: true,
    nowMs: m94NowMs,
  };
  const staleM94Slots: KnockoutPickSlotDraft[] = [
    r16Slot("9", "team-us"),
    r16Slot("10", "team-bel"),
    qfSlot("6", "team-fra"),
  ];
  const { slots: pruned, cleared } = pruneOfficialKnockoutPathPicks(
    staleM94Slots,
    m94Ctx,
  );
  assert.ok(
    cleared.some(
      (c) => c.predictionKind === "quarterfinalist" && c.slotKey === "6",
    ),
    "stale France M94 pick should be cleared by path repair",
  );
  const afterInvalidation = applyKnockoutPathInvalidation(pruned, cleared, {
    teams: m94Teams,
    tournamentMatches: m94Matches,
    knockoutBracketPicksUnlocked: true,
    nowMs: m94NowMs,
  });
  const qf6After = afterInvalidation.find(
    (s) => s.predictionKind === "quarterfinalist" && s.slotKey === "6",
  );
  assert.strictEqual(qf6After?.teamId, "", "stale M94 pick cleared before kickoff");
  assert.strictEqual(qf6After?.pickStatus ?? null, null);

  const displaySlots = pruneParticipantPicks(afterInvalidation, {
    r32WinnerContext: m94Ctx,
  });
  const m94Rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots: displaySlots,
    teams: m94Teams,
    tournamentMatches: m94Matches,
    gradual: m94Gradual,
    knockoutBracketPicksUnlocked: true,
    nowMs: m94NowMs,
  });
  const m94Row = m94Rows.find((r) => r.fifaMatchNo === 94)!;
  assert.strictEqual(m94Row.homeTeamId, "team-us");
  assert.strictEqual(m94Row.awayTeamId, "team-bel");
  assert.strictEqual(m94Row.lockReason, "pickable");
  assert.strictEqual(m94Row.winnerTeamId, "");
  assert.strictEqual(m94Row.pickStatus, null);
  assert.strictEqual(isKnockoutMatchDirectPickEligible(m94Row), true);
  assert.strictEqual(m94Row.display.emptyPrimaryLine, "United States vs Belgium");

  const presentation = knockoutMatchSavedPickPresentation(m94Row, m94Teams);
  assert.strictEqual(presentation.savedPickStatus, "missing");
  assert.strictEqual(presentation.savedPickSummaryLine, "No pick saved");
  assert.strictEqual(presentation.lockStatusLine, null);

  const swapOk = validateKnockoutParticipantPickChanges({
    incoming: [
      {
        predictionKind: "quarterfinalist",
        tournamentStageId: "qf",
        slotKey: "6",
        groupCode: null,
        bonusKey: null,
        teamId: "team-bel",
      },
    ],
    existing: [
      {
        id: "p-m94",
        poolId: "pool",
        participantId: "par",
        predictionKind: "quarterfinalist",
        teamId: "team-fra",
        tournamentStageId: "qf",
        groupCode: null,
        slotKey: "6",
        bonusKey: null,
        valueText: null,
        createdAt: "",
        updatedAt: "",
      },
    ],
    matches: m94Matches,
    gradual: m94Gradual,
    fullRoundOf32Official: true,
    teams: m94Teams,
    nowMs: m94NowMs,
  });
  assert.strictEqual(
    swapOk,
    null,
    "server allows replacing stale M94 pick with Belgium before kickoff",
  );

  const backfillGuard = applyGradualKnockoutPickSaveGuards({
    incoming: [
      {
        predictionKind: "quarterfinalist",
        tournamentStageId: "qf",
        slotKey: "6",
        groupCode: null,
        bonusKey: null,
        teamId: "team-us",
      },
    ],
    existing: [
      {
        id: "p-m94",
        poolId: "pool",
        participantId: "par",
        predictionKind: "quarterfinalist",
        teamId: "team-fra",
        tournamentStageId: "qf",
        groupCode: null,
        slotKey: "6",
        bonusKey: null,
        valueText: null,
        createdAt: "",
        updatedAt: "",
      },
    ],
    teams: m94Teams,
    matches: m94Matches,
    fullRoundOf32Official: true,
    nowMs: m94NowMs,
  });
  assert.strictEqual(
    backfillGuard.error,
    null,
    "server allows swapping stale M94 pick to US before kickoff",
  );

  const outValueText = encodeKnockoutPickStatusMetadata({
    v: 1,
    status: "out",
    reason: "not_in_official_matchup",
  });
  const outSwapErr = validateKnockoutParticipantPickChanges({
    incoming: [
      {
        predictionKind: "quarterfinalist",
        tournamentStageId: "qf",
        slotKey: "6",
        groupCode: null,
        bonusKey: null,
        teamId: "team-bel",
      },
    ],
    existing: [
      {
        id: "p-m94-out",
        poolId: "pool",
        participantId: "par",
        predictionKind: "quarterfinalist",
        teamId: "team-fra",
        tournamentStageId: "qf",
        groupCode: null,
        slotKey: "6",
        bonusKey: null,
        valueText: outValueText,
        createdAt: "",
        updatedAt: "",
      },
    ],
    matches: m94Matches,
    gradual: m94Gradual,
    fullRoundOf32Official: true,
    teams: m94Teams,
    nowMs: m94NowMs,
  });
  assert.ok(outSwapErr, "server rejects replacing out M94 pick with Belgium");
}

// Seema-style partial-complete participant: missing M94 pickable before kickoff.
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
      kickoff_at: "2026-07-06T19:00:00Z",
      status: "scheduled",
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
  const seemaNowMs = Date.parse("2026-07-06T12:00:00Z");
  const seemaGradual = getGradualKnockoutSelectionState({
    matches: seemaMatches,
    teams: seemaTeams,
    nowMs: seemaNowMs,
    fullRoundOf32Official: true,
  });
  const seemaSlots: KnockoutPickSlotDraft[] = [
    r16Slot("9", "team-us"),
    r16Slot("10", "team-bel"),
    qfSlot("1", "team-fra"),
    qfSlot("2", "team-can"),
    qfSlot("6", ""),
    sfSlot("1", "team-fra"),
    finSlot("1", "team-eng"),
  ];
  const seemaRows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots: seemaSlots,
    teams: seemaTeams,
    tournamentMatches: seemaMatches,
    gradual: seemaGradual,
    knockoutBracketPicksUnlocked: true,
    nowMs: seemaNowMs,
  });
  const seemaM94 = seemaRows.find((r) => r.fifaMatchNo === 94)!;
  assert.strictEqual(seemaM94.lockReason, "pickable");
  assert.strictEqual(isKnockoutMatchDirectPickEligible(seemaM94), true);
  assert.strictEqual(
    seemaM94.display.statusLine,
    "Pick still open until this match kicks off.",
  );
  const seemaPresentation = knockoutMatchSavedPickPresentation(seemaM94, seemaTeams);
  assert.strictEqual(seemaPresentation.savedPickStatus, "missing");
  assert.strictEqual(seemaPresentation.savedPickSummaryLine, "No pick saved");
  assert.strictEqual(seemaPresentation.lockStatusLine, null);
}

// SF rows use saved QF winners even when upstream R16 feeders are out/missing
{
  const slots: KnockoutPickSlotDraft[] = [
    ...Array.from({ length: 16 }, (_, i) => r16Slot(String(i + 1), "team-rsa")),
    r16Slot("3", "team-bra", "out"), // M91 feeder path out
    r16Slot("6", "team-ger", "out"), // M94 feeder path out
    sfSlot("1", "team-fra"), // M97 winner France
    sfSlot("2", "team-ger"), // M98 winner Germany
    sfSlot("3", "team-bra"), // M99 winner Brazil
    sfSlot("4", "team-arg"), // M100 winner Argentina
    finSlot("1"),
    finSlot("2"),
  ];
  const input = {
    bracketKind: "semifinalist" as const,
    slots,
    teams,
    knockoutBracketPicksUnlocked: true,
  };
  const rows = buildKnockoutMatchPickRows(input);
  const m101 = rows.find((r) => r.fifaMatchNo === 101)!;
  const m102 = rows.find((r) => r.fifaMatchNo === 102)!;
  assert.strictEqual(m101.lockReason, "pickable");
  assert.strictEqual(m101.homeTeamId, "team-fra");
  assert.strictEqual(m101.awayTeamId, "team-ger");
  assert.strictEqual(isKnockoutMatchDirectPickEligible(m101), true);
  assert.strictEqual(m102.lockReason, "pickable");
  assert.strictEqual(m102.homeTeamId, "team-bra");
  assert.strictEqual(m102.awayTeamId, "team-arg");
  assert.doesNotMatch(
    blockedKnockoutRowUserCopy(m101, "semifinalist", input),
    /M91|M94|Round of 32/i,
  );
  assert.doesNotMatch(
    blockedKnockoutRowUserCopy(m102, "semifinalist", input),
    /M91|M94|Round of 32/i,
  );

  const afterPick = applyKnockoutMatchWinnerToSlots(slots, m101, "team-fra");
  assert.strictEqual(
    validateKnockoutLaterMatchPick(m101, "team-fra"),
    null,
    "SF pick allowed from saved QF winners",
  );
  assert.ok(
    afterPick.find((s) => s.predictionKind === "finalist" && s.slotKey === "1")
      ?.teamId === "team-fra",
  );

  const sfStatus = getKnockoutStepCompletionFromDraftState(
    "semifinalist",
    resolveKnockoutProgressContext({
      slots,
      teams,
      officialRoundOf32Complete: true,
    }),
  );
  assert.strictEqual(sfStatus.complete, false);
  assert.strictEqual(sfStatus.kind, "needs_pick");
}

// Case 1: France + Spain are valid M101 feeders — pickable, no wrong-path copy
{
  const fraEspTeams: Team[] = [
    ...teams,
    {
      id: "team-esp",
      name: "Spain",
      countryCode: "ESP",
      fifaCode: "ESP",
      fifaRank: 7,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
  ];
  const slots: KnockoutPickSlotDraft[] = [
    ...Array.from({ length: 16 }, (_, i) => r16Slot(String(i + 1), "team-rsa")),
    sfSlot("1", "team-fra"),
    sfSlot("2", "team-esp"),
    sfSlot("3", "team-bra"),
    sfSlot("4", "team-arg"),
  ];
  const input = {
    bracketKind: "semifinalist" as const,
    slots,
    teams: fraEspTeams,
    knockoutBracketPicksUnlocked: true,
  };
  const m101 = buildKnockoutMatchPickRows(input).find((r) => r.fifaMatchNo === 101)!;
  assert.strictEqual(m101.lockReason, "pickable");
  assert.strictEqual(m101.homeTeamId, "team-fra");
  assert.strictEqual(m101.awayTeamId, "team-esp");
  assert.doesNotMatch(
    blockedKnockoutRowUserCopy(m101, "semifinalist", input),
    /no longer on the path|no longer feeds this matchup/i,
  );
  assert.doesNotMatch(
    blockedKnockoutStepGateCopy("semifinalist", input) ?? "",
    /paths are blocked|picks are out/i,
  );
}

// Missing QF winner blocks SF with immediate feeder copy, not stale R16 refs
{
  const slots: KnockoutPickSlotDraft[] = [
    ...Array.from({ length: 16 }, (_, i) => r16Slot(String(i + 1), "team-rsa")),
    r16Slot("3", "team-bra", "out"),
    sfSlot("1", "team-fra"), // M97 saved
    sfSlot("4", "team-arg"), // M100 saved
  ];
  const input = {
    bracketKind: "semifinalist" as const,
    slots,
    teams,
    knockoutBracketPicksUnlocked: true,
  };
  const rows = buildKnockoutMatchPickRows(input);
  const m101 = rows.find((r) => r.fifaMatchNo === 101)!;
  const m102 = rows.find((r) => r.fifaMatchNo === 102)!;
  assert.strictEqual(m101.lockReason, "incomplete");
  assert.strictEqual(m102.lockReason, "incomplete");
  assert.match(
    m101.display.emptyPrimaryLine!,
    /Waiting for your quarter-final pick|Pick a winner for/i,
  );
  assert.match(
    m102.display.emptyPrimaryLine!,
    /Waiting for your quarter-final pick|Pick a winner for/i,
  );
  assert.doesNotMatch(m101.display.emptyPrimaryLine!, /M91|M94/i);
  assert.doesNotMatch(m102.display.emptyPrimaryLine!, /M91|M94/i);
}

// Invalid QF feeder path blocks SF — alive team, wrong bracket topology
{
  const slots: KnockoutPickSlotDraft[] = [
    ...Array.from({ length: 16 }, (_, i) => r16Slot(String(i + 1), "team-rsa")),
    {
      ...sfSlot("1", "team-fra"),
      pickStatus: "out" as const,
      invalidReason: "not_in_official_matchup" as const,
    },
    sfSlot("2", "team-ger"),
    sfSlot("3", "team-bra"),
    sfSlot("4", "team-arg"),
  ];
  const input = {
    bracketKind: "semifinalist" as const,
    slots,
    teams,
    knockoutBracketPicksUnlocked: true,
  };
  const m101 = buildKnockoutMatchPickRows(input).find((r) => r.fifaMatchNo === 101)!;
  assert.strictEqual(m101.lockReason, "pickable");
  assert.strictEqual(m101.homeTeamId, null);
  assert.strictEqual(m101.awayTeamId, "team-ger");
  assert.strictEqual(m101.display.emptyPrimaryLine, "TBD vs Germany");
  assert.doesNotMatch(m101.display.emptyPrimaryLine!, /France has been eliminated/i);
  assert.doesNotMatch(m101.display.emptyPrimaryLine!, /M91|M89/i);
  assert.doesNotMatch(m101.display.emptyPrimaryLine!, /\bM97\b/i);
}

// Truly eliminated QF pick blocks SF when official results confirm elimination
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
      kickoff_at: "2026-07-08T18:00:00Z",
      status: "finished",
      home_goals: 0,
      away_goals: 2,
      home_penalties: null,
      away_penalties: null,
      home_team_name: "France",
      home_country_code: "FRA",
      away_team_name: "Germany",
      away_country_code: "GER",
      winner_team_name: "Germany",
      winner_country_code: "GER",
    },
  ];
  const slots: KnockoutPickSlotDraft[] = [
    ...Array.from({ length: 16 }, (_, i) => r16Slot(String(i + 1), "team-rsa")),
    {
      ...sfSlot("1", "team-fra"),
      pickStatus: "out" as const,
      invalidReason: "not_in_official_matchup" as const,
    },
    sfSlot("2", "team-ger"),
    sfSlot("3", "team-bra"),
    sfSlot("4", "team-arg"),
  ];
  const input = {
    bracketKind: "semifinalist" as const,
    slots,
    teams,
    tournamentMatches,
    knockoutBracketPicksUnlocked: true,
  };
  const m101 = buildKnockoutMatchPickRows(input).find((r) => r.fifaMatchNo === 101)!;
  assert.strictEqual(m101.lockReason, "pickable");
  assert.strictEqual(m101.homeTeamId, null);
  assert.strictEqual(m101.awayTeamId, "team-ger");
  assert.strictEqual(m101.display.emptyPrimaryLine, "TBD vs Germany");
}

// Mixed QF feeders: one wrong-path pick, one still alive — SF blocked with team names
{
  const mixedTeams: Team[] = [
    ...teams,
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
    {
      id: "team-esp",
      name: "Spain",
      countryCode: "ESP",
      fifaCode: "ESP",
      fifaRank: 7,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "team-nor",
      name: "Norway",
      countryCode: "NOR",
      fifaCode: "NOR",
      fifaRank: 45,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "team-sui",
      name: "Switzerland",
      countryCode: "SUI",
      fifaCode: "SUI",
      fifaRank: 18,
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
  const slots: KnockoutPickSlotDraft[] = [
    ...Array.from({ length: 16 }, (_, i) => r16Slot(String(i + 1), "team-ger")),
    {
      ...sfSlot("1", "team-fra"),
      pickStatus: "out" as const,
      invalidReason: "not_in_official_matchup" as const,
    },
    sfSlot("2", "team-esp"),
    {
      ...sfSlot("3", "team-eng"),
      pickStatus: "out" as const,
      invalidReason: "not_in_official_matchup" as const,
    },
    sfSlot("4", "team-arg"),
  ];
  const sfInput = {
    bracketKind: "semifinalist" as const,
    slots,
    teams: mixedTeams,
    knockoutBracketPicksUnlocked: true,
  };
  const m101 = buildKnockoutMatchPickRows(sfInput).find((r) => r.fifaMatchNo === 101)!;
  assert.strictEqual(m101.lockReason, "pickable");
  assert.strictEqual(m101.homeTeamId, null);
  assert.strictEqual(m101.awayTeamId, "team-esp");
  assert.strictEqual(m101.display.emptyPrimaryLine, "TBD vs Spain");

  const m102 = buildKnockoutMatchPickRows(sfInput).find((r) => r.fifaMatchNo === 102)!;
  assert.strictEqual(m102.lockReason, "pickable");
  assert.strictEqual(m102.homeTeamId, null);
  assert.strictEqual(m102.awayTeamId, "team-arg");
  assert.strictEqual(m102.display.emptyPrimaryLine, "TBD vs Argentina");
  assert.doesNotMatch(m102.display.emptyPrimaryLine!, /\bM99\b/i);
  assert.doesNotMatch(m102.display.emptyPrimaryLine!, /England has been eliminated/i);
  assert.doesNotMatch(m102.display.emptyPrimaryLine!, /Spain is still alive/i);

  const sfStatus = getKnockoutStepCompletionFromDraftState(
    "semifinalist",
    resolveKnockoutProgressContext({
      slots,
      teams: mixedTeams,
      officialRoundOf32Complete: true,
    }),
  );
  assert.strictEqual(sfStatus.complete, false);
  assert.strictEqual(sfStatus.kind, "needs_pick");
  assert.ok(sfStatus.missingPickable > 0);

  const sfGate = blockedKnockoutStepGateCopy("semifinalist", sfInput);
  assert.match(sfGate!, /semi-finals picks remain|Complete M10/i);
  assert.doesNotMatch(sfGate!, /paths are blocked/i);
}

// SF step pill stays incomplete when rows are blocked upstream
{
  const slots: KnockoutPickSlotDraft[] = [
    ...Array.from({ length: 16 }, (_, i) => r16Slot(String(i + 1), "team-rsa")),
    sfSlot("1", "team-fra"),
    sfSlot("4", "team-arg"),
  ];
  const ctx = resolveKnockoutProgressContext({
    slots,
    teams,
    officialRoundOf32Complete: true,
  });
  const sfStatus = getKnockoutStepCompletionFromDraftState("semifinalist", ctx);
  assert.strictEqual(sfStatus.complete, false);
  assert.strictEqual(sfStatus.kind, "locked_upstream");
  const gate = blockedKnockoutStepGateCopy("semifinalist", {
    bracketKind: "semifinalist",
    slots,
    teams,
    knockoutBracketPicksUnlocked: true,
  });
  assert.ok(gate);
  assert.doesNotMatch(gate!, /M91|M94/i);
}

// France (QF97) and Spain (QF98) share M101 — cannot meet in the Final.
{
  assert.strictEqual(semifinalMatchIndexForR16Slot("1"), 0);
  assert.strictEqual(semifinalMatchIndexForR16Slot("6"), 0);
  assert.strictEqual(canMeetInFinalByQfPath(0, 1), false);

  const slots: KnockoutPickSlotDraft[] = [
    r16Slot("2", "team-ger"),
    r16Slot("5", "team-fra"),
    r16Slot("9", "team-esp"),
    r16Slot("10", "team-eng"),
    qfSlot("1", "team-fra"),
    qfSlot("6", "team-esp"),
    sfSlot("1", "team-fra"),
    sfSlot("2", "team-esp"),
    sfSlot("3", "team-bra"),
    sfSlot("4", "team-ned"),
    finSlot("1", "team-fra"),
    finSlot("2", "team-esp"),
  ];
  const sfRows = buildKnockoutMatchPickRows({
    bracketKind: "semifinalist",
    slots,
    teams: [
      ...teams,
      {
        id: "team-esp",
        name: "Spain",
        countryCode: "ESP",
        fifaCode: "ESP",
        fifaRank: 8,
        fifaRankAsOf: null,
        createdAt: "",
        updatedAt: "",
      },
    ],
    gradual: emptyGradual,
  });
  const m101 = sfRows.find((r) => r.fifaMatchNo === 101)!;
  assert.strictEqual(m101.homeTeamId, "team-fra");
  assert.strictEqual(m101.awayTeamId, "team-esp");

  const { slots: pruned, cleared } = pruneOfficialKnockoutPathPicks(slots);
  assert.ok(
    cleared.some(
      (c) =>
        c.predictionKind === "finalist" &&
        c.slotKey === "2" &&
        c.teamId === "team-esp",
    ),
    "Spain on finalist slot 2 must be cleared — both teams share M101",
  );
  assert.strictEqual(
    pruned.find((s) => s.predictionKind === "finalist" && s.slotKey === "2")
      ?.teamId,
    "",
  );

  const finalRows = buildKnockoutMatchPickRows({
    bracketKind: "finalist",
    slots: pruned,
    teams,
    gradual: emptyGradual,
  });
  assert.notStrictEqual(
    finalRows[0]!.display.emptyPrimaryLine,
    "France vs Spain",
    "Final row must not pair France and Spain",
  );
}

// QF locked/frozen with pickStatus out still valid when saved team is in the matchup (M97/M99 regression).
{
  const frozenQfRow = {
    matchIndex: 0,
    fifaMatchNo: 97,
    rowKey: "quarterfinalist|match|1",
    saveRowKey: "semifinalist|1",
    savePredictionKind: "semifinalist" as const,
    saveSlotKey: "1",
    homeTeamId: "team-fra",
    awayTeamId: "team-mar",
    winnerTeamId: "team-fra",
    pickStatus: "out" as const,
    officialWinnerTeamId: null,
    lockReason: "frozen" as const,
    kickoffIso: "2026-07-11T18:00:00Z",
    display: {
      heading: "M97 · Quarter-finals",
      emptyPrimaryLine: "France vs Morocco",
      kickoffIso: "2026-07-11T18:00:00Z",
      statusLine: "Locked — feeder results are official.",
      chooseButtonLabel: "Pick winner",
    },
  };
  const frozenM99Row = {
    ...frozenQfRow,
    matchIndex: 2,
    fifaMatchNo: 99,
    rowKey: "quarterfinalist|match|3",
    saveRowKey: "semifinalist|3",
    saveSlotKey: "3",
    homeTeamId: "team-nor",
    awayTeamId: "team-eng",
    winnerTeamId: "team-eng",
    display: {
      ...frozenQfRow.display,
      heading: "M99 · Quarter-finals",
      emptyPrimaryLine: "Norway vs England",
    },
  };

  const rowTeams: Team[] = [
    ...teams,
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
    {
      id: "team-nor",
      name: "Norway",
      countryCode: "NOR",
      fifaCode: "NOR",
      fifaRank: 45,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
  ];

  const m97Presentation = knockoutMatchSavedPickPresentation(frozenQfRow, rowTeams);
  assert.strictEqual(m97Presentation.savedPickStatus, "valid");
  assert.strictEqual(m97Presentation.savedPickSummaryLine, "Saved pick: France");
  assert.strictEqual(m97Presentation.savedPickWarning, null);
  assert.strictEqual(
    m97Presentation.lockStatusLine,
    "Locked — feeder results are official.",
  );
  assert.ok(savedPickMatchesRowMatchup(frozenQfRow));
  assert.ok(!savedPickIsStaleForKnockoutRow(frozenQfRow));
  assert.strictEqual(validatedKnockoutMatchWinner(frozenQfRow), "team-fra");

  const m99Presentation = knockoutMatchSavedPickPresentation(frozenM99Row, rowTeams);
  assert.strictEqual(m99Presentation.savedPickStatus, "valid");
  assert.strictEqual(m99Presentation.savedPickSummaryLine, "Saved pick: England");
  assert.strictEqual(m99Presentation.savedPickWarning, null);
}

// Built QF rows: locked frozen pick with pickStatus out stays valid in the displayed matchup.
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
    sfSlot("1", "team-ger", "out"),
    sfSlot("2", "team-fra"),
    sfSlot("3", "team-bra"),
    sfSlot("4", "team-ned"),
  ];
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
      kickoff_at: "2026-07-09T18:00:00Z",
      status: "finished",
      home_goals: 2,
      away_goals: 1,
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
      match_id: "m90",
      edition_id: "ed",
      edition_code: "2026",
      match_code: "M90",
      stage_code: "round_of_16",
      stage_label: "Round of 16",
      stage_sort_order: 3,
      group_code: null,
      round_index: 0,
      kickoff_at: "2026-07-09T20:00:00Z",
      status: "finished",
      home_goals: 1,
      away_goals: 0,
      home_penalties: null,
      away_penalties: null,
      home_team_name: "Canada",
      home_country_code: "CAN",
      away_team_name: "Netherlands",
      away_country_code: "NED",
      winner_team_name: "Canada",
      winner_country_code: "CAN",
    },
    {
      match_id: "m97",
      edition_id: "ed",
      edition_code: "2026",
      match_code: "M97",
      stage_code: "quarterfinal",
      stage_label: "Quarter-finals",
      stage_sort_order: 4,
      group_code: null,
      round_index: 0,
      kickoff_at: "2026-07-11T18:00:00Z",
      status: "scheduled",
      home_goals: null,
      away_goals: null,
      home_penalties: null,
      away_penalties: null,
      home_team_name: "Germany",
      home_country_code: "GER",
      away_team_name: "Canada",
      away_country_code: "CAN",
      winner_team_name: null,
      winner_country_code: null,
    },
  ];
  const qfInput = {
    bracketKind: "quarterfinalist" as const,
    slots,
    teams,
    tournamentMatches,
    knockoutBracketPicksUnlocked: true,
  };
  const m97 = buildKnockoutMatchPickRows(qfInput).find((r) => r.fifaMatchNo === 97)!;
  assert.strictEqual(m97.homeTeamId, "team-ger");
  assert.strictEqual(m97.awayTeamId, "team-can");
  assert.strictEqual(m97.lockReason, "frozen");
  assert.strictEqual(m97.winnerTeamId, "team-ger");
  assert.strictEqual(m97.pickStatus, "out");

  const presentation = knockoutMatchSavedPickPresentation(m97, teams);
  assert.strictEqual(presentation.savedPickStatus, "valid");
  assert.strictEqual(presentation.savedPickWarning, null);
  assert.strictEqual(validatedKnockoutMatchWinner(m97), "team-ger");

  const sfInput = { ...qfInput, bracketKind: "semifinalist" as const };
  const m101 = buildKnockoutMatchPickRows(sfInput).find((r) => r.fifaMatchNo === 101)!;
  assert.strictEqual(m101.homeTeamId, "team-ger");
  assert.strictEqual(m101.awayTeamId, "team-fra");
  assert.strictEqual(m101.lockReason, "pickable");
  assert.doesNotMatch(
    blockedKnockoutRowUserCopy(m101, "semifinalist", sfInput),
    /no longer on the path|no longer feeds this matchup/i,
  );
}

// Wrong-path QF saved pick not in displayed matchup still shows stale on the QF row.
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
    sfSlot("1", "team-bra", "out"),
    sfSlot("2", "team-fra"),
    sfSlot("3", "team-bra"),
    sfSlot("4", "team-arg"),
  ];
  const qfRows = buildKnockoutMatchPickRows({
    bracketKind: "quarterfinalist",
    slots,
    teams,
    knockoutBracketPicksUnlocked: true,
  });
  const m97 = qfRows.find((r) => r.fifaMatchNo === 97)!;
  assert.strictEqual(m97.homeTeamId, "team-ger");
  assert.strictEqual(m97.awayTeamId, "team-can");
  const presentation = knockoutMatchSavedPickPresentation(m97, teams);
  assert.strictEqual(presentation.savedPickStatus, "stale");
  assert.ok(presentation.savedPickWarning);
  assert.match(
    presentation.savedPickWarning!,
    /no longer matches this matchup/i,
  );
}

// Finished QF loser pick shows stale/eliminated warning.
{
  const finishedLoserRow = {
    matchIndex: 0,
    fifaMatchNo: 97,
    rowKey: "quarterfinalist|match|1",
    saveRowKey: "semifinalist|1",
    savePredictionKind: "semifinalist" as const,
    saveSlotKey: "1",
    homeTeamId: "team-fra",
    awayTeamId: "team-mar",
    winnerTeamId: "team-fra",
    pickStatus: null,
    officialWinnerTeamId: "team-mar",
    lockReason: "started" as const,
    kickoffIso: "2026-07-11T18:00:00Z",
    display: {
      heading: "M97 · Quarter-finals",
      emptyPrimaryLine: "France vs Morocco",
      kickoffIso: "2026-07-11T18:00:00Z",
      statusLine: "Locked at kickoff",
      chooseButtonLabel: "Pick winner",
    },
  };
  assert.ok(savedPickIsStaleForKnockoutRow(finishedLoserRow));
  const presentation = knockoutMatchSavedPickPresentation(finishedLoserRow, teams);
  assert.strictEqual(presentation.savedPickStatus, "stale");
  assert.match(
    presentation.savedPickWarning!,
    /no longer matches this matchup/i,
  );
  assert.strictEqual(validatedKnockoutMatchWinner(finishedLoserRow), null);
}

// Future official QF rows stay pickable until kickoff (M99 Norway vs England regression).
{
  const norEngTeams: Team[] = [
    ...teams,
    {
      id: "team-nor",
      name: "Norway",
      countryCode: "NOR",
      fifaCode: "NOR",
      fifaRank: 45,
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
    {
      id: "team-jpn",
      name: "Japan",
      countryCode: "JPN",
      fifaCode: "JPN",
      fifaRank: 17,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "team-esp",
      name: "Spain",
      countryCode: "ESP",
      fifaCode: "ESP",
      fifaRank: 7,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
  ];
  const qfNowMs = new Date("2026-07-06T12:00:00Z").getTime();
  const tournamentMatches: TournamentMatchPublicRow[] = [
    {
      match_id: "m91",
      edition_id: "ed",
      edition_code: "2026",
      match_code: "M91",
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
      home_team_name: "Norway",
      home_country_code: "NOR",
      away_team_name: "Colombia",
      away_country_code: "COL",
      winner_team_name: "Norway",
      winner_country_code: "NOR",
    },
    {
      match_id: "m92",
      edition_id: "ed",
      edition_code: "2026",
      match_code: "M92",
      stage_code: "round_of_16",
      stage_label: "Round of 16",
      stage_sort_order: 3,
      group_code: null,
      round_index: 0,
      kickoff_at: "2026-07-05T20:00:00Z",
      status: "finished",
      home_goals: 1,
      away_goals: 0,
      home_penalties: null,
      away_penalties: null,
      home_team_name: "Spain",
      home_country_code: "ESP",
      away_team_name: "England",
      away_country_code: "ENG",
      winner_team_name: "England",
      winner_country_code: "ENG",
    },
    {
      match_id: "m95",
      edition_id: "ed",
      edition_code: "2026",
      match_code: "M95",
      stage_code: "round_of_16",
      stage_label: "Round of 16",
      stage_sort_order: 3,
      group_code: null,
      round_index: 0,
      kickoff_at: "2026-07-05T22:00:00Z",
      status: "finished",
      home_goals: 2,
      away_goals: 1,
      home_penalties: null,
      away_penalties: null,
      home_team_name: "Argentina",
      home_country_code: "ARG",
      away_team_name: "Brazil",
      away_country_code: "BRA",
      winner_team_name: "Argentina",
      winner_country_code: "ARG",
    },
    {
      match_id: "m96",
      edition_id: "ed",
      edition_code: "2026",
      match_code: "M96",
      stage_code: "round_of_16",
      stage_label: "Round of 16",
      stage_sort_order: 3,
      group_code: null,
      round_index: 0,
      kickoff_at: "2026-07-05T23:00:00Z",
      status: "finished",
      home_goals: 1,
      away_goals: 0,
      home_penalties: null,
      away_penalties: null,
      home_team_name: "France",
      home_country_code: "FRA",
      away_team_name: "Morocco",
      away_country_code: "MAR",
      winner_team_name: "France",
      winner_country_code: "FRA",
    },
    {
      match_id: "m99",
      edition_id: "ed",
      edition_code: "2026",
      match_code: "M99",
      stage_code: "quarterfinal",
      stage_label: "Quarter-finals",
      stage_sort_order: 4,
      group_code: null,
      round_index: 0,
      kickoff_at: "2026-07-11T18:00:00Z",
      status: "scheduled",
      home_goals: null,
      away_goals: null,
      home_penalties: null,
      away_penalties: null,
      home_team_name: "Norway",
      home_country_code: "NOR",
      away_team_name: "England",
      away_country_code: "ENG",
      winner_team_name: null,
      winner_country_code: null,
    },
    {
      match_id: "m100",
      edition_id: "ed",
      edition_code: "2026",
      match_code: "M100",
      stage_code: "quarterfinal",
      stage_label: "Quarter-finals",
      stage_sort_order: 4,
      group_code: null,
      round_index: 0,
      kickoff_at: "2026-07-11T20:00:00Z",
      status: "scheduled",
      home_goals: null,
      away_goals: null,
      home_penalties: null,
      away_penalties: null,
      home_team_name: "Argentina",
      home_country_code: "ARG",
      away_team_name: "France",
      away_country_code: "FRA",
      winner_team_name: null,
      winner_country_code: null,
    },
  ];
  const allTeams = norEngTeams;
  const baseR16 = Array.from({ length: 16 }, (_, i) =>
    r16Slot(String(i + 1), ""),
  );
  const missingPickSlots: KnockoutPickSlotDraft[] = [
    ...baseR16,
    qfSlot("7", "team-arg"),
    qfSlot("8", "team-fra"),
    sfSlot("1", "team-ger"),
    sfSlot("2", "team-fra"),
    finSlot("1", "team-ger"),
    champSlot("team-ger"),
  ];
  const qfInput = {
    bracketKind: "quarterfinalist" as const,
    slots: missingPickSlots,
    teams: allTeams,
    tournamentMatches,
    knockoutBracketPicksUnlocked: true,
    nowMs: qfNowMs,
  };
  const qfRows = buildKnockoutMatchPickRows(qfInput);
  const m99 = qfRows.find((r) => r.fifaMatchNo === 99)!;
  const m100 = qfRows.find((r) => r.fifaMatchNo === 100)!;
  assert.strictEqual(m99.homeTeamId, "team-nor");
  assert.strictEqual(m99.awayTeamId, "team-eng");
  assert.strictEqual(m99.lockReason, "pickable");
  assert.strictEqual(isKnockoutMatchDirectPickEligible(m99), true);
  assert.strictEqual(validatedKnockoutMatchWinner(m99), null);
  const m99Presentation = knockoutMatchSavedPickPresentation(m99, allTeams);
  assert.strictEqual(m99Presentation.savedPickStatus, "missing");
  assert.strictEqual(m99Presentation.lockStatusLine, null);
  assert.ok(
    !m99Presentation.savedPickWarning?.includes(
      "already in progress after official feeder results",
    ),
  );
  assert.strictEqual(m100.lockReason, "pickable");

  const savedNorwaySlots = [
    ...baseR16,
    sfSlot("3", "team-nor"),
    sfSlot("4", "team-eng"),
    finSlot("2", "team-eng"),
  ];
  const savedRows = buildKnockoutMatchPickRows({
    ...qfInput,
    slots: savedNorwaySlots,
  });
  const savedM99 = savedRows.find((r) => r.fifaMatchNo === 99)!;
  assert.strictEqual(savedM99.lockReason, "pickable");
  assert.strictEqual(savedM99.winnerTeamId, "team-nor");
  assert.strictEqual(validatedKnockoutMatchWinner(savedM99), "team-nor");

  const staleJapanSlots = [
    ...baseR16,
    sfSlot("3", "team-jpn"),
    sfSlot("4", "team-eng"),
  ];
  const staleRows = buildKnockoutMatchPickRows({
    ...qfInput,
    slots: staleJapanSlots,
  });
  const staleM99 = staleRows.find((r) => r.fifaMatchNo === 99)!;
  assert.strictEqual(staleM99.lockReason, "pickable");
  assert.strictEqual(savedPickIsStaleForKnockoutRow(staleM99), true);
  assert.strictEqual(isKnockoutMatchDirectPickEligible(staleM99), true);

  const kickedOffMatches = tournamentMatches.map((m) =>
    m.match_code === "M99"
      ? {
          ...m,
          kickoff_at: "2026-07-06T10:00:00Z",
          status: "live" as const,
        }
      : m,
  );
  const startedRows = buildKnockoutMatchPickRows({
    ...qfInput,
    tournamentMatches: kickedOffMatches,
    nowMs: new Date("2026-07-06T12:00:00Z").getTime(),
  });
  const startedM99 = startedRows.find((r) => r.fifaMatchNo === 99)!;
  assert.strictEqual(startedM99.lockReason, "started");
  assert.strictEqual(
    startedM99.display.statusLine,
    "Locked at kickoff",
  );
}

console.log("knockoutMatchPickRows.selftest.ts: ok");
