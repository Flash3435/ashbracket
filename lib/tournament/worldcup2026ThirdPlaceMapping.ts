/**
 * 2026 FIFA World Cup — third-place routing into the Round of 32 (Annex C).
 *
 * Source of truth for *which group's* third-place finisher occupies each
 * `third_routed` winner slot (A, B, D, E, G, I, K, L) is the combination table
 * in `wc2026ThirdPlaceCombinations.ts` (495 rows, Wikipedia template April 2026).
 *
 * This module adds:
 * - Human-readable bracket labels ("3 ABCDF") for UX / audit
 * - Typed helpers to resolve official R32 teams from group outcomes + the eight
 *   advancing third-place teams (by group letter), without random placement.
 */

import { wc2026ThirdComboPlacementByKey } from "../bracket/wc2026ThirdPlaceCombinations";
import {
  r32SlotKeysForMatchIndex,
  WC2026_R32_MATCH_DEFS,
  WC2026_THIRD_ROUTE_WINNER_SLOTS,
  type ThirdRouteWinnerSlot,
  type Wc2026R32SideSpec,
} from "../bracket/wc2026RoundOf32";
import { WC2026_GROUP_CODES } from "./wc2026GroupCodes";
import type { Team } from "../../src/types/domain";

/** FIFA-style label for the third-place side of each `third_routed` R32 fixture (Annex C). */
export const WC2026_THIRD_ROUTE_FIFA_LABELS: Record<ThirdRouteWinnerSlot, string> = {
  A: "3 CEFHI",
  B: "3 EFGIJ",
  D: "3 BEFIJ",
  E: "3 ABCDF",
  G: "3 AEHIJ",
  I: "3 CDFGH",
  K: "3 DEIJL",
  L: "3 EHIJK",
};

export type Wc2026GroupLetter = string;

export type Wc2026RoundOf32ResolutionInput = {
  /** Uppercase group letter → team id finishing 1st in that group. */
  groupWinnerTeamIdByLetter: Readonly<Record<string, string>>;
  /** Uppercase group letter → team id finishing 2nd in that group. */
  groupRunnerUpTeamIdByLetter: Readonly<Record<string, string>>;
  /**
   * Uppercase group letter → team id of that group's advancing third-place finisher.
   * Must contain exactly the eight letters that qualify as best thirds (keys only;
   * values are the actual national teams).
   */
  thirdPlaceTeamIdByGroupLetter: Readonly<Record<string, string>>;
};

function sortedThirdComboKey(letters: string[]): string {
  return [...letters].map((c) => c.toUpperCase()).filter(Boolean).sort().join("");
}

/**
 * Maps each `third_routed` winner slot to the **group letter** whose third-place
 * team is routed into that slot for the given combination key (sorted eight letters).
 */
export function thirdPlaceGroupLetterByWinnerSlot(
  advancingThirdGroupLetters: readonly string[],
): Readonly<Record<ThirdRouteWinnerSlot, string>> | null {
  const key = sortedThirdComboKey([...advancingThirdGroupLetters]);
  const placements = wc2026ThirdComboPlacementByKey(key);
  if (!placements || placements.length !== WC2026_THIRD_ROUTE_WINNER_SLOTS.length) {
    return null;
  }
  const out: Partial<Record<ThirdRouteWinnerSlot, string>> = {};
  for (let i = 0; i < WC2026_THIRD_ROUTE_WINNER_SLOTS.length; i += 1) {
    const slot = WC2026_THIRD_ROUTE_WINNER_SLOTS[i]!;
    const letter = placements[i]?.toUpperCase();
    if (!letter) return null;
    out[slot] = letter;
  }
  return out as Record<ThirdRouteWinnerSlot, string>;
}

function resolveSideTeamId(
  spec: Wc2026R32SideSpec,
  input: Wc2026RoundOf32ResolutionInput,
  thirdGroupByWinnerSlot: Readonly<Record<ThirdRouteWinnerSlot, string>>,
): string | null {
  if (spec.kind === "group_winner") {
    const g = spec.group.toUpperCase();
    const id = input.groupWinnerTeamIdByLetter[g];
    return id?.trim() || null;
  }
  if (spec.kind === "group_runner_up") {
    const g = spec.group.toUpperCase();
    const id = input.groupRunnerUpTeamIdByLetter[g];
    return id?.trim() || null;
  }
  const letter = thirdGroupByWinnerSlot[spec.winnerSlot];
  if (!letter) return null;
  const tid = input.thirdPlaceTeamIdByGroupLetter[letter];
  return tid?.trim() || null;
}

