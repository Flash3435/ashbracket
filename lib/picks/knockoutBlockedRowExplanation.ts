import { knockoutParticipantSlotPair } from "../bracket/wc2026KnockoutPairings";
import type { ClearedKnockoutPathPick } from "../predictions/pruneOfficialKnockoutPathPicks";
import { KNOCKOUT_MISSING_PICK_AFTER_KICKOFF } from "./knockoutPickEditability";
import {
  buildKnockoutMatchPickRows,
  formatMissingKnockoutDependencyLabel,
  immediateUpstreamFeederRoundLabel,
  incompleteR16MatchMessage,
  knockoutMatchStepDef,
  officialKnockoutMatchResultWinner,
  readConfirmedKnockoutMatchWinner,
  readSavedUpstreamFeederPick,
  usesImmediateUpstreamFeederSavedPick,
  usesKnockoutMatchPickRows,
  validatedKnockoutMatchWinner,
  type BuildKnockoutMatchPickRowsInput,
  type KnockoutMatchPickRow,
  type KnockoutWizardBracketKind,
} from "./knockoutMatchPickRows";
import { isKnockoutPickLockedOut } from "../predictions/knockoutPickStatus";

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

/** Participant-facing headline when locked rows need no action (empty or frozen). */
export const LOCKED_KNOCKOUT_NO_ACTION_HEADLINE = "Locked — no action needed";

/** @deprecated Use LOCKED_OUT_PICK_HEADLINE */
export const LOCKED_CLEARED_REPAIR_HEADLINE = LOCKED_OUT_PICK_HEADLINE;

export type ParticipantLockedKnockoutRowKind =
  | "saved_out"
  | "locked_empty"
  | "saved_locked";

export function participantLockedKnockoutRowKind(
  row: Pick<
    KnockoutMatchPickRow,
    "lockReason" | "winnerTeamId" | "pickStatus"
  >,
): ParticipantLockedKnockoutRowKind | null {
  if (row.lockReason !== "frozen" && row.lockReason !== "started") return null;
  const saved = row.winnerTeamId.trim();
  if (row.pickStatus === "out" && saved) return "saved_out";
  if (!saved) return "locked_empty";
  return "saved_locked";
}

export function participantMatchupLabelFromRow(
  row: KnockoutMatchPickRow,
  teams?: ReadonlyArray<{ id: string; name: string }>,
): string {
  if (row.homeTeamId?.trim() && row.awayTeamId?.trim() && teams?.length) {
    const home = teams.find((t) => t.id === row.homeTeamId)?.name?.trim();
    const away = teams.find((t) => t.id === row.awayTeamId)?.name?.trim();
    if (home && away) return `${home} vs ${away}`;
  }
  const matchup = feederMatchupLabel(row);
  if (matchup?.includes(" vs ")) return matchup;
  return row.fifaMatchNo > 0 ? `M${row.fifaMatchNo}` : "This matchup";
}

export function feederStageLabelForSavedPickKind(
  savePredictionKind: string,
): string {
  switch (savePredictionKind) {
    case "quarterfinalist":
      return "Round of 32";
    case "semifinalist":
      return "Round of 16";
    case "finalist":
      return "Quarter-finals";
    case "champion":
      return "Semi-finals";
    default:
      return "previous round";
  }
}

export function participantLockedKnockoutRowBody(
  row: KnockoutMatchPickRow,
  teams?: ReadonlyArray<{ id: string; name: string }>,
): string {
  const kind = participantLockedKnockoutRowKind(row);
  const matchup = participantMatchupLabelFromRow(row, teams);
  if (kind === "saved_out") {
    return `Your saved pick for ${matchup} is out and can no longer advance. No action is needed.`;
  }
  if (kind === "locked_empty") {
    if (row.lockReason === "started") {
      return `${matchup}: ${KNOCKOUT_MISSING_PICK_AFTER_KICKOFF} No action is needed.`;
    }
    const feederStage = feederStageLabelForSavedPickKind(row.savePredictionKind);
    return `${matchup} is locked with no pick saved because the ${feederStage} feeder results are already official. No action is needed.`;
  }
  if (kind === "saved_locked") {
    return `Your saved pick for ${matchup} is locked because feeder results are official. No action is needed.`;
  }
  return "This pick is locked. No action is needed.";
}

