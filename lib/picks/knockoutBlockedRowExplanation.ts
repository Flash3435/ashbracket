import { knockoutParticipantSlotPair } from "../bracket/wc2026KnockoutPairings";
import type { ClearedKnockoutPathPick } from "../predictions/pruneOfficialKnockoutPathPicks";
import {
  buildKnockoutMatchPickRows,
  formatMissingKnockoutDependencyLabel,
  incompleteR16MatchMessage,
  knockoutMatchStepDef,
  officialKnockoutMatchResultWinner,
  readConfirmedKnockoutMatchWinner,
  validatedKnockoutMatchWinner,
  type BuildKnockoutMatchPickRowsInput,
  type KnockoutMatchPickRow,
  type KnockoutWizardBracketKind,
} from "./knockoutMatchPickRows";

export type KnockoutFeederBlockState =
  | "missing_pick_editable"
  | "official_result_missing"
  | "official_result_resolved"
  | "cleared_pick_locked"
  | "stale_or_invalid_team"
  | "unknown";

export type KnockoutBlockedUserAction =
  | "pick_upstream"
  | "pick_this_row"
  | "wait_for_result"
  | "locked_out"
  | "contact_admin";

export type BlockedKnockoutMatchExplanation = {
  blockedRowMatchNo: number;
  missingFeederMatchNo: number | null;
  missingFeederLabel: string | null;
  feederState: KnockoutFeederBlockState;
  userAction: KnockoutBlockedUserAction;
  userFacingCopy: string;
};

export type ExplainBlockedKnockoutRowOptions = {
  clearedPickRowKeys?: ReadonlySet<string>;
};

export const LOCKED_OUT_PICK_HEADLINE = "One pick is out";

/** @deprecated Use LOCKED_OUT_PICK_HEADLINE */
export const LOCKED_CLEARED_REPAIR_HEADLINE = LOCKED_OUT_PICK_HEADLINE;

export function lockedOutPickCardBody(feederLabel: string | null): string {
  if (feederLabel) {
    return `Your ${feederLabel} pick is locked and can no longer advance. No action is needed.`;
  }
  return "One of your picks is locked and can no longer advance. No action is needed.";
}

/** @deprecated Use lockedOutPickCardBody */
export const lockedClearedRepairCardBody = lockedOutPickCardBody;

function lockedOutDirectBlockedCopy(
  blockedRef: string,
  feederLabel: string | null,
): string {
  if (feederLabel) {
    return `This path depended on ${feederLabel} and is no longer alive.`;
  }
  return "This path is no longer alive.";
}

function lockedOutIndirectBlockedCopy(
  blockedRef: string,
  feederLabel: string | null,
): string {
  if (feederLabel) {
    return `This pick is out because the ${feederLabel} feeder pick was eliminated.`;
  }
  return "This pick is out because the feeder pick was eliminated.";
}

export function clearedPickRowKeySet(
  cleared: ClearedKnockoutPathPick[],
): Set<string> {
  return new Set(cleared.map((c) => c.rowKey));
}

function buildInputForBracketKind(
  input: BuildKnockoutMatchPickRowsInput,
  bracketKind: KnockoutWizardBracketKind,
): BuildKnockoutMatchPickRowsInput {
  return { ...input, bracketKind };
}

function confirmedR32WinnerContextFromBuildInput(
  input: BuildKnockoutMatchPickRowsInput,
) {
  return {
    teams: input.teams,
    tournamentMatches: input.tournamentMatches,
    gradual: input.gradual,
    knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
  };
}

function upstreamWizardKindForMatchSides(
  wizardKind: KnockoutWizardBracketKind,
): KnockoutWizardBracketKind | null {
  if (wizardKind === "quarterfinalist") return "round_of_16";
  if (wizardKind === "semifinalist") return "quarterfinalist";
  if (wizardKind === "finalist") return "semifinalist";
  return null;
}

function slotStageForWizardKind(
  wizardKind: KnockoutWizardBracketKind,
): "quarterfinal" | "semifinal" | "final" | null {
  if (wizardKind === "quarterfinalist") return "quarterfinal";
  if (wizardKind === "semifinalist") return "semifinal";
  if (wizardKind === "finalist") return "final";
  return null;
}

