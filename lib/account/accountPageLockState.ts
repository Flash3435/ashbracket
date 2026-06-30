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
  /** Confirmed Round of 32 matchups currently open for picks (gradual unlock). */
  gradualR32PickableCount?: number;
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
  if (input.userEmail) {
    return `Signed in as ${input.userEmail}.`;
  }
  return "";
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