export function participantLockedKnockoutStatusHeadline(
  rows: KnockoutMatchPickRow[],
): string {
  const kinds = rows
    .map((row) => participantLockedKnockoutRowKind(row))
    .filter((k): k is ParticipantLockedKnockoutRowKind => k != null);
  if (kinds.length === 0) return LOCKED_KNOCKOUT_NO_ACTION_HEADLINE;
  if (kinds.every((k) => k === "locked_empty" || k === "saved_locked")) {
    return kinds.length === 1
      ? LOCKED_KNOCKOUT_NO_ACTION_HEADLINE
      : "Locked picks — no action needed";
  }
  if (kinds.some((k) => k === "saved_out")) {
    return kinds.length === 1 ? LOCKED_OUT_PICK_HEADLINE : "Saved picks are out";
  }
  return LOCKED_KNOCKOUT_NO_ACTION_HEADLINE;
}

export function lockedOutPickCardBody(
  rowOrLegacyLabel: KnockoutMatchPickRow | string | null,
  teams?: ReadonlyArray<{ id: string; name: string }>,
): string {
  if (rowOrLegacyLabel && typeof rowOrLegacyLabel === "object") {
    return participantLockedKnockoutRowBody(rowOrLegacyLabel, teams);
  }
  const label = rowOrLegacyLabel?.trim();
  if (label && label.includes(" vs ")) {
    return `Your saved pick for ${label} is out and can no longer advance. No action is needed.`;
  }
  return "One of your picks is locked and can no longer advance. No action is needed.";
}

/** @deprecated Use lockedOutPickCardBody */
export const lockedClearedRepairCardBody = lockedOutPickCardBody;

function participantTeamName(
  teamId: string | null | undefined,
  teams: ReadonlyArray<{ id: string; name: string }>,
): string | null {
  if (!teamId?.trim()) return null;
  return teams.find((t) => t.id === teamId.trim())?.name?.trim() || null;
}

function downstreamPathStageLabel(
  bracketKind: KnockoutWizardBracketKind,
): string {
  if (bracketKind === "semifinalist") return "semi-final";
  if (bracketKind === "finalist") return "final";
  return "path";
}

function eliminatedImmediateFeederCopy(
  parentBracketKind: KnockoutWizardBracketKind,
  pickTeamName: string | null,
  roundLabel: string,
): string {
  const pathStage = downstreamPathStageLabel(parentBracketKind);
  const pickLabel = pickTeamName ?? "your pick";
  return `This ${pathStage} path is unavailable because your ${roundLabel} pick ${pickLabel} has been eliminated.`;
}

function otherFeederStillAliveCopy(
  blockedRow: KnockoutMatchPickRow,
  blockedFeeder: KnockoutMatchPickRow,
  parentBracketKind: KnockoutWizardBracketKind,
  upstreamRows: KnockoutMatchPickRow[],
  upstreamInput: BuildKnockoutMatchPickRowsInput,
): string | null {
  const roundLabel = immediateUpstreamFeederRoundLabel(parentBracketKind);
  for (const other of upstreamFeederRowsForMatch(
    blockedRow,
    parentBracketKind,
    upstreamRows,
  )) {
    if (other.matchIndex === blockedFeeder.matchIndex) continue;
    const otherSaved = readSavedUpstreamFeederPick(
      parentBracketKind,
      other.matchIndex,
      upstreamInput.slots,
    );
    if (!otherSaved) continue;
    if (isKnockoutPickLockedOut(otherSaved) || otherSaved.pickStatus === "out") {
      continue;
    }
    const otherTeamName = participantTeamName(
      otherSaved.teamId,
      upstreamInput.teams,
    );
    if (otherTeamName) {
      return `Your other ${roundLabel} pick ${otherTeamName} is still alive, but this matchup needs both feeder winners to be valid.`;
    }
  }
  return null;
}

