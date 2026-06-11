import assert from "node:assert";
import { ASHBRACKET_2026_POOL_LOCK_AT_ISO } from "../datetime/poolLockDeadline";
import {
  accountCreatePoolLinkState,
  buildAccountPageNavState,
  buildAccountPageTitleDescription,
  isOrganizerOnlyAccount,
} from "./accountPageLockState";
import {
  pickDefaultAccountParticipantId,
  resolveAccountParticipantId,
} from "./resolveAccountParticipantId";

const afterCanonicalMs =
  new Date(ASHBRACKET_2026_POOL_LOCK_AT_ISO).getTime() + 60_000;
const beforeCanonicalMs =
  new Date(ASHBRACKET_2026_POOL_LOCK_AT_ISO).getTime() - 60_000;

const simulationProfile = {
  id: "a0000001-0000-4000-8000-000000000101",
  pool_id: "a0000001-0000-4000-8000-000000000201",
  pool_name: "Simulation test pool",
  pool_lock_at: null,
  is_simulation: true,
};

const ppfamilyProfile = {
  id: "a0000001-0000-4000-8000-000000000102",
  pool_id: "a0000001-0000-4000-8000-000000000202",
  pool_name: "PPFamily",
  pool_lock_at: ASHBRACKET_2026_POOL_LOCK_AT_ISO,
  is_simulation: false,
};

const customOpenProfile = {
  id: "a0000001-0000-4000-8000-000000000103",
  pool_id: "a0000001-0000-4000-8000-000000000203",
  pool_name: "Friends pool",
  pool_lock_at: "2026-07-01T16:00:00.000Z",
  is_simulation: false,
};

assert.equal(
  pickDefaultAccountParticipantId(
    [simulationProfile, ppfamilyProfile],
    afterCanonicalMs,
  ),
  ppfamilyProfile.id,
  "locked live participant pool beats simulation default",
);

assert.equal(
  resolveAccountParticipantId(
    [simulationProfile, ppfamilyProfile],
    undefined,
    afterCanonicalMs,
  ),
  ppfamilyProfile.id,
);

assert.equal(
  pickDefaultAccountParticipantId(
    [simulationProfile, ppfamilyProfile],
    beforeCanonicalMs,
  ),
  ppfamilyProfile.id,
  "live participant pool beats simulation even before canonical deadline",
);

assert.equal(
  resolveAccountParticipantId(
    [simulationProfile, ppfamilyProfile],
    simulationProfile.id,
    afterCanonicalMs,
  ),
  simulationProfile.id,
  "explicit participant param still wins",
);

const mergedProfile = {
  id: "a0000001-0000-4000-8000-000000000104",
  pool_id: "a0000001-0000-4000-8000-000000000204",
  pool_name: "[Merged] FSChumps",
  pool_lock_at: null,
  is_simulation: false,
};

assert.equal(
  pickDefaultAccountParticipantId(
    [mergedProfile, ppfamilyProfile],
    afterCanonicalMs,
  ),
  ppfamilyProfile.id,
  "merged organizer pool should not override live participant lock state",
);

const archivedProfile = {
  id: "a0000001-0000-4000-8000-000000000105",
  pool_id: "a0000001-0000-4000-8000-000000000205",
  pool_name: "Old pool",
  pool_lock_at: ASHBRACKET_2026_POOL_LOCK_AT_ISO,
  archived_at: "2026-06-11T00:00:00.000Z",
  is_simulation: false,
};

assert.equal(
  pickDefaultAccountParticipantId(
    [archivedProfile, customOpenProfile],
    beforeCanonicalMs,
  ),
  customOpenProfile.id,
  "archived pool is deprioritized",
);

assert.equal(
  pickDefaultAccountParticipantId(
    [customOpenProfile, ppfamilyProfile],
    afterCanonicalMs,
  ),
  ppfamilyProfile.id,
  "after canonical deadline prefer locked live participant pool",
);

assert.equal(
  pickDefaultAccountParticipantId(
    [customOpenProfile, ppfamilyProfile],
    beforeCanonicalMs,
  ),
  customOpenProfile.id,
  "before canonical deadline keep created_at order among live pools",
);

const lockedCopy = buildAccountPageTitleDescription({
  isOrganizerOnly: false,
  hasSelectedParticipant: true,
  picksLocked: true,
  userEmail: "user@example.com",
});
assert.ok(
  lockedCopy.includes("read-only"),
  "locked participant pool uses post-lock header copy",
);

const editCopy = buildAccountPageTitleDescription({
  isOrganizerOnly: false,
  hasSelectedParticipant: true,
  picksLocked: false,
  userEmail: "user@example.com",
});
assert.ok(
  editCopy.includes("Edit picks"),
  "custom-open participant pool keeps edit header copy",
);

const organizerCopy = buildAccountPageTitleDescription({
  isOrganizerOnly: true,
  hasSelectedParticipant: false,
  picksLocked: false,
  userEmail: "user@example.com",
});
assert.ok(
  organizerCopy.includes("Manage your pools"),
  "organizer-only account avoids participant edit copy",
);
assert.equal(isOrganizerOnlyAccount(0, 2), true);

const lockedNav = buildAccountPageNavState({
  picksLocked: true,
  knockoutBracketPicksUnlocked: false,
  revealHref: "/account/reveal",
  leaderboardHref: "/pool/abc",
  picksHref: "/account/picks",
  activityHref: "/account/activity",
});
assert.equal(lockedNav.navPlan.primary.label, "Reveal picks");
assert.equal(lockedNav.showParticipantEditCopy, false);
assert.equal(
  lockedNav.suppressStandaloneNavRow,
  true,
  "locked account page hides duplicate standalone nav row",
);

const customOpenNav = buildAccountPageNavState({
  picksLocked: true,
  knockoutBracketPicksUnlocked: true,
  revealHref: "/account/reveal",
  leaderboardHref: "/pool/abc",
  picksHref: "/account/picks",
  activityHref: "/account/activity",
});
assert.equal(customOpenNav.navPlan.primary.label, "View picks");
assert.equal(customOpenNav.navPlan.tertiary?.label, "Reveal picks");
assert.equal(
  customOpenNav.suppressStandaloneNavRow,
  false,
  "custom-open pool keeps standalone nav row",
);

const unlockedNav = buildAccountPageNavState({
  picksLocked: false,
  knockoutBracketPicksUnlocked: false,
  revealHref: "/account/reveal",
  leaderboardHref: "/pool/abc",
  picksHref: "/account/picks",
  activityHref: "/account/activity",
});
assert.equal(unlockedNav.navPlan.primary.label, "Edit picks");
assert.equal(unlockedNav.navPlan.tertiary?.label, "Preview reveal");
assert.equal(unlockedNav.showParticipantEditCopy, true);
assert.equal(
  unlockedNav.suppressStandaloneNavRow,
  false,
  "unlocked pool keeps standalone nav row",
);

assert.deepEqual(
  accountCreatePoolLinkState({
    pastCanonicalDeadline: false,
    organizedPoolCount: 0,
    isGlobalAdmin: false,
  }),
  { show: true, label: "Create your own pool" },
);

assert.deepEqual(
  accountCreatePoolLinkState({
    pastCanonicalDeadline: true,
    organizedPoolCount: 2,
    isGlobalAdmin: false,
  }),
  { show: true, label: "Create test pool" },
);

assert.deepEqual(
  accountCreatePoolLinkState({
    pastCanonicalDeadline: true,
    organizedPoolCount: 0,
    isGlobalAdmin: false,
  }),
  { show: false, label: "Create your own pool" },
);

console.log("accountPageLockState.selftest.ts: all passed");
