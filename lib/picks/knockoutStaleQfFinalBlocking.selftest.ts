import assert from "node:assert/strict";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import {
  buildKnockoutMatchPickRows,
  isKnockoutMatchDirectPickEligible,
  knockoutMatchRowNeedsRepair,
  knockoutMatchSavedPickPresentation,
  savedPickIsStaleForKnockoutRow,
  validatedKnockoutMatchWinner,
} from "./knockoutMatchPickRows";
import {
  blockedKnockoutRowUserCopy,
  blockedKnockoutStepGateCopy,
} from "./knockoutBlockedRowExplanation";
import {
  getKnockoutStepCompletionFromDraftState,
  knockoutStepPillPresentation,
  resolveKnockoutProgressContext,
} from "./knockoutMatchProgress";

const teams: Team[] = [
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
    id: "team-ger",
    name: "Germany",
    countryCode: "GER",
    fifaCode: "GER",
    fifaRank: 5,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
];

function r16Slot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `round_of_16|${slotKey}`,
    sectionLabel: "Round of 16",
    slotLabel: slotKey,
    predictionKind: "round_of_16",
    tournamentStageId: "r16",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

function sfSlot(
  slotKey: string,
  teamId = "",
  extra: Partial<KnockoutPickSlotDraft> = {},
): KnockoutPickSlotDraft {
  return {
    rowKey: `semifinalist|${slotKey}`,
    sectionLabel: "Semi-finals",
    slotLabel: slotKey,
    predictionKind: "semifinalist",
    tournamentStageId: "sf",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
    ...extra,
  };
}

function finSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `finalist|${slotKey}`,
    sectionLabel: "The final",
    slotLabel: slotKey,
    predictionKind: "finalist",
    tournamentStageId: "fin",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

/** Production-style slots: Japan stale on M99 path, Argentina valid on M100, France/Argentina finalists. */
function productionStaleJapanSlots(includeFin2 = false): KnockoutPickSlotDraft[] {
  return [
    ...Array.from({ length: 16 }, (_, i) => r16Slot(String(i + 1), "team-ger")),
    r16Slot("3", "team-nor"),
    r16Slot("4", "team-eng"),
    sfSlot("1", "team-fra"),
    sfSlot("2", "team-esp"),
    sfSlot("3", "team-jpn", {
      pickStatus: "out",
      invalidReason: "not_in_official_matchup",
    }),
    sfSlot("4", "team-arg"),
    finSlot("1", "team-fra"),
    ...(includeFin2 ? [finSlot("2", "team-arg")] : []),
  ];
}

function buildInputs(slots: KnockoutPickSlotDraft[]) {
  const sfInput = {
    bracketKind: "semifinalist" as const,
    slots,
    teams,
    knockoutBracketPicksUnlocked: true,
  };
  const qfInput = {
    bracketKind: "quarterfinalist" as const,
    slots,
    teams,
    knockoutBracketPicksUnlocked: true,
  };
  const finalInput = { ...sfInput, bracketKind: "finalist" as const };
  return { sfInput, qfInput, finalInput };
}

// Valid finalist slots 1/2 → France vs Argentina final; Japan stale on M99; Argentina not stale on M102.
{
  const slots = productionStaleJapanSlots(true);
  const { sfInput, qfInput, finalInput } = buildInputs(slots);
  const m99 = buildKnockoutMatchPickRows(qfInput).find((r) => r.fifaMatchNo === 99)!;
  assert.ok(
    savedPickIsStaleForKnockoutRow({
      winnerTeamId: "team-jpn",
      homeTeamId: m99.homeTeamId,
      awayTeamId: m99.awayTeamId,
      officialWinnerTeamId: null,
    }),
    "Japan saved QF pick must be stale vs M99 sides",
  );

  const m102 = buildKnockoutMatchPickRows(sfInput).find((r) => r.fifaMatchNo === 102)!;
  assert.strictEqual(m102.lockReason, "pickable");
  assert.strictEqual(m102.homeTeamId, null);
  assert.strictEqual(m102.awayTeamId, "team-arg");
  assert.strictEqual(m102.display.emptyPrimaryLine, "TBD vs Argentina");
  assert.strictEqual(validatedKnockoutMatchWinner(m102), "team-arg");
  assert.ok(!savedPickIsStaleForKnockoutRow(m102), "Argentina must not be stale on partial M102");

  const finalRow = buildKnockoutMatchPickRows(finalInput)[0]!;
  assert.strictEqual(finalRow.lockReason, "pickable");
  assert.strictEqual(finalRow.homeTeamId, "team-fra");
  assert.strictEqual(finalRow.awayTeamId, "team-arg");
  assert.strictEqual(finalRow.display.emptyPrimaryLine, "France vs Argentina");
  assert.ok(isKnockoutMatchDirectPickEligible(finalRow));

  const ctx = resolveKnockoutProgressContext({
    slots,
    teams,
    officialRoundOf32Complete: true,
  });
  assert.strictEqual(
    getKnockoutStepCompletionFromDraftState("semifinalist", ctx).complete,
    true,
  );
  const gate = blockedKnockoutStepGateCopy("finalist", finalInput);
  assert.match(gate!, /Pick a winner for France vs Argentina/i);
  assert.doesNotMatch(gate!, /Review your/i);
}

