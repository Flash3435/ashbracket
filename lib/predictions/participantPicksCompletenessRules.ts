import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import { isKnockoutProgressionKind } from "./knockoutProgressionKinds";

/**
 * Whether every required pick slot has a team chosen. When the official Round of 32 is
 * not published yet, knockout progression rows are ignored so participants are not
 * flagged incomplete for rounds they cannot fill.
 */
export function participantPicksCompleteFromDrafts(
  slots: KnockoutPickSlotDraft[],
  options?: { knockoutBracketPicksUnlocked?: boolean },
): boolean {
  if (slots.length === 0) return false;
  const unlocked = options?.knockoutBracketPicksUnlocked !== false;
  const relevant = unlocked
    ? slots
    : slots.filter((s) => !isKnockoutProgressionKind(s.predictionKind));
  if (relevant.length === 0) return false;

  const nonThird = relevant.filter(
    (s) => s.predictionKind !== "third_place_qualifier",
  );
  if (nonThird.some((s) => s.teamId.trim() === "")) return false;

  const third = relevant.filter(
    (s) => s.predictionKind === "third_place_qualifier",
  );
  if (third.length === 0) return false;

  return third.filter((s) => s.teamId.trim()).length === 8;
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
