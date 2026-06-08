import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";

/** One side of a bracket match (a stored pick slot). */
export type BracketSide = {
  slotKey: string;
  teamId: string;
  rowKey: string;
};

/** Two adjacent pick slots shown as one “match” in the preview. */
export type BracketMatchPair = {
  matchIndex: number;
  top: BracketSide | null;
  bottom: BracketSide | null;
};

function numSlotKey(slotKey: string | null): number {
  if (slotKey == null || slotKey === "") return 0;
  const n = parseInt(slotKey, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Sorts draft rows by numeric `slot_key` for stable bracket ordering.
 */
export function sortKnockoutDraftsBySlot(
  rows: KnockoutPickSlotDraft[],
): KnockoutPickSlotDraft[] {
  return [...rows].sort(
    (a, b) => numSlotKey(a.slotKey) - numSlotKey(b.slotKey),
  );
}

/**
 * Pairs consecutive slots (1–2, 3–4, …) for bracket columns.
 */
export function pairKnockoutSlots(
  rows: KnockoutPickSlotDraft[],
): BracketMatchPair[] {
  const sorted = sortKnockoutDraftsBySlot(
    rows.filter((r) => r.slotKey != null && r.slotKey !== ""),
  );
  const out: BracketMatchPair[] = [];
  for (let i = 0; i < sorted.length; i += 2) {
    const top = sorted[i];
    const bottom = sorted[i + 1];
    const toSide = (
      r: KnockoutPickSlotDraft | undefined,
    ): BracketSide | null => {
      if (!r?.slotKey) return null;
      return {
        slotKey: r.slotKey,
        teamId: r.teamId,
        rowKey: r.rowKey,
      };
    };
    out.push({
      matchIndex: out.length,
      top: toSide(top),
      bottom: toSide(bottom),
    });
  }
  return out;
}

export function filterKnockoutSlots(
  slots: KnockoutPickSlotDraft[],
  kind: KnockoutPickSlotDraft["predictionKind"],
): KnockoutPickSlotDraft[] {
  return slots.filter((s) => s.predictionKind === kind);
}
