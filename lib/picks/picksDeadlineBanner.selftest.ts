import assert from "node:assert";
import {
  buildPicksDeadlineBannerCopy,
  buildPicksDeadlineBannerViewModel,
  formatPicksDeadlineCountdown,
  picksDeadlineBannerUrgency,
  shouldShowPicksDeadlineBanner,
  PICKS_DEADLINE_BANNER_SOON_MS,
  PICKS_DEADLINE_BANNER_URGENT_MS,
} from "./picksDeadlineBanner";

const baseUrls = {
  joinUrl: "/join/demo",
  picksUrl: "/account/picks?participant=abc",
  inviteUrl: "https://ashbracket.com/join/demo",
  poolUrl: "/pool/pool-1",
  adminIncompleteUrl: "/admin/pools/pool-1/participants#incomplete-brackets",
};

// Visibility thresholds
{
  const now = Date.now();
  const far = new Date(now + PICKS_DEADLINE_BANNER_SOON_MS + 3600_000).toISOString();
  assert.strictEqual(
    shouldShowPicksDeadlineBanner(far, false, now),
    false,
    "hide when >72h away",
  );

  const soon = new Date(now + PICKS_DEADLINE_BANNER_URGENT_MS + 3600_000).toISOString();
  assert.strictEqual(
    shouldShowPicksDeadlineBanner(soon, false, now),
    true,
    "show between 24h and 72h",
  );
  assert.strictEqual(
    picksDeadlineBannerUrgency(soon, false, now),
    "soon",
  );

  const urgent = new Date(now + 2 * 3600_000).toISOString();
  assert.strictEqual(
    shouldShowPicksDeadlineBanner(urgent, false, now),
    true,
    "show within 24h",
  );
  assert.strictEqual(
    picksDeadlineBannerUrgency(urgent, false, now),
    "urgent",
  );

  const past = new Date(now - 60_000).toISOString();
  assert.strictEqual(shouldShowPicksDeadlineBanner(past, false, now), false);
  assert.strictEqual(shouldShowPicksDeadlineBanner(past, true, now), false);
}

// Countdown formatting
{
  const now = Date.now();
  const in11h42m = new Date(now + (11 * 3600 + 42 * 60) * 1000).toISOString();
  assert.strictEqual(
    formatPicksDeadlineCountdown(in11h42m, now),
    "Picks lock in 11h 42m",
  );

  const in47m = new Date(now + 47 * 60 * 1000).toISOString();
  assert.strictEqual(formatPicksDeadlineCountdown(in47m, now), "Picks lock in 47m");

  const in30s = new Date(now + 30 * 1000).toISOString();
  assert.strictEqual(
    formatPicksDeadlineCountdown(in30s, now),
    "Picks lock in less than 1 minute",
  );

  const past = new Date(now - 1000).toISOString();
  assert.strictEqual(
    formatPicksDeadlineCountdown(past, now),
    "Picks are now locked",
  );
}

// Viewer copy
{
  const signedOut = buildPicksDeadlineBannerCopy("signed_out", baseUrls);
  assert.strictEqual(signedOut.headline, "Final chance to join");
  assert.strictEqual(signedOut.ctaLabel, "Join the pool");

  const incomplete = buildPicksDeadlineBannerCopy(
    "participant_incomplete",
    baseUrls,
  );
  assert.ok(incomplete.headline.includes("Finish your picks"));
  assert.strictEqual(incomplete.ctaLabel, "Finish my picks");

  const complete = buildPicksDeadlineBannerCopy(
    "participant_complete",
    baseUrls,
  );
  assert.strictEqual(complete.ctaKind, "copy_invite");
  assert.strictEqual(complete.ctaLabel, "Copy invite link");

  const completeNoInvite = buildPicksDeadlineBannerCopy("participant_complete", {
    ...baseUrls,
    inviteUrl: null,
  });
  assert.strictEqual(completeNoInvite.ctaKind, "link");
  assert.strictEqual(completeNoInvite.ctaLabel, "View pool");

  const admin = buildPicksDeadlineBannerCopy("admin", baseUrls);
  assert.strictEqual(admin.headline, "Deadline approaching");
  assert.strictEqual(admin.ctaLabel, "View incomplete brackets");
  assert.strictEqual(
    admin.ctaHref,
    "/admin/pools/pool-1/participants#incomplete-brackets",
  );
}

// View model builder
{
  const now = Date.now();
  const lockAt = new Date(now + 3600_000).toISOString();
  const model = buildPicksDeadlineBannerViewModel({
    lockAtIso: lockAt,
    viewerRole: "signed_out",
    ...baseUrls,
    nowMs: now,
  });
  assert.ok(model);
  assert.strictEqual(model?.urgency, "urgent");
}

console.log("picksDeadlineBanner.selftest.ts: ok");
