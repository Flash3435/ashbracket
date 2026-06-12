/**
 * Run: npx tsx lib/pool/selectActivePublicRulesPool.selftest.ts
 */
import assert from "node:assert/strict";
import { pickActivePublicRulesPoolId } from "./selectActivePublicRulesPool";

const candidates = [
  { poolId: "b-pool", poolName: "Beta Pool" },
  { poolId: "a-pool", poolName: "Alpha Pool" },
];

assert.deepEqual(
  pickActivePublicRulesPoolId("missing-id", candidates),
  { poolId: "a-pool", source: "active_live_wc2026" },
);

assert.deepEqual(
  pickActivePublicRulesPoolId("b-pool", candidates),
  { poolId: "b-pool", source: "configured_sample" },
);

assert.equal(pickActivePublicRulesPoolId("b-pool", []), null);

const legacyArchived = {
  poolId: "8669dd41-32f6-4175-8f13-12938267dff9",
  poolName: "AshBracket 2026",
};
const livePools = [
  { poolId: "35914476-e0e3-4df7-9389-b2bab8548ac4", poolName: "Fampool 2026" },
  { poolId: "90d2ca16-58f1-4e7a-8be2-94aa95458636", poolName: "PPFamily" },
];
assert.deepEqual(
  pickActivePublicRulesPoolId("a0000001-0000-4000-8000-000000000001", livePools),
  { poolId: "35914476-e0e3-4df7-9389-b2bab8548ac4", source: "active_live_wc2026" },
);
assert.equal(
  livePools.some((pool) => pool.poolId === legacyArchived.poolId),
  false,
  "archived legacy pool must not appear in live candidates",
);

console.log("selectActivePublicRulesPool.selftest: ok");
