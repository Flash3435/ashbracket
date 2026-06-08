import assert from "node:assert";
import { poolRevealDashboardCopy } from "../../components/account/PoolRevealDashboardCard";

const locked = poolRevealDashboardCopy(true);
assert.ok(locked.title.includes("Pool reveal"));
assert.ok(locked.cta.includes("View pool reveal"));
assert.ok(!locked.body.includes("champion picks"));

const unlocked = poolRevealDashboardCopy(false);
assert.ok(unlocked.title.includes("unlocks after picks lock"));
assert.ok(unlocked.body.includes("champion picks"));
assert.ok(unlocked.cta.includes("Preview reveal"));

console.log("poolRevealDashboardCopy.selftest.ts: all passed");
