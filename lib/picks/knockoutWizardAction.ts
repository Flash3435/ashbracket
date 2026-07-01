import type { KnockoutProgressionPredictionKind } from "../predictions/knockoutProgressionKinds";
import type { ClearedKnockoutPathPick } from "../predictions/pruneOfficialKnockoutPathPicks";
import { isKnockoutPickLockedOut } from "../predictions/knockoutPickStatus";
import {
  blockedKnockoutStepGateCopy,
  clearedPickRowKeySet,
  explainBlockedKnockoutMatchRow,
  explainLockedClearedPickRow,
  feederMatchupLabel,
  firstBlockedRowExplanationForStep,
  lockedOutPickCardBody,
  LOCKED_OUT_PICK_HEADLINE,
} from "./knockoutBlockedRowExplanation";
import {
  buildKnockoutMatchPickRows,
  formatMissingKnockoutDependencyLabel,
  readConfirmedKnockoutMatchWinner,
  type KnockoutWizardBracketKind,
  usesKnockoutMatchPickRows,
  validatedKnockoutMatchWinner,
} from "./knockoutMatchPickRows";
import {
  firstActionableIncompleteKnockoutWizardStep,
  resolveKnockoutProgressContext,
  type KnockoutProgressContext,
  type KnockoutWizardBracketKindId,
} from "./knockoutMatchProgress";

export type KnockoutWizardActionReason =
  | "missing_pick"
  | "repaired_cleared_pick"
  | "upstream_missing"
  | "locked_unfixable";

export type KnockoutWizardActionNeeded = {
  bracketKind: KnockoutWizardBracketKindId;
  fifaMatchNo: number | null;
  matchupLabel: string | null;
  reason: KnockoutWizardActionReason;
  statusCardDetail: string;
  sectionGateMessage: string;
};

const WIZARD_STEP_SHORT_LABEL: Partial<Record<KnockoutWizardBracketKindId, string>> =
  {
    round_of_16: "Round of 16",
    quarterfinalist: "quarter-final",
    semifinalist: "semi-final",
    finalist: "final",
    champion: "champion",
  };

const DOWNSTREAM_WIZARD_STEPS: KnockoutWizardBracketKindId[] = [
  "round_of_16",
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "champion",
];

function wizardBracketKindForSavedPick(
  kind: KnockoutProgressionPredictionKind,
): KnockoutWizardBracketKindId | null {
  switch (kind) {
    case "round_of_16":
      return "round_of_32";
    case "quarterfinalist":
      return "round_of_16";
    case "semifinalist":
      return "quarterfinalist";
    case "finalist":
      return "semifinalist";
    case "champion":
      return "champion";
    default:
      return null;
  }
}

function matchBracketKindForWizardStep(
  bracketKind: KnockoutWizardBracketKindId,
): KnockoutWizardBracketKind | null {
  if (bracketKind === "champion") return "finalist";
  if (bracketKind === "round_of_32") return null;
  if (usesKnockoutMatchPickRows(bracketKind, true)) {
    return bracketKind as KnockoutWizardBracketKind;
  }
  return null;
}

function matchIndexForSavedPick(pick: ClearedKnockoutPathPick): number {
  if (pick.predictionKind === "champion") return 0;
  return Math.max(0, parseInt(pick.slotKey ?? "1", 10) - 1);
}

function matchupLabelFromRow(
  row: ReturnType<typeof buildKnockoutMatchPickRows>[number] | undefined,
): string | null {
  if (!row) return null;
  return feederMatchupLabel(row);
}

function buildInputFromContext(ctx: ReturnType<typeof resolveKnockoutProgressContext>) {
  return {
    slots: ctx.slots,
    teams: ctx.teams,
    tournamentMatches: ctx.tournamentMatches,
    gradual: ctx.gradual,
    knockoutBracketPicksUnlocked: ctx.officialRoundOf32Complete,
    nowMs: ctx.nowMs,
    clearedPickRowKeys: ctx.clearedPickRowKeys,
  };
}

