import assert from "node:assert";
import {
  buildPostLockNavPlan,
  isPostLockEngagementMode,
  poolSnapshotFootnote,
  postLockCardCopy,
} from "./postLockEngagement";

const base = {
  picksHref: "/account/picks",
  activityHref: "/account/activity",
  revealHref: "/account/reveal",
  leaderboardHref: "/pool/abc",
};

assert.equal(isPostLockEngagementMode(true, false), true);
assert.equal(isPostLockEngagementMode(true, true), false);
assert.equal(isPostLockEngagementMode(false, false), false);

const lockedPlan = buildPostLockNavPlan({
  ...base,
  picksLocked: true,
  knockoutBracketPicksUnlocked: false,
});
assert.equal(lockedPlan.postLockEngagement, true);
assert.equal(lockedPlan.primary.label, "Reveal picks");
assert.equal(lockedPlan.secondary.label, "View leaderboard");
assert.equal(lockedPlan.tertiary?.label, "View activity");

const unlockedPlan = buildPostLockNavPlan({
  ...base,
  picksLocked: false,
  knockoutBracketPicksUnlocked: false,
});
assert.equal(unlockedPlan.postLockEngagement, false);
assert.equal(unlockedPlan.primary.label, "Edit picks");
assert.equal(unlockedPlan.tertiary?.label, "Preview reveal");

const customOpenPlan = buildPostLockNavPlan({
  ...base,
  picksLocked: true,
  knockoutBracketPicksUnlocked: true,
});
assert.equal(customOpenPlan.postLockEngagement, false);
assert.equal(customOpenPlan.primary.label, "View picks");

const noRevealPlan = buildPostLockNavPlan({
  ...base,
  revealHref: null,
  picksLocked: true,
  knockoutBracketPicksUnlocked: false,
});
assert.equal(noRevealPlan.primary.label, "View leaderboard");
assert.equal(noRevealPlan.secondary.label, "View picks");

const noRevealNoLeaderboard = buildPostLockNavPlan({
  ...base,
  revealHref: null,
  leaderboardHref: null,
  picksLocked: true,
  knockoutBracketPicksUnlocked: false,
});
assert.equal(noRevealNoLeaderboard.primary.label, "View picks");
assert.equal(noRevealNoLeaderboard.secondary.label, "View activity");
assert.equal(noRevealNoLeaderboard.tertiary, null);

assert.ok(postLockCardCopy("landing").headline.includes("let the pool begin"));
assert.ok(postLockCardCopy("account").headline.includes("Your bracket is locked"));

assert.equal(
  poolSnapshotFootnote({ totalParticipants: 0, completeBrackets: 0, mostPopularChampion: null }),
  "No participants in this pool yet — check back once members join.",
);
assert.equal(
  poolSnapshotFootnote({ totalParticipants: 5, completeBrackets: 3, mostPopularChampion: "Brazil" }),
  "Some brackets were incomplete at lock.",
);
assert.equal(
  poolSnapshotFootnote({ totalParticipants: 5, completeBrackets: 5, mostPopularChampion: "Brazil" }),
  null,
);

console.log("postLockEngagement.selftest.ts: all passed");
