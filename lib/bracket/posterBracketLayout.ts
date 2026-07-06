import type { LiveBracketMatch } from "./liveBracketTracker";
import {
  WC2026_QF_PARTICIPANT_SLOT_PAIRS,
  WC2026_R16_R32_PARTICIPANT_PAIRS,
  WC2026_SF_PARTICIPANT_SLOT_PAIRS,
} from "./wc2026KnockoutPairings";

function r32OrderForR16Order(r16Order: readonly number[]): readonly number[] {
  const order: number[] = [];
  for (const r16Idx of r16Order) {
    const pair = WC2026_R16_R32_PARTICIPANT_PAIRS[r16Idx];
    if (!pair) continue;
    const [a, b] = pair;
    if (!order.includes(a)) order.push(a);
    if (!order.includes(b)) order.push(b);
  }
  return order;
}

/** R16 indices aligned with the QF pair groups on each half. */
export const POSTER_LEFT_R16_ORDER = [1, 0, 5, 4] as const;
export const POSTER_RIGHT_R16_ORDER = [3, 2, 7, 6] as const;

/** Vertical R32 index order (top → bottom) for leftRing bracket tree on each half. */
export const POSTER_LEFT_R32_ORDER = r32OrderForR16Order(POSTER_LEFT_R16_ORDER);
export const POSTER_RIGHT_R32_ORDER = r32OrderForR16Order(POSTER_RIGHT_R16_ORDER);

/** QF indices on each half (left: M97/M98 → SF101, right: M99/M100 → SF102). */
export const POSTER_LEFT_QF_ORDER = [0, 1] as const;
export const POSTER_RIGHT_QF_ORDER = [2, 3] as const;

export const POSTER_LEFT_SF_INDEX = 0;
export const POSTER_RIGHT_SF_INDEX = 1;

export type PosterHalfLayout = {
  r32: readonly number[];
  r16: readonly number[];
  qf: readonly number[];
  sf: number;
};

export const POSTER_LEFT_HALF: PosterHalfLayout = {
  r32: POSTER_LEFT_R32_ORDER,
  r16: POSTER_LEFT_R16_ORDER,
  qf: POSTER_LEFT_QF_ORDER,
  sf: POSTER_LEFT_SF_INDEX,
};

export const POSTER_RIGHT_HALF: PosterHalfLayout = {
  r32: POSTER_RIGHT_R32_ORDER,
  r16: POSTER_RIGHT_R16_ORDER,
  qf: POSTER_RIGHT_QF_ORDER,
  sf: POSTER_RIGHT_SF_INDEX,
};

/** Number of grid rows used to align bracket rounds vertically. */
export const POSTER_BRACKET_ROWS = 8;

/** Reserved center lane width (px) for Final + Champion on desktop poster layout. */
export const POSTER_CENTER_MIN_WIDTH_PX = 280;

/** Intrinsic desktop poster width: both halves, center lane, connectors, and gaps. */
export const POSTER_DESKTOP_MIN_WIDTH_PX =
  2 * (4 * 140 + 3 * 20) + POSTER_CENTER_MIN_WIDTH_PX + 2 * 12;

export function splitR32Indices(): { left: readonly number[]; right: readonly number[] } {
  return {
    left: POSTER_LEFT_R32_ORDER,
    right: POSTER_RIGHT_R32_ORDER,
  };
}

export function matchHasAliveParticipantPick(match: LiveBracketMatch): boolean {
  return [match.home, match.away].some(
    (s) => s.participantPick === "your_pick" || s.participantPick === "your_pick_alive",
  );
}

export function matchHasParticipantPick(match: LiveBracketMatch): boolean {
  return [match.home, match.away].some((s) => s.participantPick != null);
}

export function pairHasAlivePick(
  matches: LiveBracketMatch[],
  indices: readonly number[],
): boolean {
  return indices.some((i) => matchHasAliveParticipantPick(matches[i]!));
}

/** Whether a connector segment between two feeder matches should highlight. */
export function connectorShouldHighlight(
  matches: LiveBracketMatch[],
  feederIndices: readonly number[],
): boolean {
  return pairHasAlivePick(matches, feederIndices);
}

/** SF connectors need every feeder QF pick alive on-path — not just one. */
export function connectorAllFeedersHaveAlivePick(
  matches: LiveBracketMatch[],
  feederIndices: readonly number[],
): boolean {
  return (
    feederIndices.length > 0 &&
    feederIndices.every((i) => matchHasAliveParticipantPick(matches[i]!))
  );
}

export function qfFeederR16Indices(qfIndex: number): readonly [number, number] {
  const pair = WC2026_QF_PARTICIPANT_SLOT_PAIRS[qfIndex];
  if (!pair) return [0, 1];
  const [a, b] = pair;
  return [Number(a) - 1, Number(b) - 1];
}

export function sfFeederQfIndices(sfIndex: number): readonly [number, number] {
  const pair = WC2026_SF_PARTICIPANT_SLOT_PAIRS[sfIndex];
  if (!pair) return [0, 1];
  const [a, b] = pair;
  return [Number(a) - 1, Number(b) - 1];
}

export function r16FeederR32Indices(r16Index: number): readonly [number, number] {
  const pair = WC2026_R16_R32_PARTICIPANT_PAIRS[r16Index];
  if (!pair) return [0, 1];
  return pair;
}
