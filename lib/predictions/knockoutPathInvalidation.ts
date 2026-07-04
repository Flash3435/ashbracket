import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  getGradualKnockoutSelectionState,
  gradualR32MatchLockReason,
  r32MatchIndexForR16SlotKey,
} from "../picks/gradualKnockoutUnlock";
import {
  isKnockoutMatchLockedForParticipant,
  isKnockoutSlotFrozenByOfficialFeeders,
  resolveTournamentMatchForKnockoutSlot,
} from "../picks/knockoutPickEditability";
import type { ClearedKnockoutPathPick } from "./pruneOfficialKnockoutPathPicks";

export type KnockoutPathLockContext = {
  teams: Team[];
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  knockoutBracketPicksUnlocked: boolean;
  nowMs?: number;
};

function isInvalidPickLocked(
  pick: ClearedKnockoutPathPick,
  _slots: KnockoutPickSlotDraft[],
  ctx: KnockoutPathLockContext,
): boolean {
  const gradual = getGradualKnockoutSelectionState({
    matches: ctx.tournamentMatches,
    teams: ctx.teams,
    nowMs: ctx.nowMs,
    fullRoundOf32Official: ctx.knockoutBracketPicksUnlocked,
  });

  if (pick.predictionKind === "round_of_16") {
    const matchIndex = r32MatchIndexForR16SlotKey(pick.slotKey);
    if (matchIndex < 0) return false;
    const ms = gradual.matchStates[matchIndex];
    if (!ms) return false;
    return gradualR32MatchLockReason(ms, ctx.knockoutBracketPicksUnlocked) === "started";
  }

  // R16 match-winner slots (M89–M96): stale picks stay clearable until that match kicks off.
  if (pick.predictionKind === "quarterfinalist") {
    const match = resolveTournamentMatchForKnockoutSlot({
      predictionKind: pick.predictionKind,
      slotKey: pick.slotKey,
      tournamentMatches: ctx.tournamentMatches,
      gradual,
    });
    if (match && isKnockoutMatchLockedForParticipant(match, ctx.nowMs)) {
      return true;
    }
    return false;
  }

  if (
    isKnockoutSlotFrozenByOfficialFeeders({
      predictionKind: pick.predictionKind,
      slotKey: pick.slotKey,
      tournamentMatches: ctx.tournamentMatches,
      gradual,
    })
  ) {
    return true;
  }

  const match = resolveTournamentMatchForKnockoutSlot({
    predictionKind: pick.predictionKind,
    slotKey: pick.slotKey,
    tournamentMatches: ctx.tournamentMatches,
    gradual,
  });
  if (match && isKnockoutMatchLockedForParticipant(match, ctx.nowMs)) {
    return true;
  }

  return false;
}

/**
 * Locked invalid picks keep the historical team and `pickStatus: out`.
 * Editable invalid picks are cleared so the participant can choose again.
 */
export function applyKnockoutPathInvalidation(
  slots: KnockoutPickSlotDraft[],
  invalidated: ClearedKnockoutPathPick[],
  ctx: KnockoutPathLockContext,
): KnockoutPickSlotDraft[] {
  if (invalidated.length === 0) return slots;

  const byRowKey = new Map(invalidated.map((p) => [p.rowKey, p]));

  return slots.map((row) => {
    const inv = byRowKey.get(row.rowKey);
    if (!inv) return row;

    if (isInvalidPickLocked(inv, slots, ctx)) {
      const teamId = inv.teamId.trim() || row.teamId.trim();
      if (!teamId) return row;
      return {
        ...row,
        teamId,
        pickStatus: "out",
        invalidReason: inv.reason,
      };
    }

    return {
      ...row,
      teamId: "",
      pickStatus: null,
      invalidReason: null,
    };
  });
}
