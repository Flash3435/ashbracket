/**
 * Self-test: `npx tsx lib/bracket/wc2026KnockoutTopology.selftest.ts`
 */
import assert from "node:assert";
import {
  canMeetInFinalByQfPath,
  knockoutParticipantSlotPair,
  qfMatchIndexForQuarterfinalistSlot,
  semifinalMatchIndexForQfMatchIndex,
  semifinalMatchIndexForR16Slot,
  WC2026_SF_PARTICIPANT_SLOT_PAIRS,
} from "./wc2026KnockoutPairings";

// Official SF feeders: M101 = M97 + M98, M102 = M99 + M100.
{
  assert.deepStrictEqual(WC2026_SF_PARTICIPANT_SLOT_PAIRS[0], ["1", "2"]);
  assert.deepStrictEqual(WC2026_SF_PARTICIPANT_SLOT_PAIRS[1], ["3", "4"]);
  assert.deepStrictEqual(knockoutParticipantSlotPair("semifinal", 0), ["1", "2"]);
  assert.deepStrictEqual(knockoutParticipantSlotPair("semifinal", 1), ["3", "4"]);
}

// QF97 and QF98 paths share M101 — they can meet in SF101, not the Final.
{
  const qf97 = qfMatchIndexForQuarterfinalistSlot("1");
  const qf98 = qfMatchIndexForQuarterfinalistSlot("5");
  assert.strictEqual(qf97, 0);
  assert.strictEqual(qf98, 1);
  assert.strictEqual(semifinalMatchIndexForQfMatchIndex(qf97!), 0);
  assert.strictEqual(semifinalMatchIndexForQfMatchIndex(qf98!), 0);
  assert.strictEqual(canMeetInFinalByQfPath(qf97!, qf98!), false);
}

// France (M89/M90 → QF97) and Spain (M93/M94 → QF98) share semifinal branch M101.
{
  // M89 = R16 slot 1, M90 = R16 slot 2 → quarterfinalist slots 1 and 2 → QF97.
  assert.strictEqual(semifinalMatchIndexForR16Slot("1"), 0);
  assert.strictEqual(semifinalMatchIndexForR16Slot("2"), 0);
  // M93 = R16 slot 5, M94 = R16 slot 6 → quarterfinalist slots 5 and 6 → QF98.
  assert.strictEqual(semifinalMatchIndexForR16Slot("5"), 0);
  assert.strictEqual(semifinalMatchIndexForR16Slot("6"), 0);
  assert.strictEqual(canMeetInFinalByQfPath(0, 1), false);
}

// Final candidates must come from opposite semi-final branches only.
{
  assert.strictEqual(semifinalMatchIndexForQfMatchIndex(0), 0); // QF97 → M101
  assert.strictEqual(semifinalMatchIndexForQfMatchIndex(1), 0); // QF98 → M101
  assert.strictEqual(semifinalMatchIndexForQfMatchIndex(2), 1); // QF99 → M102
  assert.strictEqual(semifinalMatchIndexForQfMatchIndex(3), 1); // QF100 → M102
  assert.strictEqual(canMeetInFinalByQfPath(0, 2), true);
  assert.strictEqual(canMeetInFinalByQfPath(1, 3), true);
  assert.strictEqual(canMeetInFinalByQfPath(0, 1), false);
  assert.strictEqual(canMeetInFinalByQfPath(2, 3), false);
}

console.log("wc2026KnockoutTopology.selftest.ts: ok");