function upstreamFeederRowsForMatch(
  row: KnockoutMatchPickRow,
  bracketKind: KnockoutWizardBracketKind,
  upstreamRows: KnockoutMatchPickRow[],
): KnockoutMatchPickRow[] {
  const slotStage = slotStageForWizardKind(bracketKind);
  if (!slotStage) return [];
  const pair = knockoutParticipantSlotPair(slotStage, row.matchIndex);
  if (!pair) return [];
  return pair
    .map((slotKey) => upstreamRows[parseInt(slotKey, 10) - 1])
    .filter((r): r is KnockoutMatchPickRow => Boolean(r));
}

function feederWasCleared(
  feeder: KnockoutMatchPickRow,
  options?: ExplainBlockedKnockoutRowOptions,
): boolean {
  return Boolean(options?.clearedPickRowKeys?.has(feeder.saveRowKey));
}

/** Friendly matchup label for a feeder or blocked row. */
export function feederMatchupLabel(row: KnockoutMatchPickRow): string | null {
  const line = row.display.emptyPrimaryLine?.trim();
  if (
    line &&
    line.includes(" vs ") &&
    !line.startsWith("Complete ") &&
    line !== "Locked" &&
    line !== "Locked at kickoff" &&
    line !== "Pick needed"
  ) {
    return line;
  }
  if (row.fifaMatchNo > 0) return `M${row.fifaMatchNo}`;
  return null;
}

function upstreamStageLabel(upstreamKind: KnockoutWizardBracketKind): string {
  return knockoutMatchStepDef(upstreamKind)?.stageLabel ?? "previous round";
}

function copyForBlockedDownstreamRow(
  blockedRow: KnockoutMatchPickRow,
  feeder: KnockoutMatchPickRow,
  upstreamKind: KnockoutWizardBracketKind,
  explanation: Omit<BlockedKnockoutMatchExplanation, "blockedRowMatchNo">,
  options?: ExplainBlockedKnockoutRowOptions,
): string {
  const blockedRef =
    blockedRow.fifaMatchNo > 0 ? `M${blockedRow.fifaMatchNo}` : "This matchup";
  const feederLabel = explanation.missingFeederLabel;

  switch (explanation.feederState) {
    case "missing_pick_editable":
      return feederLabel
        ? `Pick a winner for ${feederLabel} first.`
        : explanation.userFacingCopy;
    case "cleared_pick_locked":
      if (
        feederWasCleared(feeder, options) &&
        explanation.missingFeederMatchNo != null &&
        feeder.fifaMatchNo === explanation.missingFeederMatchNo
      ) {
        return lockedOutDirectBlockedCopy(blockedRef, feederLabel);
      }
      if (
        feeder.fifaMatchNo > 0 &&
        blockedRow.fifaMatchNo !== feeder.fifaMatchNo
      ) {
        return lockedOutIndirectBlockedCopy(blockedRef, feederLabel);
      }
      return lockedOutDirectBlockedCopy(blockedRef, feederLabel);
    case "official_result_missing":
      return feederLabel
        ? `${blockedRef} is waiting for the winner of ${feederLabel}.`
        : `${blockedRef} is waiting for an official winner.`;
    case "stale_or_invalid_team":
      return feederLabel
        ? `${blockedRef} is waiting for a valid official winner from ${feederLabel}.`
        : `${blockedRef} is waiting for a valid official winner.`;
    default:
      return `A ${upstreamStageLabel(upstreamKind)} feeder is unresolved, so ${blockedRef} cannot be picked yet.`;
  }
}

