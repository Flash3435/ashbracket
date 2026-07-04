import { buildParticipantDashboardMissingKnockoutPicks } from "../admin/adminKnockoutPickStatus";
import {
  getGradualKnockoutSelectionState,
  hasEditableKnockoutPicks,
} from "./gradualKnockoutUnlock";
import {
  firstActionableIncompleteKnockoutWizardStep,
  KNOCKOUT_WIZARD_BRACKET_KINDS,
  type KnockoutProgressContext,
  type KnockoutWizardBracketKindId,
} from "./knockoutMatchProgress";

export type ParticipantPicksPagePresentation = {
  title: string;
  description: string;
  /** Page-level status banner; null when no extra banner is needed. */
  banner: string | null;
  picksReadOnly: boolean;
  preBracketSelectionsLocked: boolean;
  hasActionableMissingPicks: boolean;
};

export function parseKnockoutWizardStepParam(
  value: string | null | undefined,
): KnockoutWizardBracketKindId | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (
    (KNOCKOUT_WIZARD_BRACKET_KINDS as readonly string[]).includes(normalized)
  ) {
    return normalized as KnockoutWizardBracketKindId;
  }
  return null;
}

/** True when this participant can still edit at least one knockout row (canonical missing-pick logic or global unlock). */
export function participantKnockoutPicksEditable(
  context: KnockoutProgressContext & { nowMs?: number },
): boolean {
  const gradual = getGradualKnockoutSelectionState({
    matches: context.tournamentMatches,
    teams: context.teams,
    nowMs: context.nowMs,
    fullRoundOf32Official: context.officialRoundOf32Complete,
  });
  if (
    hasEditableKnockoutPicks({
      gradual,
      fullRoundOf32Official: context.officialRoundOf32Complete,
    })
  ) {
    return true;
  }
  return (
    buildParticipantDashboardMissingKnockoutPicks(context).actionableCount > 0
  );
}

export function targetKnockoutWizardStepForParticipant(
  context: KnockoutProgressContext & { nowMs?: number },
  requestedStep?: string | null,
): KnockoutWizardBracketKindId | null {
  const parsed = parseKnockoutWizardStepParam(requestedStep);
  if (parsed) return parsed;
  return firstActionableIncompleteKnockoutWizardStep(context);
}

/** Deep-link `?step=` into the picks wizard; works in read-only browsing too. */
export function resolveInitialWizardBracketKind(
  progressContext: KnockoutProgressContext | null,
  stepParam: string | null | undefined,
): KnockoutWizardBracketKindId | null {
  if (!progressContext || !stepParam?.trim()) return null;
  return targetKnockoutWizardStepForParticipant(progressContext, stepParam);
}

export function buildParticipantKnockoutPicksHref(
  participantId: string,
  context: KnockoutProgressContext & { nowMs?: number },
): string {
  const base = `/account/picks?participant=${encodeURIComponent(participantId)}`;
  const missing = buildParticipantDashboardMissingKnockoutPicks(context);
  if (missing.actionableCount === 0) return base;
  const step = firstActionableIncompleteKnockoutWizardStep(context);
  if (!step) return base;
  return `${base}&step=${encodeURIComponent(step)}`;
}

export function buildParticipantPicksPagePresentation(input: {
  poolLocked: boolean;
  progressContext: KnockoutProgressContext & { nowMs?: number };
}): ParticipantPicksPagePresentation {
  const missing = buildParticipantDashboardMissingKnockoutPicks(
    input.progressContext,
  );
  const hasActionableMissingPicks = missing.actionableCount > 0;
  const editable = participantKnockoutPicksEditable(input.progressContext);
  const picksReadOnly = input.poolLocked && !editable;

  if (picksReadOnly) {
    return {
      title: "Your picks (read-only)",
      description:
        "Picks are locked — this is a read-only view. Confirmed knockout matchups may still be editable until each match kicks off.",
      banner:
        "Picks are locked — this is a read-only view for group stage, third-place, and bonus picks.",
      picksReadOnly: true,
      preBracketSelectionsLocked: input.poolLocked,
      hasActionableMissingPicks: false,
    };
  }

  if (input.poolLocked && hasActionableMissingPicks) {
    const focusStep = firstActionableIncompleteKnockoutWizardStep(
      input.progressContext,
    );
    const r16Focus = focusStep === "round_of_16";
    const partialLockCopy = r16Focus
      ? "Some earlier picks are locked, but these Round of 16 picks are still open until kickoff."
      : "Some earlier picks are locked, but knockout picks are still open until each match kicks off.";
    return {
      title: "Complete your picks",
      description: partialLockCopy,
      banner: partialLockCopy,
      picksReadOnly: false,
      preBracketSelectionsLocked: true,
      hasActionableMissingPicks: true,
    };
  }

  if (input.poolLocked) {
    return {
      title: "Your picks",
      description: "Update knockout picks until each match kicks off.",
      banner: null,
      picksReadOnly: false,
      preBracketSelectionsLocked: true,
      hasActionableMissingPicks: false,
    };
  }

  return {
    title: "Your picks",
    description:
      "Work through each stage step by step. Stage 1: 1st and 2nd in every group. Stage 2: one third-place advancer per group row (eight total). Stage 3: confirmed Round of 32 matchups unlock gradually, then the full knockout path once the bracket is official, plus bonus picks.",
    banner: null,
    picksReadOnly: false,
    preBracketSelectionsLocked: false,
    hasActionableMissingPicks: false,
  };
}