export type Wc2026RoundOf32ResolutionResult =
  | {
      ok: true;
      /** `round_of_32` pick slot keys `"1"`…`"32"` → team id. */
      slotTeamIdByKey: Readonly<Record<string, string>>;
    }
  | { ok: false; error: string };

/**
 * Deterministic Round of 32 field from group-stage outcomes + eight advancing
 * third-place teams. Uses only FIFA Annex C mapping (no participant bracket
 * guesses and no random assignment).
 */
export function resolveWc2026RoundOf32SlotTeamIds(
  input: Wc2026RoundOf32ResolutionInput,
): Wc2026RoundOf32ResolutionResult {
  const thirdLetters = Object.keys(input.thirdPlaceTeamIdByGroupLetter)
    .map((k) => k.toUpperCase())
    .filter((k) => Boolean(input.thirdPlaceTeamIdByGroupLetter[k]?.trim()));
  if (thirdLetters.length !== 8) {
    return {
      ok: false,
      error: `Expected exactly 8 advancing third-place groups; got ${thirdLetters.length}.`,
    };
  }
  const unique = new Set(thirdLetters);
  if (unique.size !== 8) {
    return { ok: false, error: "Advancing third-place groups must be eight distinct letters." };
  }

  const thirdGroupByWinnerSlot = thirdPlaceGroupLetterByWinnerSlot(thirdLetters);
  if (!thirdGroupByWinnerSlot) {
    return {
      ok: false,
      error: `No FIFA Annex C row for third-place combination "${sortedThirdComboKey(thirdLetters)}".`,
    };
  }

  const slotTeamIdByKey: Record<string, string> = {};

  for (let i = 0; i < WC2026_R32_MATCH_DEFS.length; i += 1) {
    const def = WC2026_R32_MATCH_DEFS[i]!;
    const { top: topKey, bottom: botKey } = r32SlotKeysForMatchIndex(i);
    const topId = resolveSideTeamId(def.top, input, thirdGroupByWinnerSlot);
    const botId = resolveSideTeamId(def.bottom, input, thirdGroupByWinnerSlot);
    if (!topId || !botId) {
      return {
        ok: false,
        error: `Missing team for R32 M${def.fifaMatchNo} (slots ${topKey}/${botKey}).`,
      };
    }
    slotTeamIdByKey[topKey] = topId;
    slotTeamIdByKey[botKey] = botId;
  }

  return { ok: true, slotTeamIdByKey };
}

/** Bracket copy: short label for a third-route side before Stage 3 / resolved picks. */
export function wc2026ThirdRoutedSideDisplayLabel(winnerSlot: ThirdRouteWinnerSlot): string {
  return WC2026_THIRD_ROUTE_FIFA_LABELS[winnerSlot];
}

function groupLetterForCountryCode(
  countryCode: string,
  groupTeamCountryCodesByLetter: Record<string, string[]>,
): string | null {
  const u = countryCode.toUpperCase();
  for (const letter of WC2026_GROUP_CODES) {
    const codes = groupTeamCountryCodesByLetter[letter];
    if (!codes?.length) continue;
    if (codes.some((c) => c.toUpperCase() === u)) return letter.toUpperCase();
  }
  return null;
}

/**
 * Maps each advancing third-place **group** to the picked national team, using the
 * official draw (`groupTeamCountryCodesByLetter`). Returns null when the schedule
 * is missing, a team is outside the draw, or two picks fall in the same group.
 */
export function buildThirdPlaceTeamIdByGroupLetterFromTeamIds(
  thirdTeamIds: readonly string[],
  teams: Team[],
  groupTeamCountryCodesByLetter: Record<string, string[]>,
): Record<string, string> | null {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const m: Record<string, string> = {};
  for (const tid of thirdTeamIds) {
    const id = tid.trim();
    if (!id) continue;
    const t = byId.get(id);
    if (!t) return null;
    const letter = groupLetterForCountryCode(t.countryCode, groupTeamCountryCodesByLetter);
    if (!letter) return null;
    if (m[letter]) return null;
    m[letter] = id;
  }
  return Object.keys(m).length === 8 ? m : null;
}
