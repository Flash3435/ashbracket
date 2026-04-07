import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { ParticipantPickSlotPayload } from "../../types/knockoutPicksSave";
import { isKnockoutProgressionKind } from "./knockoutProgressionKinds";

/** Shown in the third-place team chooser when a team is not eligible. */
export const THIRD_PLACE_DISABLED_WINNER =
  "Already picked as group winner";
export const THIRD_PLACE_DISABLED_RUNNER =
  "Already picked as group runner-up";
export const THIRD_PLACE_DISABLED_OTHER_SLOT =
  "Already selected as third-place advancer";

export type ThirdPlacePickChooserEntry = {
  team: Team;
  disabled?: boolean;
  disabledReason?: string;
};

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
 * Why picking `teamId` in this third-place slot is blocked (null = allowed for conflicts).
 * The current row’s existing selection is always allowed so the user can keep it until they change groups or pick another team.
 */
export function thirdPlacePickDisabledReason(
  teamId: string,
  row: KnockoutPickSlotDraft,
  slots: KnockoutPickSlotDraft[],
): string | null {
  const id = teamId.trim();
  if (!id) return null;
  if (id === row.teamId.trim()) return null;

  for (const s of slots) {
    if (
      s.predictionKind === "third_place_qualifier" &&
      s.rowKey !== row.rowKey &&
      s.teamId.trim() === id
    ) {
      return THIRD_PLACE_DISABLED_OTHER_SLOT;
    }
  }
  for (const s of slots) {
    if (s.predictionKind === "group_winner" && s.teamId.trim() === id) {
      return THIRD_PLACE_DISABLED_WINNER;
    }
    if (s.predictionKind === "group_runner_up" && s.teamId.trim() === id) {
      return THIRD_PLACE_DISABLED_RUNNER;
    }
  }
  return null;
}

/** Sorted list of all teams with disabled flags for the third-place advancer chooser. */
export function buildThirdPlacePickChooserOptions(
  row: KnockoutPickSlotDraft,
  slots: KnockoutPickSlotDraft[],
  allTeams: Team[],
): ThirdPlacePickChooserEntry[] {
  const pool = [...allTeams].sort((a, b) => a.name.localeCompare(b.name));
  return pool.map((team) => {
    const reason = thirdPlacePickDisabledReason(team.id, row, slots);
    if (reason) {
      return { team, disabled: true, disabledReason: reason };
    }
    return { team };
  });
}

/**
 * If this third-place slot’s saved team conflicts with group picks or another third slot, return a short reason for inline UI.
 */
export function thirdPlaceSlotInvalidReason(
  row: KnockoutPickSlotDraft,
  slots: KnockoutPickSlotDraft[],
): string | null {
  const id = row.teamId.trim();
  if (!id) return null;

  let winner = false;
  let runner = false;
  for (const s of slots) {
    if (s.predictionKind === "group_winner" && s.teamId.trim() === id) {
      winner = true;
    }
    if (s.predictionKind === "group_runner_up" && s.teamId.trim() === id) {
      runner = true;
    }
  }
  if (winner) return THIRD_PLACE_DISABLED_WINNER;
  if (runner) return THIRD_PLACE_DISABLED_RUNNER;

  const dup = slots.some(
    (s) =>
      s.predictionKind === "third_place_qualifier" &&
      s.rowKey !== row.rowKey &&
      s.teamId.trim() === id,
  );
  if (dup) return THIRD_PLACE_DISABLED_OTHER_SLOT;

  return null;
}

/** Server-side: third-place teams must be distinct and cannot match any group 1st/2nd pick. */
export function validateParticipantSlotsThirdPlaceRules(
  slots: ParticipantPickSlotPayload[],
): string | null {
  const advancing = new Set<string>();
  for (const s of slots) {
    const tid = s.teamId.trim();
    if (!tid) continue;
    if (
      s.predictionKind === "group_winner" ||
      s.predictionKind === "group_runner_up"
    ) {
      advancing.add(tid);
    }
  }
  const seenThird = new Set<string>();
  for (const s of slots) {
    if (s.predictionKind !== "third_place_qualifier") continue;
    const tid = s.teamId.trim();
    if (!tid) continue;
    if (advancing.has(tid)) {
      return "A third-place advancer cannot be a team you already picked first or second in a group. Clear or change the conflicting group or third-place picks.";
    }
    if (seenThird.has(tid)) {
      return "Each third-place advancer must be a different team.";
    }
    seenThird.add(tid);
  }
  return null;
}

function thirdPlaceDuplicateRowKeys(slots: KnockoutPickSlotDraft[]): Set<string> {
  const seen = new Set<string>();
  const clearKeys = new Set<string>();
  for (const row of slots) {
    if (row.predictionKind !== "third_place_qualifier") continue;
    const id = row.teamId.trim();
    if (!id) continue;
    if (seen.has(id)) clearKeys.add(row.rowKey);
    else seen.add(id);
  }
  return clearKeys;
}

/**
 * Clears picks that no longer fit after earlier rounds or groups change.
 */
export function pruneParticipantPicks(
  slots: KnockoutPickSlotDraft[],
  options?: { freezeKnockoutProgressionPicks?: boolean },
): KnockoutPickSlotDraft[] {
  const advancing = advancingFromGroups(slots);
  const eligibleR32 = eligibleRoundOf32Pool(slots);
  const r32 = idsForKind(slots, "round_of_32");
  const r16 = idsForKind(slots, "round_of_16");
  const qf = idsForKind(slots, "quarterfinalist");
  const sf = idsForKind(slots, "semifinalist");
  const fin = idsForKind(slots, "finalist");
  const thirdDupKeys = thirdPlaceDuplicateRowKeys(slots);

  return slots.map((row) => {
    if (
      options?.freezeKnockoutProgressionPicks &&
      isKnockoutProgressionKind(row.predictionKind)
    ) {
      return row;
    }
    const id = row.teamId.trim();
    if (!id) return row;

    if (row.predictionKind === "third_place_qualifier") {
      if (advancing.has(id)) return { ...row, teamId: "" };
      if (thirdDupKeys.has(row.rowKey)) return { ...row, teamId: "" };
      return row;
    }

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
