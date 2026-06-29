import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  buildGradualR32MatchPickRows,
  countGradualR32MatchupsFilled,
  getGradualKnockoutSelectionState,
  isFullKnockoutBracketPicksUnlocked,
  shouldUseR32MatchRowUi,
  type GradualKnockoutSelectionState,
} from "./gradualKnockoutUnlock";
import {
  buildKnockoutMatchPickRows,
  countKnockoutMatchupsFilled,
  countPickableKnockoutMissing,
  knockoutMatchStepComplete,
  usesKnockoutMatchPickRows,
  type KnockoutWizardBracketKind,
} from "./knockoutMatchPickRows";

export const KNOCKOUT_WIZARD_BRACKET_KINDS = [
  "round_of_32",
  "round_of_16",
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "champion",
] as const;

export type KnockoutWizardBracketKindId =
  (typeof KNOCKOUT_WIZARD_BRACKET_KINDS)[number];

export type KnockoutProgressContext = {
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  /** Whether organizers published the official Round of 32 (all 32 teams). */
  officialRoundOf32Complete: boolean;
  nowMs?: number;
};

export type KnockoutStepProgress = {
  bracketKind: KnockoutWizardBracketKindId;
  filled: number;
  total: number;
  missing: number;
  complete: boolean;
};

export type KnockoutMatchProgress = {
  filled: number;
  total: number;
  missing: number;
  complete: boolean;
  /** True when match-row logic applies (R32 and/or later rounds). */
  useMatchBased: boolean;
  fullBracketPicksUnlocked: boolean;
  steps: KnockoutStepProgress[];
};

export type ResolvedKnockoutProgressContext = KnockoutProgressContext & {
  gradual: GradualKnockoutSelectionState;
  fullBracketPicksUnlocked: boolean;
  gradualR32MatchRows: boolean;
  gradualR32Pickable: boolean;
};

export function resolveKnockoutProgressContext(
  input: KnockoutProgressContext,
): ResolvedKnockoutProgressContext {
  const gradual = getGradualKnockoutSelectionState({
    matches: input.tournamentMatches,
    teams: input.teams,
    nowMs: input.nowMs,
    fullRoundOf32Official: input.officialRoundOf32Complete,
  });
  const gradualR32Pickable = gradual.pickableCount > 0;
  const fullBracketPicksUnlocked = isFullKnockoutBracketPicksUnlocked({
    officialRoundOf32Complete: input.officialRoundOf32Complete,
    gradual,
  });
  const gradualR32MatchRows = shouldUseR32MatchRowUi({
    tournamentMatches: input.tournamentMatches,
    knockoutBracketPicksUnlocked: input.officialRoundOf32Complete,
    gradualPickableCount: gradual.pickableCount,
  });
  return {
    ...input,
    gradual,
    fullBracketPicksUnlocked,
    gradualR32MatchRows,
    gradualR32Pickable,
  };
}

function stepProgressFromCounts(
  bracketKind: KnockoutWizardBracketKindId,
  filled: number,
  total: number,
): KnockoutStepProgress {
  const missing = Math.max(0, total - filled);
  return {
    bracketKind,
    filled,
    total,
    missing,
    complete: total === 0 || missing === 0,
  };
}

function gradualR32StepProgress(
  ctx: ResolvedKnockoutProgressContext,
): KnockoutStepProgress {
  const rows = buildGradualR32MatchPickRows({
    slots: ctx.slots,
    state: ctx.gradual,
    teams: ctx.teams,
    fullRoundOf32Official: ctx.officialRoundOf32Complete,
  });
  const pickableIndices = rows
    .filter((r) => r.lockReason === "pickable")
    .map((r) => r.matchIndex);
  const total = pickableIndices.length;
  const filled =
    total === 0
      ? 0
      : countGradualR32MatchupsFilled({
          slots: ctx.slots,
          state: ctx.gradual,
          teams: ctx.teams,
          matchIndices: pickableIndices,
        });
  const complete =
    total === 0 ||
    pickableIndices.every((matchIndex) => {
      const row = rows.find((r) => r.matchIndex === matchIndex);
      return Boolean(row?.winnerTeamId);
    });
  return { bracketKind: "round_of_32", filled, total, missing: Math.max(0, total - filled), complete };
}

