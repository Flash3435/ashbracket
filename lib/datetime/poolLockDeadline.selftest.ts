import assert from "node:assert";
import {
  ASHBRACKET_2026_POOL_LOCK_AT_ISO,
  formatPoolLockDeadline,
  formatPoolLockDeadlineTimeOnly,
  poolLockDeadlineCalendarKey,
} from "./poolLockDeadline";
import { poolLocked } from "../pools/poolLocked";

// June 10, 2026 11:59 p.m. Eastern Time = 2026-06-11T03:59:00Z
assert.strictEqual(ASHBRACKET_2026_POOL_LOCK_AT_ISO, "2026-06-11T03:59:00.000Z");

const compact = formatPoolLockDeadline(ASHBRACKET_2026_POOL_LOCK_AT_ISO, {
  style: "compact",
});
assert.ok(compact.includes("Jun"), `compact date: ${compact}`);
assert.ok(compact.includes("10"), `compact day: ${compact}`);
assert.ok(compact.includes("2026"), `compact year: ${compact}`);
assert.ok(compact.includes("11:59"), `compact time: ${compact}`);
assert.ok(compact.endsWith(" ET"), `compact suffix: ${compact}`);
assert.ok(!compact.includes("UTC"), `no UTC in compact: ${compact}`);

const longForm = formatPoolLockDeadline(ASHBRACKET_2026_POOL_LOCK_AT_ISO, {
  style: "long",
});
assert.ok(longForm.includes("June 10, 2026"), `long date: ${longForm}`);
assert.ok(longForm.includes("11:59"), `long time: ${longForm}`);
assert.ok(longForm.includes("Eastern Time"), `long label: ${longForm}`);
assert.ok(!longForm.includes("UTC"), `no UTC in long: ${longForm}`);

const timeOnly = formatPoolLockDeadlineTimeOnly(ASHBRACKET_2026_POOL_LOCK_AT_ISO);
assert.ok(timeOnly.includes("11:59"), `time only: ${timeOnly}`);

// Calendar key uses Eastern date (June 10, not June 11 UTC)
const lockMs = new Date(ASHBRACKET_2026_POOL_LOCK_AT_ISO).getTime();
assert.strictEqual(
  poolLockDeadlineCalendarKey(lockMs),
  "2026-06-10",
  "Eastern calendar date for lock instant",
);

// Lock logic still uses UTC instant (poolLocked compares to real time)
assert.strictEqual(
  poolLocked(ASHBRACKET_2026_POOL_LOCK_AT_ISO),
  new Date(ASHBRACKET_2026_POOL_LOCK_AT_ISO).getTime() <= Date.now(),
  "poolLocked matches UTC instant vs now",
);

console.log("poolLockDeadline.selftest.ts: ok");
