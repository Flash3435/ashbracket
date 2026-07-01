import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  buildKnockoutMatchPickRows,
  type KnockoutWizardBracketKind,
} from "../picks/knockoutMatchPickRows";
import {
  getGradualKnockoutSelectionState,
  gradualR32MatchLockReason,
  r32MatchIndexForR16SlotKey,
} from "../picks/gradualKnockoutUnlock";
import type { KnockoutProgressionPredictionKind } from "./knockoutProgressionKinds";
import type { ClearedKnockoutPathPick } from "./pruneOfficialKnockoutPathPicks";

export type KnockoutPathLockContext = {
  teams: Team[];
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  knockoutBracketPicksUnlocked: boolean;
  nowMs?: number;
};

function matchKindForProgressionPick(
  kind: KnockoutProgressionPredictionKind,
): KnockoutWizardBracketKind | null {
  switch (kind) {
    case "quarterfinalist":
      return "quarterfinalist";
    case "semifinalist":
      return "semifinalist";
    case "finalist":
    case "champion":
      return "finalist";
    default:
      return null;
  }
}

function matchIndexForProgressionPick(pick: ClearedKnockoutPathPick): number {
  if (pick.predictionKind === "champion") return 0;
  return Math.max(0, parseInt(pick.slotKey ?? "1", 10) - 1);
}

function isInvalidPickLocked(
  pick: ClearedKnockoutPathPick,
  slots: KnockoutPickSlotDraft[],
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

  const matchKind = matchKindForProgressionPick(pick.predictionKind);
  if (!matchKind) return false;

  const rows = buildKnockoutMatchPickRows({
    slots,
    teams: ctx.teams,
    tournamentMatches: ctx.tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: ctx.knockoutBracketPicksUnlocked,
    nowMs: ctx.nowMs,
    bracketKind: matchKind,
  });
  const row = rows[matchIndexForProgressionPick(pick)];
  if (!row) return false;
  return row.lockReason === "started" || row.lockReason === "frozen";
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
