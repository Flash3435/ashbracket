/**
 * Self-test: `npx tsx lib/bracket/officialKnockoutPreviewPairs.selftest.ts`
 */
import assert from "node:assert";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import { deriveParticipantBracket } from "./deriveParticipantBracket";
import {
  buildOfficialKnockoutMatchRows,
  knockoutMatchRowsToPreviewPairs,
  officialKnockoutPreviewPairs,
} from "./officialKnockoutPreviewPairs";
import { buildKnockoutMatchPickRows, applyKnockoutMatchWinnerToSlots } from "../picks/knockoutMatchPickRows";
import { pruneParticipantPicks } from "../predictions/knockoutPickConsistency";
import type { GradualKnockoutSelectionState } from "../picks/gradualKnockoutUnlock";

const teams: Team[] = [
  {
    id: "team-can",
    name: "Canada",
    countryCode: "CAN",
    fifaCode: "CAN",
    fifaRank: 28,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-ger",
    name: "Germany",
    countryCode: "GER",
    fifaCode: "GER",
    fifaRank: 10,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-ned",
    name: "Netherlands",
    countryCode: "NED",
    fifaCode: "NED",
    fifaRank: 7,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-fra",
    name: "France",
    countryCode: "FRA",
    fifaCode: "FRA",
    fifaRank: 5,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-bra",
    name: "Brazil",
    countryCode: "BRA",
    fifaCode: "BRA",
    fifaRank: 6,
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
    sectionLabel: "R16",
    slotLabel: slotKey,
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
    sectionLabel: "QF",
    slotLabel: slotKey,
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
    sectionLabel: "SF",
    slotLabel: slotKey,
    predictionKind: "semifinalist",
    tournamentStageId: "sf",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

function officialUpstreamSlots(): KnockoutPickSlotDraft[] {
  return [
    r16Slot("1", "team-can"), // M73
    r16Slot("2", "team-ger"), // M74
    r16Slot("3", "team-ned"), // M75
    r16Slot("4", "team-bra"), // M76
    r16Slot("5", "team-fra"), // M77
    r16Slot("6", "team-ned"), // M78
    r16Slot("7", "team-fra"), // M79
    r16Slot("8", "team-can"), // M80
    ...Array.from({ length: 8 }, (_, i) => r16Slot(String(i + 9))),
    qfSlot("1", "team-ger"), // M89
    qfSlot("2", "team-can"), // M90
    qfSlot("3", "team-bra"), // M91
    qfSlot("4", "team-fra"), // M92
    qfSlot("5", "team-fra"),
    qfSlot("6", "team-ger"),
    qfSlot("7", "team-ned"),
    qfSlot("8", "team-can"),
    sfSlot("1", "team-ger"), // M97
    sfSlot("2", "team-fra"),
    sfSlot("3", "team-bra"), // M99
    sfSlot("4", "team-ned"),
  ];
}

const previewInput = {
  slots: officialUpstreamSlots(),
  teams,
  knockoutBracketPicksUnlocked: true,
};

// Canada + Netherlands meet in M90, not M89.
{
  const r16 = buildOfficialKnockoutMatchRows("round_of_16", previewInput);
  const m89 = r16.find((r) => r.fifaMatchNo === 89)!;
  const m90 = r16.find((r) => r.fifaMatchNo === 90)!;
  assert.strictEqual(m89.homeTeamId, "team-ger");
  assert.strictEqual(m89.awayTeamId, "team-fra");
  assert.strictEqual(m90.homeTeamId, "team-can");
  assert.strictEqual(m90.awayTeamId, "team-ned");
  const previewM89 = knockoutMatchRowsToPreviewPairs(r16)[0]!;
  assert.strictEqual(previewM89.top?.teamId, "team-ger");
  assert.strictEqual(previewM89.bottom?.teamId, "team-fra");
}

// M97 uses winners of M89 and M90.
{
  const qf = buildOfficialKnockoutMatchRows("quarterfinalist", previewInput);
  const m97 = qf.find((r) => r.fifaMatchNo === 97)!;
  assert.strictEqual(m97.homeTeamId, "team-ger");
  assert.strictEqual(m97.awayTeamId, "team-can");
}

// M101 uses winners of M97 and M99.
{
  const sf = buildOfficialKnockoutMatchRows("semifinalist", previewInput);
  const m101 = sf.find((r) => r.fifaMatchNo === 101)!;
  assert.strictEqual(m101.homeTeamId, "team-ger");
  assert.strictEqual(m101.awayTeamId, "team-bra");
}

// Bracket preview pairs match knockoutMatchPickRows for the same picks.
{
  for (const kind of [
    "round_of_16",
    "quarterfinalist",
    "semifinalist",
    "finalist",
  ] as const) {
    const rows = buildKnockoutMatchPickRows({
      bracketKind: kind,
      slots: previewInput.slots,
      teams,
      gradual: emptyGradual,
    });
    const preview = officialKnockoutPreviewPairs(kind, previewInput);
    assert.strictEqual(preview.length, rows.length);
    for (let i = 0; i < rows.length; i += 1) {
      assert.strictEqual(preview[i]!.top?.teamId ?? null, rows[i]!.homeTeamId);
      assert.strictEqual(
        preview[i]!.bottom?.teamId ?? null,
        rows[i]!.awayTeamId,
      );
    }
  }
}

// deriveParticipantBracket uses the same official paths when unlocked.
{
  const bracket = deriveParticipantBracket({
    slots: previewInput.slots,
    teams,
    knockoutBracketPicksUnlocked: true,
  });
  assert.strictEqual(bracket.roundOf16[0]?.fifaMatchNo, 89);
  assert.strictEqual(bracket.roundOf16[0]?.home.teamId, "team-ger");
  assert.strictEqual(bracket.roundOf16[0]?.away.teamId, "team-fra");
  assert.strictEqual(bracket.roundOf16[1]?.home.teamId, "team-can");
  assert.strictEqual(bracket.roundOf16[1]?.away.teamId, "team-ned");
  assert.strictEqual(bracket.quarterfinals[0]?.home.teamId, "team-ger");
  assert.strictEqual(bracket.quarterfinals[0]?.away.teamId, "team-can");
  assert.strictEqual(bracket.semifinals[0]?.home.teamId, "team-ger");
  assert.strictEqual(bracket.semifinals[0]?.away.teamId, "team-bra");
}

// Picking an R16 winner must not change official preview sides.
{
  const slots = officialUpstreamSlots();
  const r16 = buildOfficialKnockoutMatchRows("round_of_16", previewInput);
  const m89 = r16.find((r) => r.fifaMatchNo === 89)!;
  const after = pruneParticipantPicks(
    applyKnockoutMatchWinnerToSlots(slots, m89, "team-fra"),
  );
  const afterInput = { ...previewInput, slots: after };
  const afterR16 = buildOfficialKnockoutMatchRows("round_of_16", afterInput);
  const m89After = afterR16.find((r) => r.fifaMatchNo === 89)!;
  assert.strictEqual(m89After.homeTeamId, "team-ger");
  assert.strictEqual(m89After.awayTeamId, "team-fra");
}

console.log("officialKnockoutPreviewPairs.selftest.ts: ok");