function immediateFeederBlockedUserCopy(
  blockedRow: KnockoutMatchPickRow,
  feeder: KnockoutMatchPickRow,
  parentBracketKind: KnockoutWizardBracketKind,
  upstreamRows: KnockoutMatchPickRow[],
  upstreamInput: BuildKnockoutMatchPickRowsInput,
  explanation: Omit<BlockedKnockoutMatchExplanation, "blockedRowMatchNo">,
): string {
  const secondary = otherFeederStillAliveCopy(
    blockedRow,
    feeder,
    parentBracketKind,
    upstreamRows,
    upstreamInput,
  );
  if (secondary) {
    return `${explanation.userFacingCopy} ${secondary}`;
  }
  return explanation.userFacingCopy;
}

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
export function feederMatchupLabel(
  row: KnockoutMatchPickRow,
  teams?: ReadonlyArray<{ id: string; name: string }>,
): string | null {
  if (row.homeTeamId?.trim() && row.awayTeamId?.trim() && teams?.length) {
    const home = teams.find((t) => t.id === row.homeTeamId)?.name?.trim();
    const away = teams.find((t) => t.id === row.awayTeamId)?.name?.trim();
    if (home && away) return `${home} vs ${away}`;
  }
  const line = row.display.emptyPrimaryLine?.trim();
  if (
    line &&
    line.includes(" vs ") &&
    !line.startsWith("Complete ") &&
    !line.startsWith("This ") &&
    !line.startsWith("Waiting ") &&
    !line.startsWith("Pick ") &&
    !line.startsWith("No ") &&
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

function immediateFeederSaveRowKey(
  upstreamKind: KnockoutWizardBracketKind,
  feederMatchIndex: number,
): string | null {
  const def = knockoutMatchStepDef(upstreamKind);
  if (!def) return null;
  return `${def.resultKind}|${feederMatchIndex + 1}`;
}

function classifyImmediateUpstreamFeeder(
  feeder: KnockoutMatchPickRow,
  upstreamKind: KnockoutWizardBracketKind,
  parentBracketKind: KnockoutWizardBracketKind,
  upstreamInput: BuildKnockoutMatchPickRowsInput,
  options?: ExplainBlockedKnockoutRowOptions,
): Omit<BlockedKnockoutMatchExplanation, "blockedRowMatchNo"> | null {
  const saved = readSavedUpstreamFeederPick(
    parentBracketKind,
    feeder.matchIndex,
    upstreamInput.slots,
  );
  const missingFeederMatchNo = feeder.fifaMatchNo > 0 ? feeder.fifaMatchNo : null;
  const feederMatchup = feederMatchupLabel(feeder, upstreamInput.teams);
  const roundLabel = immediateUpstreamFeederRoundLabel(parentBracketKind);
  const saveRowKey = immediateFeederSaveRowKey(upstreamKind, feeder.matchIndex);
  const clearedSave =
    Boolean(saveRowKey && options?.clearedPickRowKeys?.has(saveRowKey)) ||
    feederWasCleared(feeder, options);

  if (saved) {
    const pickTeamName = participantTeamName(saved.teamId, upstreamInput.teams);
    if (isKnockoutPickLockedOut(saved) || saved.pickStatus === "out") {
      return {
        missingFeederMatchNo,
        missingFeederLabel: pickTeamName ?? feederMatchup,
        feederState: "cleared_pick_locked",
        userAction: "locked_out",
        userFacingCopy: eliminatedImmediateFeederCopy(
          parentBracketKind,
          pickTeamName,
          roundLabel,
        ),
      };
    }
    return null;
  }

  if (clearedSave) {
    const clearedTeamName = participantTeamName(
      feeder.winnerTeamId,
      upstreamInput.teams,
    );
    const pathStage = downstreamPathStageLabel(parentBracketKind);
    const usableMatchup =
      feederMatchup && !/^M\d+$/.test(feederMatchup) ? feederMatchup : null;
    return {
      missingFeederMatchNo,
      missingFeederLabel: clearedTeamName ?? usableMatchup,
      feederState: "cleared_pick_locked",
      userAction: "locked_out",
      userFacingCopy: clearedTeamName
        ? eliminatedImmediateFeederCopy(
            parentBracketKind,
            clearedTeamName,
            roundLabel,
          )
        : usableMatchup
          ? `This ${pathStage} path is unavailable because your ${roundLabel} pick for ${usableMatchup} is no longer valid.`
          : `No ${pathStage} pick can be saved for this matchup right now.`,
    };
  }

  if (feeder.lockReason === "frozen" || feeder.lockReason === "started") {
    const def = knockoutMatchStepDef(upstreamKind);
    const feederLabel = feederMatchup;
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
          ? `This matchup is waiting for a valid official winner from ${feederLabel}.`
          : "This matchup is waiting for a valid official winner.",
      };
    }

    return {
      missingFeederMatchNo,
      missingFeederLabel: feederLabel,
      feederState: "official_result_missing",
      userAction: "wait_for_result",
      userFacingCopy: feederLabel
        ? `This matchup is waiting for the official winner of ${feederLabel}.`
        : "This matchup is waiting for an official result.",
    };
  }

  return {
    missingFeederMatchNo,
    missingFeederLabel: feederMatchup,
    feederState: "missing_pick_editable",
    userAction: "pick_upstream",
    userFacingCopy: feederMatchup
      ? `Waiting for your ${roundLabel} pick for ${feederMatchup}.`
      : `Waiting for your ${roundLabel} pick.`,
  };
}

