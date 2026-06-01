import { computePoolPotSummary } from "./computePoolPotSummary";

const pot = computePoolPotSummary(
  [{ paid: true }, { paid: true }, { paid: false }],
  25,
);

console.assert(pot.paidCount === 2, "paid count");
console.assert(pot.unpaidCount === 1, "unpaid count");
console.assert(pot.currentPot === 50, "current pot");
console.assert(pot.potentialPot === 75, "potential pot");
console.assert(pot.unpaidAmount === 25, "outstanding");

const emptyFee = computePoolPotSummary([{ paid: false }], null);
console.assert(emptyFee.currentPot === null, "no fee -> null pot");

console.log("computePoolPotSummary.selftest.ts: ok");