function classifyUnresolvedFeeder(
  feeder: KnockoutMatchPickRow,
  upstreamKind: KnockoutWizardBracketKind,
  upstreamInput: BuildKnockoutMatchPickRowsInput,
  options?: ExplainBlockedKnockoutRowOptions,
): Omit<BlockedKnockoutMatchExplanation, "blockedRowMatchNo"> | null {
  if (readConfirmedKnockoutMatchWinner(feeder, upstreamKind, upstreamInput)) {
    return null;
  }

  const def = knockoutMatchStepDef(upstreamKind);
  const feederLabel = feederMatchupLabel(feeder);
  const missingFeederMatchNo = feeder.fifaMatchNo > 0 ? feeder.fifaMatchNo : null;

  if (feeder.lockReason === "pickable") {
    return {
      missingFeederMatchNo,
      missingFeederLabel: feederLabel,
      feederState: "missing_pick_editable",
      userAction: "pick_upstream",
      userFacingCopy: formatMissingKnockoutDependencyLabel(feeder),
    };
  }

  if (feeder.lockReason === "incomplete") {
    const deeper = explainBlockedKnockoutMatchRow(
      feeder,
      upstreamKind,
      upstreamInput,
      options,
    );
    return {
      missingFeederMatchNo: deeper.missingFeederMatchNo,
      missingFeederLabel: deeper.missingFeederLabel,
      feederState: deeper.feederState,
      userAction: deeper.userAction,
      userFacingCopy: deeper.userFacingCopy,
    };
  }

  if (feeder.lockReason === "frozen" || feeder.lockReason === "started") {
    const official =
      def != null
        ? officialKnockoutMatchResultWinner(
            feeder.fifaMatchNo,
            def.stageCode,
            upstreamInput.teams,
            upstreamInput.tournamentMatches,
          )
        : null;

    if (
      official &&
      feeder.homeTeamId &&
      feeder.awayTeamId &&
      official !== feeder.homeTeamId &&
      official !== feeder.awayTeamId
    ) {
      return {
        missingFeederMatchNo,
        missingFeederLabel: feederLabel,
        feederState: "stale_or_invalid_team",
        userAction: "wait_for_result",
        userFacingCopy: feederLabel
          ? `Waiting for a valid official winner from ${feederLabel}.`
          : "Waiting for a valid official winner.",
      };
    }

    if (
      feederWasCleared(feeder, options) &&
      (feeder.lockReason === "frozen" || feeder.lockReason === "started")
    ) {
      return {
        missingFeederMatchNo,
        missingFeederLabel: feederLabel,
        feederState: "cleared_pick_locked",
        userAction: "locked_out",
        userFacingCopy: feederLabel
          ? `Your ${feederLabel} pick is locked and can no longer advance.`
          : "This pick is locked and can no longer advance.",
      };
    }

    return {
      missingFeederMatchNo,
      missingFeederLabel: feederLabel,
      feederState: "official_result_missing",
      userAction: "wait_for_result",
      userFacingCopy: feederLabel
        ? `Waiting for the official winner of ${feederLabel}.`
        : missingFeederMatchNo
          ? `Waiting for an official result from M${missingFeederMatchNo}.`
          : "This pick is waiting for an official winner.",
    };
  }

  return {
    missingFeederMatchNo,
    missingFeederLabel: feederLabel,
    feederState: "unknown",
    userAction: "contact_admin",
    userFacingCopy: feederLabel
      ? `A feeder result for ${feederLabel} is unresolved.`
      : "A previous-round feeder is unresolved.",
  };
}

export function explainLockedClearedPickRow(
  row: KnockoutMatchPickRow,
  options?: ExplainBlockedKnockoutRowOptions,
): BlockedKnockoutMatchExplanation {
  const feederLabel = feederMatchupLabel(row);
  const missingFeederMatchNo = row.fifaMatchNo > 0 ? row.fifaMatchNo : null;
  return {
    blockedRowMatchNo: row.fifaMatchNo,
    missingFeederMatchNo,
    missingFeederLabel: feederLabel,
    feederState: "cleared_pick_locked",
    userAction: "locked_out",
    userFacingCopy: feederLabel
      ? `Your ${feederLabel} pick is locked and can no longer advance.`
      : "This pick is locked and can no longer advance.",
  };
}

