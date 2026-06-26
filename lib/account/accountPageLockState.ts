import {
  buildPostLockNavPlan,
  isPostLockEngagementMode,
  type PostLockNavInput,
} from "./postLockEngagement";

export function isOrganizerOnlyAccount(
  participantProfileCount: number,
  organizedPoolCount: number,
): boolean {
  return participantProfileCount === 0 && organizedPoolCount > 0;
}

export function buildAccountPageTitleDescription(input: {
  isOrganizerOnly: boolean;
  hasSelectedParticipant: boolean;
  picksLocked: boolean;
  userEmail: string | null;
}): string {
  if (input.isOrganizerOnly) {
    return "Manage your pools and follow locked brackets from here.";
  }
  if (!input.hasSelectedParticipant) {
    return input.userEmail
      ? `Signed in as ${input.userEmail}.`
      : "Your AshBracket account.";
  }
  if (input.picksLocked) {
    return input.userEmail
      ? `Signed in as ${input.userEmail}. Below is your bracket snapshot for the selected pool profile. Picks are locked, so this is now a read-only view.`
      : "Your bracket overview for the selected pool profile. Picks are locked, so this is now a read-only view.";
  }
  return input.userEmail
    ? `Signed in as ${input.userEmail}. Below is your bracket snapshot for the selected pool profile — use Edit picks to continue or change picks.`
    : "Your bracket overview for the selected pool profile. Use Edit picks to update your picks.";
}

export type AccountCreatePoolLinkState = {
  show: boolean;
  label: "Create your own pool" | "Create test pool";
};

/** After the canonical deadline, hide self-serve pool creation except for organizers/admins. */
export function accountCreatePoolLinkState(input: {
  pastCanonicalDeadline: boolean;
  organizedPoolCount: number;
  isGlobalAdmin: boolean;
}): AccountCreatePoolLinkState {
  if (!input.pastCanonicalDeadline) {
    return { show: true, label: "Create your own pool" };
  }
  if (input.organizedPoolCount > 0 || input.isGlobalAdmin) {
    return { show: true, label: "Create test pool" };
  }
  return { show: false, label: "Create your own pool" };
}

export type AccountPageNavState = ReturnType<typeof buildAccountPageNavState>;

export function buildAccountPageNavState(input: PostLockNavInput) {
  const postLockEngagement = isPostLockEngagementMode(
    input.picksLocked,
    input.knockoutBracketPicksUnlocked,
    input.knockoutPicksEditable,
  );
  const navPlan = buildPostLockNavPlan(input);
  return {
    postLockEngagement,
    navPlan,
    /** Standalone button row duplicates PostLockEngagementCard after lock. */
    suppressStandaloneNavRow: postLockEngagement,
    showParticipantEditCopy:
      !postLockEngagement && !input.picksLocked,
  };
}