function classifyUnresolvedFeeder(
  feeder: KnockoutMatchPickRow,
  upstreamKind: KnockoutWizardBracketKind,
  parentBracketKind: KnockoutWizardBracketKind,
  upstreamInput: BuildKnockoutMatchPickRowsInput,
  options?: ExplainBlockedKnockoutRowOptions,
): Omit<BlockedKnockoutMatchExplanation, "blockedRowMatchNo"> | null {
  if (usesImmediateUpstreamFeederSavedPick(parentBracketKind)) {
    return classifyImmediateUpstreamFeeder(
      feeder,
      upstreamKind,
      parentBracketKind,
      upstreamInput,
      options,
    );
  }

  if (readConfirmedKnockoutMatchWinner(feeder, upstreamKind, upstreamInput)) {
    return null;
  }

  const def = knockoutMatchStepDef(upstreamKind);
  const feederLabel = feederMatchupLabel(feeder, upstreamInput.teams);
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
        userFacingCopy: participantLockedKnockoutRowBody(feeder),
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
    userFacingCopy: participantLockedKnockoutRowBody(row),
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
      bracketKind,
      upstreamInput,
      options,
    );
    if (!feederExplanation) continue;

    const useImmediateFeederCopy =
      usesImmediateUpstreamFeederSavedPick(bracketKind);

    return {
      blockedRowMatchNo,
      ...feederExplanation,
      userFacingCopy: useImmediateFeederCopy
        ? immediateFeederBlockedUserCopy(
            row,
            feeder,
            bracketKind,
            upstreamRows,
            upstreamInput,
            feederExplanation,
          )
        : copyForBlockedDownstreamRow(
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

function stepGateSummaryFromExplanation(
  bracketKind: KnockoutWizardBracketKind,
  explanation: BlockedKnockoutMatchExplanation,
  blockedCount: number,
): string {
  const stageLabel =
    knockoutMatchStepDef(bracketKind)?.stageLabel ?? "match";
  const stageLower = stageLabel.toLowerCase();
  const stageSingular =
    stageLower.endsWith("s") && !stageLower.endsWith(" of 16")
      ? stageLower.slice(0, -1)
      : stageLower;
  const countLabel =
    blockedCount === 1
      ? `One ${stageSingular}`
      : `${blockedCount} ${stageLower}`;

  switch (explanation.userAction) {
    case "wait_for_result":
      return `${countLabel} ${blockedCount === 1 ? "is" : "are"} waiting on an earlier result.`;
    case "locked_out":
      return `${countLabel} ${blockedCount === 1 ? "pick is" : "picks are"} out.`;
    case "pick_upstream":
      return `${countLabel} ${blockedCount === 1 ? "is" : "are"} blocked by an earlier round pick.`;
    case "pick_this_row":
    case "contact_admin":
      return explanation.userFacingCopy;
    default:
      return explanation.userFacingCopy;
  }
}

/** Short section-banner copy — not the same sentence as a blocked row headline. */
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

  const incomplete = rows.filter((r) => r.lockReason === "incomplete");
  const explanation = firstBlockedRowExplanationForStep(
    bracketKind,
    input,
    options,
  );
  if (!explanation) return null;
  if (incomplete.length === 0) return explanation.userFacingCopy;
  return stepGateSummaryFromExplanation(
    bracketKind,
    explanation,
    incomplete.length,
  );
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

const LATER_PARTICIPANT_MATCH_BRACKETS: KnockoutWizardBracketKind[] = [
  "round_of_16",
  "quarterfinalist",
  "semifinalist",
  "finalist",
];

/** Frozen/started rows that participants cannot action (saved out or locked empty). */
export function participantNonActionableLockedKnockoutRows(
  input: Omit<BuildKnockoutMatchPickRowsInput, "bracketKind">,
): KnockoutMatchPickRow[] {
  const rows: KnockoutMatchPickRow[] = [];
  for (const bracketKind of LATER_PARTICIPANT_MATCH_BRACKETS) {
    if (!usesKnockoutMatchPickRows(bracketKind, true)) continue;
    rows.push(...buildKnockoutMatchPickRows({ ...input, bracketKind }));
  }
  return rows.filter((row) => {
    const kind = participantLockedKnockoutRowKind(row);
    return kind === "saved_out" || kind === "locked_empty";
  });
}