/** Diagnostic + user-facing copy for a blocked knockout match row. */
export function explainBlockedKnockoutMatchRow(
  row: KnockoutMatchPickRow,
  bracketKind: KnockoutWizardBracketKind,
  input: BuildKnockoutMatchPickRowsInput,
  options?: ExplainBlockedKnockoutRowOptions,
): BlockedKnockoutMatchExplanation {
  const blockedRowMatchNo = row.fifaMatchNo;

  if (bracketKind === "round_of_16") {
    return {
      blockedRowMatchNo,
      missingFeederMatchNo: null,
      missingFeederLabel: null,
      feederState: "missing_pick_editable",
      userAction: "pick_upstream",
      userFacingCopy: incompleteR16MatchMessage(
        row.matchIndex,
        input.slots,
        confirmedR32WinnerContextFromBuildInput(input),
      ),
    };
  }

  const upstreamKind = upstreamWizardKindForMatchSides(bracketKind);
  if (!upstreamKind) {
    return {
      blockedRowMatchNo,
      missingFeederMatchNo: null,
      missingFeederLabel: null,
      feederState: "unknown",
      userAction: "contact_admin",
      userFacingCopy:
        row.display.statusLine ??
        row.display.emptyPrimaryLine ??
        "This matchup cannot be picked yet.",
    };
  }

  const upstreamInput = buildInputForBracketKind(input, upstreamKind);
  const upstreamRows = buildKnockoutMatchPickRows(upstreamInput);

  for (const feeder of upstreamFeederRowsForMatch(row, bracketKind, upstreamRows)) {
    const feederExplanation = classifyUnresolvedFeeder(
      feeder,
      upstreamKind,
      upstreamInput,
      options,
    );
    if (!feederExplanation) continue;

    return {
      blockedRowMatchNo,
      ...feederExplanation,
      userFacingCopy: copyForBlockedDownstreamRow(
        row,
        feeder,
        upstreamKind,
        feederExplanation,
        options,
      ),
    };
  }

  return {
    blockedRowMatchNo,
    missingFeederMatchNo: null,
    missingFeederLabel: null,
    feederState: "unknown",
    userAction: "wait_for_result",
    userFacingCopy:
      blockedRowMatchNo > 0
        ? `M${blockedRowMatchNo} is waiting for an official winner from a previous round.`
        : "This matchup is waiting for an official winner from a previous round.",
  };
}

export function blockedKnockoutRowUserCopy(
  row: KnockoutMatchPickRow,
  bracketKind: KnockoutWizardBracketKind,
  input: BuildKnockoutMatchPickRowsInput,
  options?: ExplainBlockedKnockoutRowOptions,
): string {
  if (row.lockReason !== "incomplete") {
    return (
      row.display.statusLine ??
      row.display.emptyPrimaryLine ??
      "This matchup cannot be picked yet."
    );
  }
  return explainBlockedKnockoutMatchRow(row, bracketKind, input, options)
    .userFacingCopy;
}

export function firstBlockedRowExplanationForStep(
  bracketKind: KnockoutWizardBracketKind,
  input: BuildKnockoutMatchPickRowsInput,
  options?: ExplainBlockedKnockoutRowOptions,
): BlockedKnockoutMatchExplanation | null {
  const rows = buildKnockoutMatchPickRows(input);
  const incomplete = rows.filter((r) => r.lockReason === "incomplete");
  if (incomplete.length === 0) return null;
  return explainBlockedKnockoutMatchRow(incomplete[0]!, bracketKind, input, options);
}

export function blockedKnockoutStepGateCopy(
  bracketKind: KnockoutWizardBracketKind,
  input: BuildKnockoutMatchPickRowsInput,
  options?: ExplainBlockedKnockoutRowOptions,
): string | null {
  const rows = buildKnockoutMatchPickRows(input);
  const pickableMissing = rows.filter(
    (r) => r.lockReason === "pickable" && !validatedKnockoutMatchWinner(r),
  );
  if (pickableMissing.length === 1) {
    return formatMissingKnockoutDependencyLabel(pickableMissing[0]!);
  }
  if (pickableMissing.length > 1) {
    const stageLabel =
      knockoutMatchStepDef(bracketKind)?.stageLabel ?? "match";
    return `${pickableMissing.length} ${stageLabel.toLowerCase()} picks remain.`;
  }

  const explanation = firstBlockedRowExplanationForStep(
    bracketKind,
    input,
    options,
  );
  return explanation?.userFacingCopy ?? null;
}

/** Locked cleared pick on this step, or downstream block requiring save. */
export function stepLockedClearedPickIssue(
  bracketKind: KnockoutWizardBracketKind,
  input: BuildKnockoutMatchPickRowsInput,
  options?: ExplainBlockedKnockoutRowOptions,
): BlockedKnockoutMatchExplanation | null {
  const rows = buildKnockoutMatchPickRows(input);

  for (const row of rows) {
    if (!feederWasCleared(row, options)) continue;
    if (row.lockReason !== "frozen" && row.lockReason !== "started") continue;
    if (readConfirmedKnockoutMatchWinner(row, bracketKind, input)) continue;
    return explainLockedClearedPickRow(row, options);
  }

  const blocked = firstBlockedRowExplanationForStep(
    bracketKind,
    input,
    options,
  );
  if (blocked?.userAction === "locked_out") {
    return blocked;
  }
  return null;
}
