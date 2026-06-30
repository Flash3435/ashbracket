import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import type { ClearedKnockoutPathPick } from "../predictions/pruneOfficialKnockoutPathPicks";
import { buildParticipantDashboardMissingKnockoutPicks } from "../admin/adminKnockoutPickStatus";
import { formatDashboardMissingKnockoutCopy } from "../dashboard/buildDashboardMissingPicks";
import { getGradualKnockoutSelectionState } from "./gradualKnockoutUnlock";
import type { KnockoutSelectionInstructionCardModel } from "./knockoutSelectionWindow";
import { deriveKnockoutSelectionSchedule } from "./knockoutSelectionWindow";
import { getKnockoutRepairActionSummary } from "./knockoutWizardAction";

export type PicksPageStatusKind =
  | "path_reconciliation"
  | "missing_picks"
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

/** Primary picks-page status card (path reconciliation → missing picks → complete). */
export function buildPicksPageStatusModel(input: {
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  officialRoundOf32Complete: boolean;
  knockoutPathRepairUnsaved?: boolean;
  knockoutPathClearedPicks?: ClearedKnockoutPathPick[];
  nowMs?: number;
}): PicksPageStatusModel {
  if (input.knockoutPathRepairUnsaved) {
    const repairSummary = getKnockoutRepairActionSummary(
      {
        slots: input.slots,
        teams: input.teams,
        tournamentMatches: input.tournamentMatches,
        officialRoundOf32Complete: input.officialRoundOf32Complete,
        nowMs: input.nowMs,
      },
      input.knockoutPathClearedPicks ?? [],
    );
    return {
      kind: "path_reconciliation",
      headline: repairSummary.headline,
      detail: repairSummary.detail,
      tone: "warning",
      ctaLabel: repairSummary.ctaLabel,
      ctaAction: "save",
    };
  }

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
