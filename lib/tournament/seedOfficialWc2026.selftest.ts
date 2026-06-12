import assert from "node:assert";
import groupFixtures from "./wc2026GroupFixtures.json";
import {
  ASHBRACKET_SCHEDULE_TIMEZONE,
  formatKickoffLocal,
} from "../datetime/scheduleDisplay";
import { validateKickoffAtUtc } from "./validateWc2026KickoffAt";

type Fixture = { home: string; away: string; kickoff_at: string };

function fx(group: string, home: string, away: string): Fixture {
  const rows = (groupFixtures as Record<string, Fixture[]>)[group];
  const row = rows?.find((r) => r.home === home && r.away === away);
  assert.ok(row, `missing fixture ${group} ${home}-${away}`);
  return row;
}

for (const [group, rows] of Object.entries(groupFixtures)) {
  for (const row of rows as Fixture[]) {
    const label = `Group ${group} ${row.home}-${row.away}`;
    assert.strictEqual(
      validateKickoffAtUtc(row.kickoff_at, label),
      null,
      label,
    );
  }
}

// Group A — visible early tournament schedule (venue-local → UTC, not fake Z wall clock)
assert.strictEqual(
  fx("A", "MEX", "RSA").kickoff_at,
  "2026-06-11T19:00:00Z",
  "Mexico v South Africa opener",
);
{
  const parts = formatKickoffLocal("2026-06-11T19:00:00Z", {
    timeZone: ASHBRACKET_SCHEDULE_TIMEZONE,
  });
  assert.ok(parts.timeLine.includes("1:00"), parts.timeLine);
  assert.ok(/MDT/i.test(parts.timeLine), parts.timeLine);
}

assert.strictEqual(fx("A", "KOR", "CZE").kickoff_at, "2026-06-12T02:00:00Z");
assert.strictEqual(fx("A", "MEX", "KOR").kickoff_at, "2026-06-19T01:00:00Z");
assert.strictEqual(fx("A", "CZE", "RSA").kickoff_at, "2026-06-18T16:00:00Z");
assert.strictEqual(fx("A", "CZE", "MEX").kickoff_at, "2026-06-25T01:00:00Z");
assert.strictEqual(fx("A", "RSA", "KOR").kickoff_at, "2026-06-25T01:00:00Z");

console.log("seedOfficialWc2026.selftest.ts: ok");
