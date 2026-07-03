import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import type { ClearedKnockoutPathPick } from "../predictions/pruneOfficialKnockoutPathPicks";
import { buildParticipantDashboardMissingKnockoutPicks } from "../admin/adminKnockoutPickStatus";
import { formatDashboardMissingKnockoutCopy } from "../dashboard/buildDashboardMissingPicks";
import { getGradualKnockoutSelectionState } from "./gradualKnockoutUnlock";
import type { KnockoutSelectionInstructionCardModel } from "./knockoutSelectionWindow";
import { deriveKnockoutSelectionSchedule } from "./knockoutSelectionWindow";
import {
  getKnockoutRepairActionSummary,
  hasLockedOutKnockoutPicks,
  requiresParticipantKnockoutRepairSave,
} from "./knockoutWizardAction";
import { isKnockoutPickLockedOut } from "../predictions/knockoutPickStatus";
import { isKnockoutProgressionKind } from "../predictions/knockoutProgressionKinds";
import type { KnockoutProgressionPredictionKind } from "../predictions/knockoutProgressionKinds";
import {
  LOCKED_OUT_PICK_HEADLINE,
  lockedOutPickCardBody,
  participantLockedKnockoutStatusHeadline,
  participantNonActionableLockedKnockoutRows,
} from "./knockoutBlockedRowExplanation";
import {
  buildKnockoutMatchPickRows,
  type KnockoutMatchPickRow,
} from "./knockoutMatchPickRows";

export type PicksPageStatusKind =
  | "path_reconciliation"
  | "missing_picks"
  | "locked_out_picks"
  | "complete";

export type PicksPageStatusCtaAction = "jump_missing" | "save";

export type PicksPageStatusModel = {
  kind: PicksPageStatusKind;
  headline: string;
  detail: string;
  tone: "warning" | "action" | "complete";
  ctaLabel: string | null;
  ctaAction: PicksPageStatusCtaAction | null;
};

export const PICKS_PAGE_KNOCKOUT_HELPER_TEXT =
  "Pick available match winners, then continue through later rounds as matchups are confirmed.";

export const PICKS_PAGE_GROUP_BONUS_LOCKED_NOTE =
  "Group and bonus picks are locked. Knockout picks remain editable until each match starts.";

export const PICKS_PAGE_COMPACT_LOCK_NOTE =
  "Picks lock at kickoff. You can still edit future matches until they start.";

function clearedPicksFromLockedSlots(
  slots: KnockoutPickSlotDraft[],
): ClearedKnockoutPathPick[] {
  const out: ClearedKnockoutPathPick[] = [];
  for (const row of slots) {
    if (!isKnockoutPickLockedOut(row)) continue;
    if (!isKnockoutProgressionKind(row.predictionKind)) continue;
    out.push({
      predictionKind: row.predictionKind as KnockoutProgressionPredictionKind,
      slotKey: row.slotKey,
      rowKey: row.rowKey,
      teamId: row.teamId,
      reason: row.invalidReason ?? "not_in_official_matchup",
    });
  }
  return out;
}

function buildLockedKnockoutMatchInput(input: {
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  officialRoundOf32Complete: boolean;
  nowMs?: number;
  clearedPickRowKeys?: ReadonlySet<string>;
}) {
  const gradual = getGradualKnockoutSelectionState({
    matches: input.tournamentMatches,
    teams: input.teams,
    nowMs: input.nowMs,
    fullRoundOf32Official: input.officialRoundOf32Complete,
  });
  return {
    slots: input.slots,
    teams: input.teams,
    tournamentMatches: input.tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: input.officialRoundOf32Complete,
    nowMs: input.nowMs,
    clearedPickRowKeys: input.clearedPickRowKeys,
  };
}

function lockedKnockoutStatusFromRows(
  rows: KnockoutMatchPickRow[],
  teams: Team[],
): PicksPageStatusModel | null {
  if (rows.length === 0) return null;
  return {
    kind: "locked_out_picks",
    headline: participantLockedKnockoutStatusHeadline(rows),
    detail: lockedOutPickCardBody(rows[0]!, teams),
    tone: "warning",
    ctaLabel: null,
    ctaAction: null,
  };
}

function matchRowForLockedOutSlot(
  slot: KnockoutPickSlotDraft,
  matchInput: ReturnType<typeof buildLockedKnockoutMatchInput>,
): KnockoutMatchPickRow | null {
  const wizardKindByKind: Record<string, "round_of_16" | "quarterfinalist" | "semifinalist" | "finalist"> = {
    quarterfinalist: "round_of_16",
    semifinalist: "quarterfinalist",
    finalist: "semifinalist",
    champion: "finalist",
  };
  const bracketKind = wizardKindByKind[slot.predictionKind];
  if (!bracketKind || !slot.slotKey) return null;
  const matchIndex = Math.max(0, parseInt(slot.slotKey, 10) - 1);
  const rows = buildKnockoutMatchPickRows({
    ...matchInput,
    bracketKind,
  });
  return rows[matchIndex] ?? null;
}

function effectiveClearedPicks(
  slots: KnockoutPickSlotDraft[],
  clearedPicks: ClearedKnockoutPathPick[],
): ClearedKnockoutPathPick[] {
  if (clearedPicks.length > 0) return clearedPicks;
  return clearedPicksFromLockedSlots(slots);
}

