/**
 * WC 2026 later knockout topology (M89–M104).
 * Run: npx tsx lib/bracket/wc2026LaterKnockout.selftest.ts
 */
import assert from "node:assert/strict";
import {
  WC2026_LATER_KNOCKOUT_MATCH_DEFS,
  WC2026_OFFICIAL_KNOCKOUT_MATCH_COUNT,
  wc2026FifaMatchCode,
  wc2026LaterKnockoutAdvanceFrom,
} from "./wc2026LaterKnockout";

assert.equal(WC2026_LATER_KNOCKOUT_MATCH_DEFS.length, 16);
assert.equal(WC2026_OFFICIAL_KNOCKOUT_MATCH_COUNT, 104);

assert.deepEqual(wc2026LaterKnockoutAdvanceFrom(WC2026_LATER_KNOCKOUT_MATCH_DEFS[0]!), {
  homeFifaMatchNo: 74,
  awayFifaMatchNo: 77,
});
assert.equal(wc2026FifaMatchCode(89), "M89");

// M90: Winner M73 vs Winner M75 (Canada vs Morocco path).
assert.deepEqual(wc2026LaterKnockoutAdvanceFrom(WC2026_LATER_KNOCKOUT_MATCH_DEFS[1]!), {
  homeFifaMatchNo: 73,
  awayFifaMatchNo: 75,
});

const finalDef = WC2026_LATER_KNOCKOUT_MATCH_DEFS.find((d) => d.fifaMatchNo === 104)!;
assert.equal(finalDef.scoringResultKind, "champion");
assert.deepEqual(wc2026LaterKnockoutAdvanceFrom(finalDef), {
  homeFifaMatchNo: 101,
  awayFifaMatchNo: 102,
});

console.log("wc2026LaterKnockout.selftest.ts: all assertions passed");
