import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { buildPoolMembershipCompletionStatus } from "../picks/poolMembershipCompletionStatus";
import { isKnockoutProgressionKind } from "./knockoutProgressionKinds";

/**
 * Whether every required pick slot has a team chosen. When the official Round of 32 is
 * not published yet, knockout progression rows are ignored so participants are not
 * flagged incomplete for rounds they cannot fill.
 */
export function participantPicksCompleteFromDrafts(
  slots: KnockoutPickSlotDraft[],
  options?: {
    knockoutBracketPicksUnlocked?: boolean;
    teams?: Team[];
    tournamentMatches?: TournamentMatchPublicRow[] | null;
    officialRoundOf32Complete?: boolean;
  },
): boolean {
  return buildPoolMembershipCompletionStatus(slots, options).isComplete;
}

export function relevantSlotsForCompleteness(
  slots: KnockoutPickSlotDraft[],
  knockoutBracketPicksUnlocked: boolean,
): KnockoutPickSlotDraft[] {
  const unlocked = knockoutBracketPicksUnlocked !== false;
  return unlocked
    ? slots
    : slots.filter((s) => !isKnockoutProgressionKind(s.predictionKind));
}
