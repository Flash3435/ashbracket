import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ASHBRACKET_SCHEDULE_TIMEZONE,
  formatKickoffLocal,
  formatKickoffLocalSingleLine,
} from "./scheduleDisplay";

const source = readFileSync(join(import.meta.dirname, "scheduleDisplay.ts"), "utf8");
assert.ok(
  !source.includes('"MDT"') && !source.includes("'MDT'"),
  "kickoff formatter must not hardcode MDT",
);

// June — Mountain daylight time for Edmonton/Calgary viewers
{
  const iso = "2026-06-11T20:00:00Z";
  const parts = formatKickoffLocal(iso, { timeZone: ASHBRACKET_SCHEDULE_TIMEZONE });
  assert.ok(parts.dateLine.includes("Jun"), parts.dateLine);
  assert.ok(parts.dateLine.includes("11"), parts.dateLine);
  assert.ok(parts.dateLine.includes("2026"), parts.dateLine);
  assert.ok(parts.timeLine.includes("2:00"), parts.timeLine);
  assert.ok(/MDT/i.test(parts.timeLine), `expected MDT in summer: ${parts.timeLine}`);
  assert.ok(!/MST/i.test(parts.timeLine), `summer should not show MST: ${parts.timeLine}`);

  const single = formatKickoffLocalSingleLine(iso, {
    timeZone: ASHBRACKET_SCHEDULE_TIMEZONE,
  });
  assert.ok(single.includes(" · "), single);
  assert.ok(single.includes("2:00"), single);
  assert.ok(/MDT/i.test(single), single);
}

// Winter — standard time, not daylight
{
  const iso = "2026-01-15T20:00:00Z";
  const parts = formatKickoffLocal(iso, { timeZone: ASHBRACKET_SCHEDULE_TIMEZONE });
  assert.ok(parts.timeLine.includes("1:00"), parts.timeLine);
  assert.ok(/MST/i.test(parts.timeLine), `expected MST in winter: ${parts.timeLine}`);
  assert.ok(!/MDT/i.test(parts.timeLine), `winter should not show MDT: ${parts.timeLine}`);
}

// Eastern summer — zone label comes from Intl, not a hardcoded mountain label
{
  const iso = "2026-06-11T20:00:00Z";
  const parts = formatKickoffLocal(iso, { timeZone: "America/New_York" });
  assert.ok(parts.timeLine.includes("4:00"), parts.timeLine);
  assert.ok(/EDT/i.test(parts.timeLine), parts.timeLine);
  assert.ok(!/MDT/i.test(parts.timeLine), parts.timeLine);
}

assert.strictEqual(formatKickoffLocal(null).singleLineFallback, "Time TBD");
assert.strictEqual(formatKickoffLocal("").singleLineFallback, "Time TBD");

console.log("scheduleDisplay.selftest.ts: ok");
