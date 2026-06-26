import {
  r32SlotKeysForMatchIndex,
  WC2026_R32_MATCH_DEFS,
  type ThirdRouteWinnerSlot,
  type Wc2026R32SideSpec,
} from "../bracket/wc2026RoundOf32";
import { thirdPlaceGroupLetterByWinnerSlot } from "./worldcup2026ThirdPlaceMapping";

export type Wc2026PartialGroupOutcomes = {
  groupWinnerTeamIdByLetter: Readonly<Record<string, string>>;
  groupRunnerUpTeamIdByLetter: Readonly<Record<string, string>>;
  /** Present only when exactly eight advancing third-place groups are known. */
  thirdPlaceTeamIdByGroupLetter: Readonly<Record<string, string>>;
};

export type Wc2026PartialR32MatchTeams = {
  matchIndex: number;
  fifaMatchNo: number;
  topSlotKey: string;
  bottomSlotKey: string;
  topTeamId: string | null;
  bottomTeamId: string | null;
};

function resolveSideTeamIdPartial(
  spec: Wc2026R32SideSpec,
  input: Wc2026PartialGroupOutcomes,
  thirdGroupByWinnerSlot: Readonly<Record<ThirdRouteWinnerSlot, string>> | null,
): string | null {
  if (spec.kind === "group_winner") {
    const g = spec.group.toUpperCase();
    return input.groupWinnerTeamIdByLetter[g]?.trim() || null;
  }
  if (spec.kind === "group_runner_up") {
    const g = spec.group.toUpperCase();
    return input.groupRunnerUpTeamIdByLetter[g]?.trim() || null;
  }
  if (!thirdGroupByWinnerSlot) return null;
  const letter = thirdGroupByWinnerSlot[spec.winnerSlot];
  if (!letter) return null;
  return input.thirdPlaceTeamIdByGroupLetter[letter]?.trim() || null;
}

/**
 * Resolves each M73–M88 side independently. Third-route sides stay null until
 * all eight advancing third-place groups are known and Annex C mapping applies.
 */
export function resolvePartialWc2026RoundOf32MatchTeams(
  input: Wc2026PartialGroupOutcomes,
): Wc2026PartialR32MatchTeams[] {
  const thirdLetters = Object.keys(input.thirdPlaceTeamIdByGroupLetter)
    .map((k) => k.toUpperCase())
    .filter((k) => Boolean(input.thirdPlaceTeamIdByGroupLetter[k]?.trim()));
  const thirdGroupByWinnerSlot =
    thirdLetters.length === 8 ? thirdPlaceGroupLetterByWinnerSlot(thirdLetters) : null;

  return WC2026_R32_MATCH_DEFS.map((def, matchIndex) => {
    const { top: topSlotKey, bottom: bottomSlotKey } =
      r32SlotKeysForMatchIndex(matchIndex);
    return {
      matchIndex,
      fifaMatchNo: def.fifaMatchNo,
      topSlotKey,
      bottomSlotKey,
      topTeamId: resolveSideTeamIdPartial(def.top, input, thirdGroupByWinnerSlot),
      bottomTeamId: resolveSideTeamIdPartial(def.bottom, input, thirdGroupByWinnerSlot),
    };
  });
}
