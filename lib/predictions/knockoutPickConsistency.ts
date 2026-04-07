import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import { isKnockoutProgressionKind } from "./knockoutProgressionKinds";

const BRACKET_DEDUPE_KINDS = new Set([
  "round_of_32",
  "round_of_16",
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "third_place_qualifier",
]);

function idsForKind(
  slots: KnockoutPickSlotDraft[],
  kind: string,
): Set<string> {
  const s = new Set<string>();
  for (const row of slots) {
    const id = row.teamId.trim();
    if (id && row.predictionKind === kind) s.add(id);
  }
  return s;
}

/** Teams picked as 1st or 2nd in any group (for constraining later rounds). */
export function advancingFromGroups(slots: KnockoutPickSlotDraft[]): Set<string> {
  const s = new Set<string>();
  for (const row of slots) {
    if (
      (row.predictionKind === "group_winner" ||
        row.predictionKind === "group_runner_up") &&
      row.teamId.trim()
    ) {
      s.add(row.teamId.trim());
    }
  }
  return s;
}

export function thirdPlaceIds(slots: KnockoutPickSlotDraft[]): Set<string> {
  return idsForKind(slots, "third_place_qualifier");
}

/** Union of group advancers and third-place picks — intended Round of 32 pool. */
export function eligibleRoundOf32Pool(slots: KnockoutPickSlotDraft[]): Set<string> {
  const u = new Set<string>();
  for (const x of advancingFromGroups(slots)) u.add(x);
  for (const x of thirdPlaceIds(slots)) u.add(x);
  return u;
}

/**
 * Clears picks that no longer fit after earlier rounds or groups change.
 */
export function pruneParticipantPicks(
  slots: KnockoutPickSlotDraft[],
  options?: { freezeKnockoutProgressionPicks?: boolean },
): KnockoutPickSlotDraft[] {
  const eligibleR32 = eligibleRoundOf32Pool(slots);
  const r32 = idsForKind(slots, "round_of_32");
  const r16 = idsForKind(slots, "round_of_16");
  const qf = idsForKind(slots, "quarterfinalist");
  const sf = idsForKind(slots, "semifinalist");
  const fin = idsForKind(slots, "finalist");

  return slots.map((row) => {
    if (
      options?.freezeKnockoutProgressionPicks &&
      isKnockoutProgressionKind(row.predictionKind)
    ) {
      return row;
    }
    const id = row.teamId.trim();
    if (!id) return row;

    if (
      row.predictionKind === "round_of_32" &&
      eligibleR32.size > 0 &&
      !eligibleR32.has(id)
    ) {
      return { ...row, teamId: "" };
    }

    if (row.predictionKind === "round_of_16") {
      if (r32.size > 0 && !r32.has(id)) return { ...row, teamId: "" };
    }

    if (row.predictionKind === "quarterfinalist") {
      if (r16.size > 0 && !r16.has(id)) return { ...row, teamId: "" };
      if (r16.size === 0 && r32.size > 0 && !r32.has(id))
        return { ...row, teamId: "" };
    }

    if (row.predictionKind === "semifinalist" && qf.size > 0 && !qf.has(id)) {
      return { ...row, teamId: "" };
    }
    if (row.predictionKind === "finalist" && sf.size > 0 && !sf.has(id)) {
      return { ...row, teamId: "" };
    }
    if (row.predictionKind === "champion" && fin.size > 0 && !fin.has(id)) {
      return { ...row, teamId: "" };
    }

    return row;
  });
}

/** @deprecated Use pruneParticipantPicks */
export function pruneKnockoutSlotsAfterBracketChange(
  slots: KnockoutPickSlotDraft[],
): KnockoutPickSlotDraft[] {
  return pruneParticipantPicks(slots);
}

/**
 * Sets a team on one slot; clears duplicates in the same round or the other finish slot in the same group.
 */
export function assignParticipantPickDeduped(
  slots: KnockoutPickSlotDraft[],
  rowKey: string,
  teamId: string,
  options?: { freezeKnockoutProgressionPicks?: boolean },
): KnockoutPickSlotDraft[] {
  const target = slots.find((s) => s.rowKey === rowKey);
  if (!target) return slots;

  const next = slots.map((s) => {
    if (s.rowKey === rowKey) return { ...s, teamId };
    if (
      target.groupCode &&
      s.groupCode === target.groupCode &&
      (target.predictionKind === "group_winner" ||
        target.predictionKind === "group_runner_up") &&
      (s.predictionKind === "group_winner" ||
        s.predictionKind === "group_runner_up") &&
      teamId.trim() &&
      s.teamId === teamId
    ) {
      return { ...s, teamId: "" };
    }
    if (
      BRACKET_DEDUPE_KINDS.has(target.predictionKind) &&
      s.predictionKind === target.predictionKind &&
      teamId.trim() &&
      s.teamId === teamId &&
      s.rowKey !== rowKey
    ) {
      return { ...s, teamId: "" };
    }
    return s;
  });

  return pruneParticipantPicks(next, options);
}

/** @deprecated Use assignParticipantPickDeduped */
export const assignKnockoutTeamDeduped = assignParticipantPickDeduped;