/** Primary picks-page status card (missing picks → editable repair → locked out → complete). */
export function buildPicksPageStatusModel(input: {
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  officialRoundOf32Complete: boolean;
  knockoutPathRepairUnsaved?: boolean;
  knockoutPathClearedPicks?: ClearedKnockoutPathPick[];
  nowMs?: number;
}): PicksPageStatusModel {
  const progressInput = {
    slots: input.slots,
    teams: input.teams,
    tournamentMatches: input.tournamentMatches,
    officialRoundOf32Complete: input.officialRoundOf32Complete,
    nowMs: input.nowMs,
  };
  const clearedPicks = effectiveClearedPicks(input.slots, input.knockoutPathClearedPicks ?? []);
  const clearedRowKeys = new Set(clearedPicks.map((c) => c.rowKey));
  const matchInput = buildLockedKnockoutMatchInput({
    ...progressInput,
    clearedPickRowKeys: clearedRowKeys,
  });
  const nonActionableLocked = participantNonActionableLockedKnockoutRows(matchInput);

  const missing = buildParticipantDashboardMissingKnockoutPicks({
    slots: input.slots,
    teams: input.teams,
    tournamentMatches: input.tournamentMatches,
    officialRoundOf32Complete: input.officialRoundOf32Complete,
    nowMs: input.nowMs,
  });

  if (missing.actionableCount > 0) {
    const copy = formatDashboardMissingKnockoutCopy(missing);
    return {
      kind: "missing_picks",
      headline: copy.headline,
      detail: copy.detail,
      tone: "action",
      ctaLabel: "Jump to missing picks",
      ctaAction: "jump_missing",
    };
  }

  if (
    input.knockoutPathRepairUnsaved &&
    clearedPicks.length > 0 &&
    requiresParticipantKnockoutRepairSave(progressInput, clearedPicks)
  ) {
    const repairSummary = getKnockoutRepairActionSummary(
      progressInput,
      clearedPicks,
    );
    return {
      kind: "path_reconciliation",
      headline: repairSummary.headline,
      detail: repairSummary.detail,
      tone: "warning",
      ctaLabel: repairSummary.ctaLabel,
      ctaAction: repairSummary.ctaLabel ? "save" : null,
    };
  }

  if (
    clearedPicks.length > 0 &&
    hasLockedOutKnockoutPicks(progressInput, clearedPicks)
  ) {
    const lockedOutSummary = getKnockoutRepairActionSummary(
      progressInput,
      clearedPicks,
    );
    return {
      kind: "locked_out_picks",
      headline: lockedOutSummary.headline,
      detail: lockedOutSummary.detail,
      tone: "warning",
      ctaLabel: null,
      ctaAction: null,
    };
  }

  if (nonActionableLocked.length > 0) {
    const fromRows = lockedKnockoutStatusFromRows(
      nonActionableLocked,
      input.teams,
    );
    if (fromRows) return fromRows;
  }

  const persistedLockedOut = input.slots.filter((row) => isKnockoutPickLockedOut(row));
  if (persistedLockedOut.length > 0) {
    const mappedRows = persistedLockedOut
      .map((slot) => matchRowForLockedOutSlot(slot, matchInput))
      .filter((row): row is KnockoutMatchPickRow => row != null);
    const fromRows = lockedKnockoutStatusFromRows(
      mappedRows.length > 0 ? mappedRows : [],
      input.teams,
    );
    if (fromRows) return fromRows;
    return {
      kind: "locked_out_picks",
      headline: LOCKED_OUT_PICK_HEADLINE,
      detail: lockedOutPickCardBody(null),
      tone: "warning",
      ctaLabel: null,
      ctaAction: null,
    };
  }

  return {
    kind: "complete",
    headline: "Current picks complete",
    detail:
      "All available knockout picks are filled. Future matchups will unlock as results become official.",
    tone: "complete",
    ctaLabel: null,
    ctaAction: null,
  };
}

export function shouldShowPicksPageStatusCard(input: {
  knockoutPicksAccessible: boolean;
  readOnly: boolean;
}): boolean {
  return input.knockoutPicksAccessible && !input.readOnly;
}

/** Hide large knockout instruction cards on /account/picks when the wizard status card covers them. */
export function shouldShowKnockoutInstructionOnPicksPage(
  model: KnockoutSelectionInstructionCardModel,
): boolean {
  if (model.phase === "locking") return false;
  if (model.phase === "open" && model.gradual.allR32Confirmed) return false;
  return true;
}

/** Compact lock note during live knockout play; null when not applicable. */
export function buildPicksPageCompactLockNote(input: {
  knockoutBracketPicksUnlocked: boolean;
  matches: TournamentMatchPublicRow[] | null | undefined;
  nowMs?: number;
}): string | null {
  const nowMs = input.nowMs ?? Date.now();
  const schedule = deriveKnockoutSelectionSchedule(input.matches, nowMs);
  const gradual = getGradualKnockoutSelectionState({
    matches: input.matches,
    nowMs,
    fullRoundOf32Official: input.knockoutBracketPicksUnlocked,
  });
  const lockingPhase =
    gradual.anyR32Started || schedule.firstRoundOf32Started;
  if (!lockingPhase) return null;
  return PICKS_PAGE_COMPACT_LOCK_NOTE;
}