function buildRowExplanationOptions(
  ctx: ReturnType<typeof resolveKnockoutProgressContext>,
) {
  return ctx.clearedPickRowKeys
    ? { clearedPickRowKeys: ctx.clearedPickRowKeys }
    : undefined;
}

function actionFromMatchRow(
  bracketKind: KnockoutWizardBracketKindId,
  matchKind: KnockoutWizardBracketKind,
  row: ReturnType<typeof buildKnockoutMatchPickRows>[number],
  reason: KnockoutWizardActionReason,
  ctx: ReturnType<typeof resolveKnockoutProgressContext>,
): KnockoutWizardActionNeeded {
  const matchup = matchupLabelFromRow(row);
  const stepLabel = WIZARD_STEP_SHORT_LABEL[bracketKind] ?? "knockout";
  const input = { ...buildInputFromContext(ctx), bracketKind: matchKind };
  const gateMessage =
    reason === "repaired_cleared_pick"
      ? formatMissingKnockoutDependencyLabel(row, { clearedByRepair: true })
      : blockedKnockoutRowUserCopyFromRow(row, matchKind, input, ctx);

  let statusCardDetail: string;
  if (reason === "repaired_cleared_pick") {
    statusCardDetail = matchup
      ? `One ${stepLabel} pick was cleared. Pick a winner for ${matchup}, then save.`
      : `One ${stepLabel} pick was cleared. Review your bracket, then save.`;
  } else if (matchup) {
    statusCardDetail = `Pick a winner for ${matchup}, then save.`;
  } else if (row.fifaMatchNo > 0) {
    statusCardDetail = `Review M${row.fifaMatchNo}, then save.`;
  } else {
    statusCardDetail = `One ${stepLabel} pick still needs review.`;
  }

  return {
    bracketKind,
    fifaMatchNo: row.fifaMatchNo > 0 ? row.fifaMatchNo : null,
    matchupLabel: matchup,
    reason,
    statusCardDetail,
    sectionGateMessage: gateMessage,
  };
}

function blockedKnockoutRowUserCopyFromRow(
  row: ReturnType<typeof buildKnockoutMatchPickRows>[number],
  matchKind: KnockoutWizardBracketKind,
  input: ReturnType<typeof buildInputFromContext> & {
    bracketKind: KnockoutWizardBracketKind;
  },
  ctx: ReturnType<typeof resolveKnockoutProgressContext>,
): string {
  if (row.lockReason === "incomplete") {
    return explainBlockedKnockoutMatchRow(
      row,
      matchKind,
      input,
      buildRowExplanationOptions(ctx),
    ).userFacingCopy;
  }
  return formatMissingKnockoutDependencyLabel(row);
}

function downstreamStepBlockedByClearedFeeder(
  ctx: ReturnType<typeof resolveKnockoutProgressContext>,
  clearedFeederMatchKind: KnockoutWizardBracketKind,
  clearedFeederIndex: number,
): {
  wizardStep: KnockoutWizardBracketKindId;
  matchKind: KnockoutWizardBracketKind;
  row: ReturnType<typeof buildKnockoutMatchPickRows>[number];
} | null {
  const baseInput = buildInputFromContext(ctx);
  const clearedFeederMatchNo =
    (clearedFeederMatchKind === "round_of_16"
      ? 89
      : clearedFeederMatchKind === "quarterfinalist"
        ? 97
        : clearedFeederMatchKind === "semifinalist"
          ? 101
          : 104) + clearedFeederIndex;

  for (const wizardStep of DOWNSTREAM_WIZARD_STEPS) {
    const matchKind = matchBracketKindForWizardStep(wizardStep);
    if (!matchKind) continue;
    const rows = buildKnockoutMatchPickRows({
      ...baseInput,
      bracketKind: matchKind,
    });
    for (const row of rows) {
      if (row.lockReason !== "incomplete") continue;
      const explanation = explainBlockedKnockoutMatchRow(
        row,
        matchKind,
        { ...baseInput, bracketKind: matchKind },
        buildRowExplanationOptions(ctx),
      );
      if (explanation.missingFeederMatchNo === clearedFeederMatchNo) {
        return { wizardStep, matchKind, row };
      }
    }
  }
  return null;
}

