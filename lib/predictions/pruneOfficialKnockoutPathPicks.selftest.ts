import assert from "node:assert";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import {
  KNOCKOUT_BRACKET_PATH_REVIEW_MESSAGE,
  participantNeedsKnockoutPathReview,
  pruneOfficialKnockoutPathPicks,
} from "./pruneOfficialKnockoutPathPicks";
import { pruneParticipantPicks } from "./knockoutPickConsistency";

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

function r16Winner(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
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

function qf(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
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

function sf(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
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

function fin(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `finalist|${slotKey}`,
    sectionLabel: "Final",
    slotLabel: slotKey,
    predictionKind: "finalist",
    tournamentStageId: "fin",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

function champ(teamId = ""): KnockoutPickSlotDraft {
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

function groupWinner(groupCode: string, teamId: string): KnockoutPickSlotDraft {
  return {
    rowKey: `gw|${groupCode}`,
    sectionLabel: "Group",
    slotLabel: groupCode,
    predictionKind: "group_winner",
    tournamentStageId: "group",
    slotKey: null,
    groupCode,
    bonusKey: null,
    teamId,
  };
}

// R32 winners only — nothing cleared downstream
{
  const slots = [
    r32Side("1", "can"),
    r32Side("2", "mex"),
    r16Winner("1", "can"),
    r16Winner("2", "ger"),
    r16Winner("3", "ned"),
    r16Winner("5", "fra"),
  ];
  const { slots: next, cleared } = pruneOfficialKnockoutPathPicks(slots);
  assert.strictEqual(cleared.length, 0);
  assert.strictEqual(next.find((s) => s.slotKey === "1")?.teamId, "can");
}

// Old invalid QF slot 1: Canada picked when official M89 is GER vs FRA
{
  const slots = [
    r16Winner("1", "can"),
    r16Winner("2", "ger"),
    r16Winner("3", "ned"),
    r16Winner("5", "fra"),
    qf("1", "can"),
    sf("1", "can"),
    fin("1", "can"),
    champ("can"),
  ];
  const { cleared } = pruneOfficialKnockoutPathPicks(slots);
  assert.ok(
    cleared.some((c) => c.predictionKind === "quarterfinalist" && c.teamId === "can"),
  );
  assert.ok(cleared.some((c) => c.predictionKind === "semifinalist"));
  assert.ok(cleared.some((c) => c.predictionKind === "finalist"));
  assert.ok(cleared.some((c) => c.predictionKind === "champion"));
}

// Valid QF under official path preserved
{
  const slots = [
    r16Winner("2", "ger"),
    r16Winner("5", "fra"),
    qf("1", "ger"),
  ];
  const { slots: next, cleared } = pruneOfficialKnockoutPathPicks(slots);
  assert.strictEqual(cleared.length, 0);
  assert.strictEqual(
    next.find((s) => s.predictionKind === "quarterfinalist" && s.slotKey === "1")
      ?.teamId,
    "ger",
  );
}

// Group picks untouched
{
  const slots = [
    groupWinner("A", "can"),
    r16Winner("1", "can"),
    qf("1", "can"),
  ];
  const { slots: next } = pruneOfficialKnockoutPathPicks(slots);
  assert.strictEqual(
    next.find((s) => s.predictionKind === "group_winner")?.teamId,
    "can",
  );
}

// pruneParticipantPicks chains official path validation
{
  const slots = [
    r16Winner("1", "can"),
    r16Winner("2", "ger"),
    r16Winner("5", "fra"),
    qf("1", "can"),
  ];
  const next = pruneParticipantPicks(slots);
  assert.strictEqual(
    next.find((s) => s.predictionKind === "quarterfinalist" && s.slotKey === "1")
      ?.teamId,
    "",
  );
}

// Save/refresh: pruned slots remain stable on second pass
{
  const slots = [
    r16Winner("2", "ger"),
    r16Winner("5", "fra"),
    qf("1", "ger"),
  ];
  const once = pruneParticipantPicks(slots);
  const twice = pruneParticipantPicks(once);
  assert.deepStrictEqual(
    once.filter((s) => s.predictionKind === "quarterfinalist").map((s) => s.teamId),
    twice.filter((s) => s.predictionKind === "quarterfinalist").map((s) => s.teamId),
  );
}

// Valid semi-final match winner in finalist slot preserved
{
  const slots = [
    r16Winner("2", "ger"),
    r16Winner("5", "fra"),
    r16Winner("4", "bra"),
    r16Winner("3", "ned"),
    r16Winner("1", "can"),
    r16Winner("6", "rsa"),
    r16Winner("7", "ned"),
    r16Winner("8", "bra"),
    r16Winner("9", "ned"),
    r16Winner("10", "ger"),
    r16Winner("11", "fra"),
    r16Winner("12", "ger"),
    r16Winner("13", "can"),
    r16Winner("14", "ned"),
    r16Winner("15", "bra"),
    r16Winner("16", "rsa"),
    qf("1", "ger"),
    qf("2", "can"),
    qf("3", "bra"),
    qf("4", "ned"),
    qf("5", "fra"),
    qf("6", "ger"),
    qf("7", "ned"),
    qf("8", "can"),
    sf("1", "ger"),
    sf("2", "fra"),
    sf("3", "bra"),
    sf("4", "ned"),
    fin("1", "ger"),
    fin("2"),
  ];
  const { slots: next, cleared } = pruneOfficialKnockoutPathPicks(slots);
  assert.strictEqual(cleared.length, 0);
  assert.strictEqual(
    next.find((s) => s.predictionKind === "finalist" && s.slotKey === "1")
      ?.teamId,
    "ger",
  );
}

assert.ok(KNOCKOUT_BRACKET_PATH_REVIEW_MESSAGE.includes("FIFA"));
assert.strictEqual(
  participantNeedsKnockoutPathReview([
    {
      predictionKind: "quarterfinalist",
      slotKey: "1",
      rowKey: "x",
      teamId: "can",
      reason: "not_in_official_matchup",
    },
  ]),
  true,
);

// Locked invalid picks marked out must survive a later official-path re-prune.
{
  const lockedOut = {
    ...qf("2", "ned"),
    pickStatus: "out" as const,
    invalidReason: "not_in_official_matchup" as const,
  };
  const { slots: repruned, cleared } = pruneOfficialKnockoutPathPicks([lockedOut]);
  assert.strictEqual(cleared.length, 0);
  assert.strictEqual(repruned[0]?.teamId, "ned");
  assert.strictEqual(repruned[0]?.pickStatus, "out");
}

console.log("pruneOfficialKnockoutPathPicks.selftest.ts: ok");
