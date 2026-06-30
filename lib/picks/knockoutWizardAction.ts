import type { KnockoutProgressionPredictionKind } from "../predictions/knockoutProgressionKinds";
import type { ClearedKnockoutPathPick } from "../predictions/pruneOfficialKnockoutPathPicks";
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
  const line = row.display.emptyPrimaryLine;
  if (
    !line ||
    line === "Pick needed" ||
    line.startsWith("Complete ") ||
    line.startsWith("This pick was cleared")
  ) {
    return row.fifaMatchNo > 0 ? `M${row.fifaMatchNo}` : null;
  }
  if (line.includes(" vs ")) return line;
  return row.fifaMatchNo > 0 ? `M${row.fifaMatchNo}` : line;
}

function buildInputFromContext(ctx: ReturnType<typeof resolveKnockoutProgressContext>) {
  return {
    slots: ctx.slots,
    teams: ctx.teams,
    tournamentMatches: ctx.tournamentMatches,
    gradual: ctx.gradual,
    knockoutBracketPicksUnlocked: ctx.officialRoundOf32Complete,
    nowMs: ctx.nowMs,
  };
}

function actionFromMatchRow(
  bracketKind: KnockoutWizardBracketKindId,
  matchKind: KnockoutWizardBracketKind,
  row: ReturnType<typeof buildKnockoutMatchPickRows>[number],
  reason: KnockoutWizardActionReason,
): KnockoutWizardActionNeeded {
  const matchup = matchupLabelFromRow(row);
  const stepLabel = WIZARD_STEP_SHORT_LABEL[bracketKind] ?? "knockout";
  const gateMessage =
    reason === "repaired_cleared_pick"
      ? formatMissingKnockoutDependencyLabel(row, { clearedByRepair: true })
      : formatMissingKnockoutDependencyLabel(row);

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

function findClearedPickAction(
  ctx: ReturnType<typeof resolveKnockoutProgressContext>,
  clearedPicks: ClearedKnockoutPathPick[],
): KnockoutWizardActionNeeded | null {
  const baseInput = buildInputFromContext(ctx);

  for (const pick of clearedPicks) {
    const stillEmpty = !ctx.slots.some(
      (s) => s.rowKey === pick.rowKey && s.teamId.trim(),
    );
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
      );
    }

    if (row.lockReason === "started" || row.lockReason === "frozen") {
      if (
        !readConfirmedKnockoutMatchWinner(row, matchKind, {
          ...baseInput,
          bracketKind: matchKind,
        })
      ) {
        return {
          bracketKind,
          fifaMatchNo: row.fifaMatchNo > 0 ? row.fifaMatchNo : null,
          matchupLabel: matchupLabelFromRow(row),
          reason: "locked_unfixable",
          statusCardDetail:
            "Some cleared picks are locked by official results. Save to confirm the rest of your bracket.",
          sectionGateMessage:
            row.display.statusLine ??
            "This pick is locked because feeder match results are official.",
        };
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
  return actionFromMatchRow(targetStep, matchKind, row, "missing_pick");
}

/** First user-facing knockout action from repaired draft state. */
export function findFirstKnockoutWizardActionNeeded(
  input: KnockoutProgressContext,
  options?: { clearedPicks?: ClearedKnockoutPathPick[] },
): KnockoutWizardActionNeeded | null {
  const ctx = resolveKnockoutProgressContext(input);

  if (options?.clearedPicks?.length) {
    const clearedAction = findClearedPickAction(ctx, options.clearedPicks);
    if (clearedAction) return clearedAction;
  }

  return findFirstPickableMissingAction(ctx);
}

/** Status-card copy when official-path repair left unsaved draft changes. */
export function getKnockoutRepairActionSummary(
  input: KnockoutProgressContext,
  clearedPicks: ClearedKnockoutPathPick[],
): { headline: string; detail: string; action: KnockoutWizardActionNeeded | null } {
  const action = findFirstKnockoutWizardActionNeeded(input, { clearedPicks });
  if (action) {
    return {
      headline: "Review updated knockout picks",
      detail: action.statusCardDetail,
      action,
    };
  }
  return {
    headline: "Review updated knockout picks",
    detail:
      "Some later-round picks no longer fit the official path and were cleared. Save your picks to confirm the updated bracket.",
    action: null,
  };
}

/** Friendly summary for a cleared or missing pick (status card / gates). */
export function getMissingOrClearedKnockoutPickSummary(
  input: KnockoutProgressContext,
  options?: { clearedPicks?: ClearedKnockoutPathPick[] },
): string | null {
  return findFirstKnockoutWizardActionNeeded(input, options)?.statusCardDetail ?? null;
}
