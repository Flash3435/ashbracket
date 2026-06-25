import assert from "node:assert";
import {
  buildPoolPickDeadlineStatus,
  formatPoolPickDeadlineLabel,
  formatRelativeTimeUntilEn,
  isPreKnockoutLockedAt,
} from "./poolPickDeadlineDisplay";
import { ASHBRACKET_2026_POOL_LOCK_AT_ISO } from "../datetime/poolLockDeadline";

// Official AshBracket 2026 deadline displays in Eastern Time
{
  const label = formatPoolPickDeadlineLabel(ASHBRACKET_2026_POOL_LOCK_AT_ISO);
  assert.ok(label.includes("Jun 11"), label);
  assert.ok(label.includes("12:00"), label);
  assert.ok(label.endsWith(" ET"), label);
  assert.ok(!label.includes("UTC"), label);
}

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
  assert.ok(status.headline.includes("organizer"));
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

// Injected nowMs — before lock
{
  const beforeLockMs = new Date("2026-06-11T12:00:00Z").getTime();
  assert.strictEqual(
    isPreKnockoutLockedAt(ASHBRACKET_2026_POOL_LOCK_AT_ISO, beforeLockMs),
    false,
  );
  const status = buildPoolPickDeadlineStatus({
    lockAtIso: ASHBRACKET_2026_POOL_LOCK_AT_ISO,
    knockoutBracketPicksUnlocked: false,
    nowMs: beforeLockMs,
  });
  assert.strictEqual(status.preKnockoutLocked, false);
  assert.ok(
    status.headline.includes("today") || status.headline.includes("Picks lock"),
    status.headline,
  );
  assert.ok(status.deadlineLabel?.includes("ET"), status.deadlineLabel ?? "");
}

// Injected nowMs — after lock (stable even when real clock is past deadline)
{
  const afterLockMs = new Date("2026-06-11T17:00:00Z").getTime();
  assert.strictEqual(
    isPreKnockoutLockedAt(ASHBRACKET_2026_POOL_LOCK_AT_ISO, afterLockMs),
    true,
  );
  const status = buildPoolPickDeadlineStatus({
    lockAtIso: ASHBRACKET_2026_POOL_LOCK_AT_ISO,
    knockoutBracketPicksUnlocked: false,
    nowMs: afterLockMs,
  });
  assert.strictEqual(status.preKnockoutLocked, true);
  assert.strictEqual(status.chipLabel, "locked");
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
  assert.strictEqual(status.headline, "Group & bonus picks locked");
  assert.ok(status.detail?.includes("You can review them, but they can no longer be edited"));
  assert.ok(status.detail?.includes("Knockout bracket picks are still editable"));
  assert.ok(!status.detail?.includes("Round of 32"));
}

// Locked — pre-knockout frozen, knockout still waiting
{
  const status = buildPoolPickDeadlineStatus({
    lockAtIso: ASHBRACKET_2026_POOL_LOCK_AT_ISO,
    knockoutBracketPicksUnlocked: false,
    nowMs: new Date("2026-06-11T17:00:00Z").getTime(),
  });
  assert.strictEqual(status.preKnockoutLocked, true);
  assert.strictEqual(status.headline, "Group & bonus picks locked");
  assert.ok(status.detail?.includes("These picks locked on"));
  assert.ok(status.detail?.includes("You can review them, but they can no longer be edited"));
  assert.ok(!status.detail?.includes("Round of 32"));
  assert.ok(status.deadlineLabel?.includes("ET"), status.deadlineLabel ?? "");
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
