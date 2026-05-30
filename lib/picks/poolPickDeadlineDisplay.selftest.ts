import assert from "node:assert";
import {
  buildPoolPickDeadlineStatus,
  formatRelativeTimeUntilEn,
} from "./poolPickDeadlineDisplay";

// Future deadline — relative label
{
  const future = new Date(Date.now() + 2 * 86400 * 1000).toISOString();
  assert.strictEqual(formatRelativeTimeUntilEn(future).includes("in"), true);
}

// Past deadline — locked
{
  const past = new Date(Date.now() - 3600 * 1000).toISOString();
  assert.strictEqual(formatRelativeTimeUntilEn(past), "locked");
}

// No deadline
{
  const status = buildPoolPickDeadlineStatus({
    lockAtIso: null,
    knockoutBracketPicksUnlocked: false,
  });
  assert.strictEqual(status.preKnockoutLocked, false);
  assert.ok(status.headline.includes("No pick deadline"));
  assert.strictEqual(status.tone, "neutral");
}

// Open with deadline
{
  const lockAt = new Date(Date.now() + 3 * 86400 * 1000).toISOString();
  const status = buildPoolPickDeadlineStatus({
    lockAtIso: lockAt,
    knockoutBracketPicksUnlocked: false,
    nowMs: Date.now(),
  });
  assert.strictEqual(status.preKnockoutLocked, false);
  assert.ok(status.headline.includes("Picks lock"));
  assert.ok(status.deadlineLabel);
  assert.ok(status.detail?.includes("Round of 32"));
}

// Locked — knockout still editable
{
  const lockAt = new Date(Date.now() - 3600 * 1000).toISOString();
  const status = buildPoolPickDeadlineStatus({
    lockAtIso: lockAt,
    knockoutBracketPicksUnlocked: true,
    nowMs: Date.now(),
  });
  assert.strictEqual(status.preKnockoutLocked, true);
  assert.strictEqual(status.chipLabel, "locked");
  assert.ok(status.headline.includes("locked"));
  assert.ok(status.detail?.includes("Knockout bracket picks are still editable"));
}

// Read-only viewer copy
{
  const lockAt = new Date(Date.now() + 5 * 86400 * 1000).toISOString();
  const status = buildPoolPickDeadlineStatus({
    lockAtIso: lockAt,
    readOnly: true,
    nowMs: Date.now(),
  });
  assert.ok(status.detail?.includes("This pool"));
}

console.log("poolPickDeadlineDisplay.selftest.ts: ok");