function actionFromLockedClearedPick(
  ctx: ReturnType<typeof resolveKnockoutProgressContext>,
  pick: ClearedKnockoutPathPick,
  row: ReturnType<typeof buildKnockoutMatchPickRows>[number],
  matchKind: KnockoutWizardBracketKind,
): KnockoutWizardActionNeeded {
  const explanationOptions = buildRowExplanationOptions(ctx);
  const feederExplanation = explainLockedClearedPickRow(row, explanationOptions);
  const downstream = downstreamStepBlockedByClearedFeeder(
    ctx,
    matchKind,
    matchIndexForSavedPick(pick),
  );
  const targetStep =
    downstream?.wizardStep ??
    wizardBracketKindForSavedPick(pick.predictionKind)!;
  const targetRow = downstream?.row ?? row;
  const targetMatchKind = downstream?.matchKind ?? matchKind;
  const blockedCopy = downstream
    ? explainBlockedKnockoutMatchRow(
        targetRow,
        targetMatchKind,
        { ...buildInputFromContext(ctx), bracketKind: targetMatchKind },
        explanationOptions,
      ).userFacingCopy
    : feederExplanation.userFacingCopy;

  const feederLabel = feederExplanation.missingFeederLabel;
  const statusCardDetail = lockedOutPickCardBody(feederLabel);

  return {
    bracketKind: targetStep,
    fifaMatchNo:
      targetRow.fifaMatchNo > 0
        ? targetRow.fifaMatchNo
        : row.fifaMatchNo > 0
          ? row.fifaMatchNo
          : null,
    matchupLabel: feederLabel ?? matchupLabelFromRow(targetRow),
    reason: "locked_unfixable",
    statusCardDetail,
    sectionGateMessage: blockedCopy,
  };
}

function findClearedPickAction(
  ctx: ReturnType<typeof resolveKnockoutProgressContext>,
  clearedPicks: ClearedKnockoutPathPick[],
): KnockoutWizardActionNeeded | null {
  const baseInput = buildInputFromContext(ctx);

  for (const pick of clearedPicks) {
    const slotRow = ctx.slots.find((s) => s.rowKey === pick.rowKey);
    if (!slotRow) continue;

    if (isKnockoutPickLockedOut(slotRow)) {
      const bracketKind = wizardBracketKindForSavedPick(pick.predictionKind);
      if (!bracketKind) continue;
      const matchKind = matchBracketKindForWizardStep(bracketKind);
      if (!matchKind) continue;
      const rows = buildKnockoutMatchPickRows({
        ...baseInput,
        bracketKind: matchKind,
      });
      const row = rows[matchIndexForSavedPick(pick)];
      if (!row) continue;
      return actionFromLockedClearedPick(ctx, pick, row, matchKind);
    }

    const stillEmpty = !slotRow.teamId.trim();
    if (!stillEmpty) continue;

    const bracketKind = wizardBracketKindForSavedPick(pick.predictionKind);
    if (!bracketKind) continue;

    const matchKind = matchBracketKindForWizardStep(bracketKind);
    if (!matchKind) continue;

    const rows = buildKnockoutMatchPickRows({
      ...baseInput,
      bracketKind: matchKind,
    });
    const row = rows[matchIndexForSavedPick(pick)];
    if (!row) continue;

    if (row.lockReason === "pickable" && !validatedKnockoutMatchWinner(row)) {
      return actionFromMatchRow(
        bracketKind,
        matchKind,
        row,
        "repaired_cleared_pick",
        ctx,
      );
    }

    if (row.lockReason === "started" || row.lockReason === "frozen") {
      if (
        !readConfirmedKnockoutMatchWinner(row, matchKind, {
          ...baseInput,
          bracketKind: matchKind,
        })
      ) {
        return actionFromLockedClearedPick(ctx, pick, row, matchKind);
      }
    }
  }

  return null;
}

