import assert from "node:assert";
import {
  buildPoolPickDeadlineStatus,
  formatPoolPickDeadlineLabel,
  formatRelativeTimeUntilEn,
} from "./poolPickDeadlineDisplay";
import { ASHBRACKET_2026_POOL_LOCK_AT_ISO } from "../datetime/poolLockDeadline";

// Official AshBracket 2026 deadline displays in Eastern Time
{
  const label = formatPoolPickDeadlineLabel(ASHBRACKET_2026_POOL_LOCK_AT_ISO);
  assert.ok(label.includes("Jun 10"), label);
  assert.ok(label.includes("11:59"), label);
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

// Open with deadline — headline uses Eastern calendar day near lock
{
  const nowMs = new Date("2026-06-10T12:00:00Z").getTime();
  const status = buildPoolPickDeadlineStatus({
    lockAtIso: ASHBRACKET_2026_POOL_LOCK_AT_ISO,
    knockoutBracketPicksUnlocked: false,
    nowMs,
  });
  assert.strictEqual(status.preKnockoutLocked, false);
  assert.ok(
    status.headline.includes("today") || status.headline.includes("Picks lock"),
    status.headline,
  );
  assert.ok(status.deadlineLabel?.includes("ET"), status.deadlineLabel ?? "");
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
