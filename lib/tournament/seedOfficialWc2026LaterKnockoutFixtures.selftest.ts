/**
 * Later knockout fixture seed planner tests.
 * Run: npx tsx lib/tournament/seedOfficialWc2026LaterKnockoutFixtures.selftest.ts
 */
import assert from "node:assert/strict";
import { wc2026FifaMatchCode, wc2026LaterKnockoutAdvanceFrom, WC2026_LATER_KNOCKOUT_MATCH_DEFS } from "../bracket/wc2026LaterKnockout";
import { WC2026_LATER_KNOCKOUT_FIXTURES } from "./seedOfficialWc2026LaterKnockoutFixtures";

assert.equal(WC2026_LATER_KNOCKOUT_FIXTURES.length, 16);
assert.equal(WC2026_LATER_KNOCKOUT_FIXTURES[0]?.fifa_match_no, 89);
assert.equal(WC2026_LATER_KNOCKOUT_FIXTURES[15]?.fifa_match_no, 104);

for (const fx of WC2026_LATER_KNOCKOUT_FIXTURES) {
  assert.match(fx.kickoff_at, /Z$/, `M${fx.fifa_match_no} kickoff must be UTC Z`);
}

const m90Def = WC2026_LATER_KNOCKOUT_MATCH_DEFS.find((d) => d.fifaMatchNo === 90)!;
assert.deepEqual(wc2026LaterKnockoutAdvanceFrom(m90Def), {
  homeFifaMatchNo: 73,
  awayFifaMatchNo: 75,
});
assert.equal(wc2026FifaMatchCode(90), "M90");

console.log("seedOfficialWc2026LaterKnockoutFixtures.selftest.ts: all assertions passed");
