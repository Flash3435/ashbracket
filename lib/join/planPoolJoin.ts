import {
  JOIN_DISPLAY_NAME_AMBIGUOUS_MESSAGE,
  JOIN_DISPLAY_NAME_TAKEN_MESSAGE,
  JOIN_NEEDS_CONFIRMATION_HINT,
} from "./joinDisplayName";

export type PoolJoinIntent = "initial" | "confirm_existing" | "create_new";

export type UnclaimedMatch = {
  participantId: string;
  displayName: string;
};

export type PlanPoolJoinResult =
  | { action: "register" }
  | { action: "claim"; participantId: string }
  | {
      action: "needs_confirmation";
      participantId: string;
      matchedDisplayName: string;
      message: string;
    }
  | { action: "ambiguous"; message: string }
  | { action: "error"; message: string };

/**
 * Pure join routing: map unclaimed name matches + user intent to register, claim, or UI steps.
 */
export function planPoolJoin(input: {
  intent: PoolJoinIntent;
  unclaimedMatches: UnclaimedMatch[];
  nameTakenByJoinedParticipant: boolean;
}): PlanPoolJoinResult {
  const { intent, unclaimedMatches, nameTakenByJoinedParticipant } = input;

  if (intent === "confirm_existing") {
    if (unclaimedMatches.length === 0) {
      return {
        action: "error",
        message: JOIN_NEEDS_CONFIRMATION_HINT,
      };
    }
    const first = unclaimedMatches[0]!;
    return { action: "claim", participantId: first.participantId };
  }

  if (intent === "create_new") {
    if (nameTakenByJoinedParticipant) {
      return { action: "error", message: JOIN_DISPLAY_NAME_TAKEN_MESSAGE };
    }
    return { action: "register" };
  }

  if (unclaimedMatches.length > 1) {
    return { action: "ambiguous", message: JOIN_DISPLAY_NAME_AMBIGUOUS_MESSAGE };
  }

  if (unclaimedMatches.length === 1) {
    const match = unclaimedMatches[0]!;
    return {
      action: "needs_confirmation",
      participantId: match.participantId,
      matchedDisplayName: match.displayName,
      message: JOIN_NEEDS_CONFIRMATION_HINT,
    };
  }

  if (nameTakenByJoinedParticipant) {
    return { action: "error", message: JOIN_DISPLAY_NAME_TAKEN_MESSAGE };
  }

  return { action: "register" };
}
