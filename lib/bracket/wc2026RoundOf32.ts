/**
 * 2026 FIFA World Cup Round of 32 structure (48-team format).
 * Match order follows FIFA numbering M73–M88; pick `slot_key` pairs are `"1"`/`"2"`, …, `"31"`/`"32"`
 * in the same order (see `knockoutResultsConfig` / admin scaffold notes).
 */

import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";

/** Winner-side letters that host a variable third-place opponent (Annex C columns 1A–1L subset). */
export const WC2026_THIRD_ROUTE_WINNER_SLOTS = [
  "A",
  "B",
  "D",
  "E",
  "G",
  "I",
  "K",
  "L",
] as const;

export type ThirdRouteWinnerSlot = (typeof WC2026_THIRD_ROUTE_WINNER_SLOTS)[number];

export type Wc2026R32SideSpec =
  | { kind: "group_winner"; group: string }
  | { kind: "group_runner_up"; group: string }
  | { kind: "third_routed"; winnerSlot: ThirdRouteWinnerSlot };

export type Wc2026R32MatchDef = {
  fifaMatchNo: number;
  top: Wc2026R32SideSpec;
  bottom: Wc2026R32SideSpec;
};

/**
 * Canonical order: match index `i` uses `round_of_32` slot keys `2i+1` and `2i+2`.
 * Source: FIFA schedule list for the 2026 knockout stage (Wikipedia, April 2026).
 */
export const WC2026_R32_MATCH_DEFS: readonly Wc2026R32MatchDef[] = [
  { fifaMatchNo: 73, top: { kind: "group_runner_up", group: "A" }, bottom: { kind: "group_runner_up", group: "B" } },
  { fifaMatchNo: 74, top: { kind: "group_winner", group: "E" }, bottom: { kind: "third_routed", winnerSlot: "E" } },
  { fifaMatchNo: 75, top: { kind: "group_winner", group: "F" }, bottom: { kind: "group_runner_up", group: "C" } },
  { fifaMatchNo: 76, top: { kind: "group_winner", group: "C" }, bottom: { kind: "group_runner_up", group: "F" } },
  { fifaMatchNo: 77, top: { kind: "group_winner", group: "I" }, bottom: { kind: "third_routed", winnerSlot: "I" } },
  { fifaMatchNo: 78, top: { kind: "group_runner_up", group: "E" }, bottom: { kind: "group_runner_up", group: "I" } },
  { fifaMatchNo: 79, top: { kind: "group_winner", group: "A" }, bottom: { kind: "third_routed", winnerSlot: "A" } },
  { fifaMatchNo: 80, top: { kind: "group_winner", group: "L" }, bottom: { kind: "third_routed", winnerSlot: "L" } },
  { fifaMatchNo: 81, top: { kind: "group_winner", group: "D" }, bottom: { kind: "third_routed", winnerSlot: "D" } },
  { fifaMatchNo: 82, top: { kind: "group_winner", group: "G" }, bottom: { kind: "third_routed", winnerSlot: "G" } },
  { fifaMatchNo: 83, top: { kind: "group_runner_up", group: "K" }, bottom: { kind: "group_runner_up", group: "L" } },
  { fifaMatchNo: 84, top: { kind: "group_winner", group: "H" }, bottom: { kind: "group_runner_up", group: "J" } },
  { fifaMatchNo: 85, top: { kind: "group_winner", group: "B" }, bottom: { kind: "third_routed", winnerSlot: "B" } },
  { fifaMatchNo: 86, top: { kind: "group_winner", group: "J" }, bottom: { kind: "group_runner_up", group: "H" } },
  { fifaMatchNo: 87, top: { kind: "group_winner", group: "K" }, bottom: { kind: "third_routed", winnerSlot: "K" } },
  { fifaMatchNo: 88, top: { kind: "group_runner_up", group: "D" }, bottom: { kind: "group_runner_up", group: "G" } },
] as const;

export function r32SlotKeysForMatchIndex(matchIndex: number): { top: string; bottom: string } {
  const base = matchIndex * 2 + 1;
  return { top: String(base), bottom: String(base + 1) };
}

export function winnerSlotComboIndex(w: ThirdRouteWinnerSlot): number {
  const i = WC2026_THIRD_ROUTE_WINNER_SLOTS.indexOf(w);
  return i;
}

export function roundOf32RowKeyBySlot(
  slots: KnockoutPickSlotDraft[],
  slotKey: string,
): string | null {
  const row = slots.find((s) => s.predictionKind === "round_of_32" && s.slotKey === slotKey);
  return row?.rowKey ?? null;
}
