import assert from "node:assert";
import { poolRevealDashboardCopy } from "../../components/account/PoolRevealDashboardCard";

const locked = poolRevealDashboardCopy(true);
assert.ok(locked.title.includes("Compare brackets"));
assert.ok(locked.cta.includes("Reveal picks"));
assert.ok(locked.body.includes("champion picks"));

const unlocked = poolRevealDashboardCopy(false);
assert.ok(unlocked.title.includes("Picks reveal after lock"));
assert.ok(unlocked.body.includes("Preview"));
assert.ok(unlocked.cta.includes("Preview reveal"));

console.log("poolRevealDashboardCopy.selftest.ts: all passed");