function r32WinnerStorageStepProgress(
  ctx: ResolvedKnockoutProgressContext,
): KnockoutStepProgress {
  if (ctx.gradualR32MatchRows) {
    return gradualR32StepProgress(ctx);
  }

  const r16WinnerRows = ctx.slots.filter(
    (s) => s.predictionKind === "round_of_16" && s.teamId.trim(),
  );
  if (r16WinnerRows.length > 0) {
    return stepProgressFromCounts(
      "round_of_32",
      r16WinnerRows.length,
      16,
    );
  }

  return legacyR32StepProgress(ctx.slots);
}

function legacyR32StepProgress(slots: KnockoutPickSlotDraft[]): KnockoutStepProgress {
  const rows = slots.filter((s) => s.predictionKind === "round_of_32");
  const filled = rows.filter((s) => s.teamId.trim()).length;
  return stepProgressFromCounts("round_of_32", filled, rows.length);
}

function matchPickStepProgress(
  bracketKind: KnockoutWizardBracketKind,
  ctx: ResolvedKnockoutProgressContext,
): KnockoutStepProgress {
  const rows = buildKnockoutMatchPickRows({
    bracketKind,
    slots: ctx.slots,
    teams: ctx.teams,
    tournamentMatches: ctx.tournamentMatches,
    gradual: ctx.gradual,
    knockoutBracketPicksUnlocked: ctx.officialRoundOf32Complete,
    nowMs: ctx.nowMs,
  });
  const pickable = rows.filter((r) => r.lockReason === "pickable");
  const filled = countKnockoutMatchupsFilled(rows, { onlyPickable: true });
  const mappedKind: KnockoutWizardBracketKindId =
    bracketKind === "finalist" ? "champion" : bracketKind;
  return {
    bracketKind: mappedKind,
    filled,
    total: pickable.length,
    missing: Math.max(0, pickable.length - filled),
    complete: knockoutMatchStepComplete(rows),
  };
}

/** Mirrors KnockoutPicksWizard step completion for one bracket step. */
export function isKnockoutWizardStepComplete(
  bracketKind: KnockoutWizardBracketKindId,
  ctx: ResolvedKnockoutProgressContext,
): boolean {
  if (bracketKind === "round_of_32") {
    if (ctx.gradualR32MatchRows) {
      return gradualR32StepProgress(ctx).complete;
    }
    return r32WinnerStorageStepProgress(ctx).complete;
  }

  if (bracketKind === "champion") {
    if (!ctx.fullBracketPicksUnlocked) return true;
    return matchPickStepProgress("finalist", ctx).complete;
  }

  if (
    ctx.fullBracketPicksUnlocked &&
    usesKnockoutMatchPickRows(bracketKind, true)
  ) {
    return matchPickStepProgress(bracketKind as KnockoutWizardBracketKind, ctx)
      .complete;
  }

  const rows = ctx.slots.filter((s) => s.predictionKind === bracketKind);
  return rows.length > 0 && rows.every((s) => s.teamId.trim() !== "");
}

function progressSteps(
  ctx: ResolvedKnockoutProgressContext,
): KnockoutWizardBracketKindId[] {
  if (ctx.fullBracketPicksUnlocked) {
    return [
      "round_of_32",
      "round_of_16",
      "quarterfinalist",
      "semifinalist",
      "finalist",
    ];
  }
  if (ctx.gradualR32Pickable) {
    return ["round_of_32"];
  }
  return [];
}

function wizardCompletionSteps(
  ctx: ResolvedKnockoutProgressContext,
): KnockoutWizardBracketKindId[] {
  const steps = progressSteps(ctx);
  if (ctx.fullBracketPicksUnlocked) {
    return [...steps, "champion"];
  }
  return steps;
}