// Missing finalist slot 2 → partial M102 repairable; SF incomplete; final blocked with concise copy.
{
  const slots = productionStaleJapanSlots(false);
  const { sfInput, finalInput } = buildInputs(slots);
  const m102 = buildKnockoutMatchPickRows(sfInput).find((r) => r.fifaMatchNo === 102)!;
  assert.strictEqual(m102.lockReason, "pickable");
  assert.strictEqual(m102.display.emptyPrimaryLine, "TBD vs Argentina");
  assert.ok(knockoutMatchRowNeedsRepair(m102));
  assert.ok(isKnockoutMatchDirectPickEligible(m102));

  const ctx = resolveKnockoutProgressContext({
    slots,
    teams,
    officialRoundOf32Complete: true,
  });
  const sfStatus = getKnockoutStepCompletionFromDraftState("semifinalist", ctx);
  assert.strictEqual(sfStatus.complete, false);
  assert.strictEqual(sfStatus.kind, "needs_pick");
  assert.ok(sfStatus.missingPickable > 0);

  const sfPill = knockoutStepPillPresentation({ status: sfStatus, active: false });
  assert.notStrictEqual(sfPill.visualKind, "complete");
  assert.notStrictEqual(sfPill.suffix, "complete");

  const finalRow = buildKnockoutMatchPickRows(finalInput)[0]!;
  assert.strictEqual(finalRow.lockReason, "incomplete");
  const copy = blockedKnockoutRowUserCopy(finalRow, "finalist", finalInput);
  assert.match(copy, /waiting for your semi-final pick/i);
  assert.doesNotMatch(copy, /Review your/i);
  assert.doesNotMatch(copy, /Japan is still alive/i);
  assert.doesNotMatch(copy, /Argentina is still in the tournament.*France is still in/i);

  const adminCopy = blockedKnockoutRowUserCopy(finalRow, "finalist", finalInput, {
    adminMode: true,
  });
  assert.match(adminCopy, /Use Admin correction to repair the missing finalist/i);
  assert.doesNotMatch(adminCopy, /Review your/i);
}

// Participant copy names eliminated/wrong-path QF pick when final blocked upstream.
{
  const slots = productionStaleJapanSlots(false);
  const { finalInput } = buildInputs(slots);
  const finalRow = buildKnockoutMatchPickRows(finalInput)[0]!;
  const copy = blockedKnockoutRowUserCopy(finalRow, "finalist", finalInput);
  const reviewCount = (copy.match(/Review your/gi) ?? []).length;
  assert.strictEqual(reviewCount, 0);
  const japanAliveCount = (copy.match(/Japan is still alive/gi) ?? []).length;
  assert.strictEqual(japanAliveCount, 0);
}

// Saved pick presentation on partial M102: Argentina valid, not shown as out.
{
  const slots = productionStaleJapanSlots(false);
  const { sfInput } = buildInputs(slots);
  const m102 = buildKnockoutMatchPickRows(sfInput).find((r) => r.fifaMatchNo === 102)!;
  const presentation = knockoutMatchSavedPickPresentation(m102, teams);
  assert.notStrictEqual(presentation.savedPickStatus, "stale");
  assert.notStrictEqual(presentation.savedPickWarning, "Pick out");
}

console.log("knockoutStaleQfFinalBlocking.selftest.ts: ok");
