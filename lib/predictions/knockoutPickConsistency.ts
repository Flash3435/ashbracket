import type { KnockoutPickPredictionKind } from "../../types/adminKnockoutPicks";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";

function idsForKind(
  slots: KnockoutPickSlotDraft[],
  kind: KnockoutPickPredictionKind,
): Set<string> {
  const s = new Set<string>();
  for (const row of slots) {
    const id = row.teamId.trim();
    if (id && row.predictionKind === kind) s.add(id);
  }
  return s;
}

/**
 * Clears later-round picks that are no longer allowed once earlier rounds change.
 */
export function pruneKnockoutSlotsAfterBracketChange(
  slots: KnockoutPickSlotDraft[],
): KnockoutPickSlotDraft[] {
  const qf = idsForKind(slots, "quarterfinalist");
  const sf = idsForKind(slots, "semifinalist");
  const fin = idsForKind(slots, "finalist");

  return slots.map((row) => {
    const id = row.teamId.trim();
    if (!id) return row;

    if (row.predictionKind === "semifinalist" && !qf.has(id)) {
      return { ...row, teamId: "" };
    }
    if (row.predictionKind === "finalist" && !sf.has(id)) {
      return { ...row, teamId: "" };
    }
    if (row.predictionKind === "champion" && !fin.has(id)) {
      return { ...row, teamId: "" };
    }
    return row;
  });
}

/**
 * When setting a team on a slot, remove that team from other slots in the same round
 * so each round stays eight / four / two / one distinct teams.
 */
export function assignKnockoutTeamDeduped(
  slots: KnockoutPickSlotDraft[],
  rowKey: string,
  teamId: string,
): KnockoutPickSlotDraft[] {
  const target = slots.find((s) => s.rowKey === rowKey);
  if (!target) return slots;

  const next = slots.map((s) => {
    if (s.rowKey === rowKey) return { ...s, teamId };
    if (
      s.predictionKind === target.predictionKind &&
      teamId.trim() &&
      s.teamId === teamId
    ) {
      return { ...s, teamId: "" };
    }
    return s;
  });

  return pruneKnockoutSlotsAfterBracketChange(next);
}