function findFirstPickableMissingAction(
  ctx: ReturnType<typeof resolveKnockoutProgressContext>,
): KnockoutWizardActionNeeded | null {
  const baseInput = buildInputFromContext(ctx);
  const targetStep = firstActionableIncompleteKnockoutWizardStep({
    slots: ctx.slots,
    teams: ctx.teams,
    tournamentMatches: ctx.tournamentMatches,
    officialRoundOf32Complete: ctx.officialRoundOf32Complete,
    nowMs: ctx.nowMs,
    clearedPickRowKeys: ctx.clearedPickRowKeys,
  });
  if (!targetStep) return null;

  const matchKind = matchBracketKindForWizardStep(targetStep);
  if (!matchKind) return null;

  const rows = buildKnockoutMatchPickRows({
    ...baseInput,
    bracketKind: matchKind,
  });

  const missing = rows.filter(
    (r) => r.lockReason === "pickable" && !validatedKnockoutMatchWinner(r),
  );
  if (missing.length === 0) return null;

  const row = missing[0]!;
  return actionFromMatchRow(targetStep, matchKind, row, "missing_pick", ctx);
}

function findBlockedDownstreamAction(
  ctx: ReturnType<typeof resolveKnockoutProgressContext>,
): KnockoutWizardActionNeeded | null {
  const baseInput = buildInputFromContext(ctx);
  for (const wizardStep of DOWNSTREAM_WIZARD_STEPS) {
    const matchKind = matchBracketKindForWizardStep(wizardStep);
    if (!matchKind) continue;
    const input = { ...baseInput, bracketKind: matchKind };
    const explanation = firstBlockedRowExplanationForStep(
      matchKind,
      input,
      buildRowExplanationOptions(ctx),
    );
    if (!explanation) continue;
    if (explanation.userAction === "wait_for_result") continue;
    const row = buildKnockoutMatchPickRows(input).find(
      (r) => r.fifaMatchNo === explanation.blockedRowMatchNo,
    );
    if (!row) continue;
    return {
      bracketKind: wizardStep,
      fifaMatchNo: explanation.blockedRowMatchNo || null,
      matchupLabel: explanation.missingFeederLabel,
      reason:
        explanation.userAction === "locked_out"
          ? "locked_unfixable"
          : explanation.userAction === "pick_upstream"
            ? "upstream_missing"
            : "missing_pick",
      statusCardDetail: explanation.userFacingCopy,
      sectionGateMessage: explanation.userFacingCopy,
    };
  }
  return null;
}

/** First user-facing knockout action from repaired draft state. */
export function findFirstKnockoutWizardActionNeeded(
  input: KnockoutProgressContext,
  options?: { clearedPicks?: ClearedKnockoutPathPick[] },
): KnockoutWizardActionNeeded | null {
  const ctx = resolveKnockoutProgressContext({
    ...input,
    clearedPickRowKeys:
      input.clearedPickRowKeys ??
      (options?.clearedPicks?.length
        ? clearedPickRowKeySet(options.clearedPicks)
        : undefined),
  });

  if (options?.clearedPicks?.length) {
    const clearedAction = findClearedPickAction(ctx, options.clearedPicks);
    if (clearedAction) return clearedAction;
  }

  const pickableAction = findFirstPickableMissingAction(ctx);
  if (pickableAction) return pickableAction;

  if (ctx.clearedPickRowKeys?.size) {
    return findBlockedDownstreamAction(ctx);
  }

  return null;
}