/** Aggregate knockout progress aligned with match-row wizard steps. */
export function buildKnockoutMatchProgress(
  input: KnockoutProgressContext,
): KnockoutMatchProgress {
  const ctx = resolveKnockoutProgressContext(input);
  const steps: KnockoutStepProgress[] = [];

  for (const bracketKind of progressSteps(ctx)) {
    if (bracketKind === "round_of_32") {
      steps.push(r32WinnerStorageStepProgress(ctx));
      continue;
    }
    if (usesKnockoutMatchPickRows(bracketKind, true)) {
      steps.push(
        matchPickStepProgress(bracketKind as KnockoutWizardBracketKind, ctx),
      );
      continue;
    }
    const rows = ctx.slots.filter((s) => s.predictionKind === bracketKind);
    const filled = rows.filter((s) => s.teamId.trim()).length;
    steps.push(stepProgressFromCounts(bracketKind, filled, rows.length));
  }

  const filled = steps.reduce((sum, s) => sum + s.filled, 0);
  const total = steps.reduce((sum, s) => sum + s.total, 0);
  const missing = steps.reduce((sum, s) => sum + s.missing, 0);
  const complete =
    steps.length === 0 || steps.every((s) => s.complete);
  const useMatchBased =
    ctx.gradualR32MatchRows ||
    (ctx.fullBracketPicksUnlocked &&
      steps.some((s) => s.bracketKind !== "round_of_32"));

  return {
    filled,
    total,
    missing,
    complete,
    useMatchBased,
    fullBracketPicksUnlocked: ctx.fullBracketPicksUnlocked,
    steps,
  };
}

export function firstIncompleteKnockoutWizardStep(
  input: KnockoutProgressContext,
): KnockoutWizardBracketKindId | null {
  const ctx = resolveKnockoutProgressContext(input);
  for (const bracketKind of wizardCompletionSteps(ctx)) {
    if (!isKnockoutWizardStepComplete(bracketKind, ctx)) {
      return bracketKind;
    }
  }
  return null;
}

function pickableMissingInWizardStep(
  bracketKind: KnockoutWizardBracketKindId,
  ctx: ResolvedKnockoutProgressContext,
): number {
  if (bracketKind === "round_of_32") {
    return r32WinnerStorageStepProgress(ctx).missing;
  }

  if (bracketKind === "champion") {
    if (!ctx.fullBracketPicksUnlocked) return 0;
    const rows = buildKnockoutMatchPickRows({
      bracketKind: "finalist",
      slots: ctx.slots,
      teams: ctx.teams,
      tournamentMatches: ctx.tournamentMatches,
      gradual: ctx.gradual,
      knockoutBracketPicksUnlocked: ctx.officialRoundOf32Complete,
      nowMs: ctx.nowMs,
    });
    return countPickableKnockoutMissing(rows);
  }

  if (
    ctx.fullBracketPicksUnlocked &&
    usesKnockoutMatchPickRows(bracketKind, true)
  ) {
    const rows = buildKnockoutMatchPickRows({
      bracketKind: bracketKind as KnockoutWizardBracketKind,
      slots: ctx.slots,
      teams: ctx.teams,
      tournamentMatches: ctx.tournamentMatches,
      gradual: ctx.gradual,
      knockoutBracketPicksUnlocked: ctx.officialRoundOf32Complete,
      nowMs: ctx.nowMs,
    });
    return countPickableKnockoutMissing(rows);
  }

  const rows = ctx.slots.filter((s) => s.predictionKind === bracketKind);
  return rows.filter((s) => !s.teamId.trim()).length;
}

/** First wizard step with a pickable matchup or slot still missing a pick. */
export function firstActionableIncompleteKnockoutWizardStep(
  input: KnockoutProgressContext,
): KnockoutWizardBracketKindId | null {
  const ctx = resolveKnockoutProgressContext(input);
  for (const bracketKind of wizardCompletionSteps(ctx)) {
    if (pickableMissingInWizardStep(bracketKind, ctx) > 0) {
      return bracketKind;
    }
  }
  return null;
}
