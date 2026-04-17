import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import { wc2026ThirdComboPlacementByKey } from "./wc2026ThirdPlaceCombinations";
import type { ThirdRouteWinnerSlot } from "./wc2026RoundOf32";
import { winnerSlotComboIndex } from "./wc2026RoundOf32";

/** Invert group fixtures: FIFA country code → single group letter (first match wins on overlap). */
export function buildCountryCodeToGroupLetter(
  groupTeamCountryCodesByLetter: Record<string, string[]>,
): Map<string, string> {
  const m = new Map<string, string>();
  const letters = Object.keys(groupTeamCountryCodesByLetter).sort();
  for (const letter of letters) {
    const codes = groupTeamCountryCodesByLetter[letter] ?? [];
    for (const c of codes) {
      const u = c.trim().toUpperCase();
      if (u && !m.has(u)) m.set(u, letter.toUpperCase());
    }
  }
  return m;
}

/**
 * Returns sorted 8-letter key of groups for the participant’s third-place advancer picks,
 * or null if fewer than eight distinct valid groups are found.
 */
export function thirdAdvancingGroupKeyFromSlots(
  slots: KnockoutPickSlotDraft[],
  teamById: Map<string, Team>,
  countryToGroup: Map<string, string>,
): string | null {
  const letters = new Set<string>();
  for (const row of slots) {
    if (row.predictionKind !== "third_place_qualifier") continue;
    const tid = row.teamId.trim();
    if (!tid) continue;
    const team = teamById.get(tid);
    if (!team) continue;
    const g = countryToGroup.get(team.countryCode.trim().toUpperCase());
    if (!g) continue;
    letters.add(g);
  }
  if (letters.size !== 8) return null;
  return [...letters].sort().join("");
}

/** Which third-place group is routed to each winner slot (A,B,D,E,G,I,K,L order), or null. */
export function thirdGroupRoutedToWinnerSlot(
  sortedEightGroupKey: string,
  winnerSlot: ThirdRouteWinnerSlot,
): string | null {
  const placement = wc2026ThirdComboPlacementByKey(sortedEightGroupKey);
  if (!placement) return null;
  const idx = winnerSlotComboIndex(winnerSlot);
  if (idx < 0 || idx >= placement.length) return null;
  return placement[idx] ?? null;
}

/** Team id for the participant’s third-place pick that belongs to `groupLetter`, if unique. */
export function thirdPickTeamIdForGroup(
  slots: KnockoutPickSlotDraft[],
  groupLetter: string,
  teamById: Map<string, Team>,
  countryToGroup: Map<string, string>,
): string | null {
  const g = groupLetter.toUpperCase();
  const hits: string[] = [];
  for (const row of slots) {
    if (row.predictionKind !== "third_place_qualifier") continue;
    const tid = row.teamId.trim();
    if (!tid) continue;
    const team = teamById.get(tid);
    if (!team) continue;
    const lg = countryToGroup.get(team.countryCode.trim().toUpperCase());
    if (lg === g) hits.push(tid);
  }
  if (hits.length !== 1) return null;
  return hits[0] ?? null;
}