/** Status-card copy when official-path repair left unsaved draft changes. */
export function getKnockoutRepairActionSummary(
  input: KnockoutProgressContext,
  clearedPicks: ClearedKnockoutPathPick[],
): {
  headline: string;
  detail: string;
  ctaLabel: string | null;
  action: KnockoutWizardActionNeeded | null;
} {
  const action = findFirstKnockoutWizardActionNeeded(input, { clearedPicks });
  if (action?.reason === "locked_unfixable") {
    return {
      headline: LOCKED_OUT_PICK_HEADLINE,
      detail: lockedOutPickCardBody(action.matchupLabel),
      ctaLabel: null,
      action,
    };
  }
  if (action) {
    return {
      headline: "Review updated knockout picks",
      detail: action.statusCardDetail,
      ctaLabel: "Save picks",
      action,
    };
  }
  return {
    headline: "Review updated knockout picks",
    detail:
      "Some later-round picks no longer fit the official path and were cleared.",
    ctaLabel: null,
    action: null,
  };
}

/** True when cleared picks include at least one locked-out pick with no participant action. */
export function hasLockedOutKnockoutPicks(
  input: KnockoutProgressContext,
  clearedPicks: ClearedKnockoutPathPick[],
): boolean {
  const action = findFirstKnockoutWizardActionNeeded(input, { clearedPicks });
  return action?.reason === "locked_unfixable";
}

/** True when path repair requires the participant to pick or save (unlocked editable gaps). */
export function requiresParticipantKnockoutRepairSave(
  input: KnockoutProgressContext,
  clearedPicks: ClearedKnockoutPathPick[],
): boolean {
  if (clearedPicks.length === 0) return false;

  const hasEditableClearedSlot = clearedPicks.some((pick) => {
    const slot = input.slots.find((s) => s.rowKey === pick.rowKey);
    if (!slot) return false;
    if (isKnockoutPickLockedOut(slot)) return false;
    return !slot.teamId.trim();
  });
  if (!hasEditableClearedSlot) return false;

  const action = findFirstKnockoutWizardActionNeeded(input, { clearedPicks });
  if (action?.reason === "locked_unfixable") return false;
  if (action?.reason === "repaired_cleared_pick") return true;
  // Persist client-side repair clearing even when later steps are waiting upstream.
  return true;
}

/** Whether the participant should see Save / unsaved-changes for the current draft. */
export function resolveParticipantKnockoutDraftSaveRequired(input: {
  draftSignature: string;
  savedSignature: string;
  userEditedPicks: boolean;
  knockoutPathRepairUnsaved?: boolean;
  progressContext: KnockoutProgressContext;
  clearedPicks?: ClearedKnockoutPathPick[];
}): boolean {
  if (
    input.knockoutPathRepairUnsaved &&
    (input.clearedPicks?.length ?? 0) > 0 &&
    requiresParticipantKnockoutRepairSave(
      input.progressContext,
      input.clearedPicks!,
    )
  ) {
    return true;
  }
  return (
    input.userEditedPicks && input.draftSignature !== input.savedSignature
  );
}

/** Friendly summary for a cleared or missing pick (status card / gates). */
export function getMissingOrClearedKnockoutPickSummary(
  input: KnockoutProgressContext,
  options?: { clearedPicks?: ClearedKnockoutPathPick[] },
): string | null {
  return findFirstKnockoutWizardActionNeeded(input, options)?.statusCardDetail ?? null;
}

export function blockedKnockoutWizardStepGateCopy(
  bracketKind: KnockoutWizardBracketKindId,
  ctx: ReturnType<typeof resolveKnockoutProgressContext>,
): string | null {
  const matchKind = matchBracketKindForWizardStep(bracketKind);
  if (!matchKind) return null;
  return blockedKnockoutStepGateCopy(
    matchKind,
    {
      ...buildInputFromContext(ctx),
      bracketKind: matchKind,
    },
    buildRowExplanationOptions(ctx),
  );
}
