import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  knockoutParticipantSlotPair,
  r16R32ParticipantPair,
} from "../bracket/wc2026KnockoutPairings";
import { isKnockoutPickLockedOut } from "../predictions/knockoutPickStatus";
import {
  r16SlotKeyForR32MatchIndex,
  type GradualKnockoutSelectionState,
} from "./gradualKnockoutUnlock";
import {
  isKnockoutMatchLockedForParticipant,
} from "./knockoutPickEditability";
import {
  knockoutMatchStepDef,
  officialKnockoutMatchResultWinner,
  officialR32ParticipantIds,
  readOfficialR32MatchResultWinner,
  readParticipantR32MatchWinnerPick,
  type ConfirmedR32WinnerContext,
  type KnockoutMatchPickRow,
  type KnockoutWizardBracketKind,
} from "./knockoutMatchPickRows";

export type StrictBracketFeederIssueKind =
  | "valid"
  | "missing_pick"
  | "stale_path";

export type StrictBracketFeederIssue = {
  kind: StrictBracketFeederIssueKind;
  feederSlotKey: string;
  feederMatchNo: number | null;
  participantPickTeamId: string | null;
  officialWinnerTeamId: string | null;
};

export type StrictBracketPathEvaluation = {
  issues: StrictBracketFeederIssue[];
  hasStalePath: boolean;
  hasMissingRequiredPick: boolean;
  allFeedersValid: boolean;
  /** First stale participant pick for user-facing copy. */
  primaryStalePickTeamId: string | null;
};

function teamName(teamId: string | null, teams: Team[]): string | null {
  if (!teamId?.trim()) return null;
  return teams.find((t) => t.id === teamId.trim())?.name?.trim() ?? null;
}

function publicMatchForFifaNo(
  matches: TournamentMatchPublicRow[],
  stageCode: string,
  fifaMatchNo: number,
): TournamentMatchPublicRow | null {
  const direct = `M${fifaMatchNo}`;
  return (
    matches.find(
      (m) => m.stage_code === stageCode && m.match_code === direct,
    ) ??
    matches.find(
      (m) =>
        m.stage_code === stageCode &&
        m.match_code.endsWith(`-${fifaMatchNo}`),
    ) ??
    null
  );
}

function upstreamFeederSlotKeys(
  wizardKind: KnockoutWizardBracketKind,
  matchIndex: number,
): readonly [string, string] | null {
  if (wizardKind === "round_of_16") {
    const pair = r16R32ParticipantPair(matchIndex);
    if (!pair) return null;
    return [
      r16SlotKeyForR32MatchIndex(pair[0]),
      r16SlotKeyForR32MatchIndex(pair[1]),
    ] as const;
  }
  const slotStage =
    wizardKind === "quarterfinalist"
      ? "quarterfinal"
      : wizardKind === "semifinalist"
        ? "semifinal"
        : wizardKind === "finalist"
          ? "final"
          : null;
  if (!slotStage) return null;
  const pair = knockoutParticipantSlotPair(slotStage, matchIndex);
  return pair ?? null;
}

function feederMatchNoForSlot(
  wizardKind: KnockoutWizardBracketKind,
  feederSlotKey: string,
): number | null {
  if (wizardKind === "round_of_16") {
    const r32Index = parseInt(feederSlotKey, 10) - 1;
    if (!Number.isFinite(r32Index) || r32Index < 0) return null;
    return 73 + r32Index;
  }
  const def = knockoutMatchStepDef(
    wizardKind === "quarterfinalist"
      ? "round_of_16"
      : wizardKind === "semifinalist"
        ? "quarterfinalist"
        : wizardKind === "finalist"
          ? "semifinalist"
          : "round_of_16",
  );
  if (!def) return null;
  const slotNo = parseInt(feederSlotKey, 10);
  if (!Number.isFinite(slotNo) || slotNo < 1) return null;
  return def.firstFifaMatchNo + slotNo - 1;
}

function officialWinnerForFeeder(
  wizardKind: KnockoutWizardBracketKind,
  feederSlotKey: string,
  teams: Team[],
  tournamentMatches: TournamentMatchPublicRow[] | null | undefined,
  gradual: GradualKnockoutSelectionState,
  r32Ctx: ConfirmedR32WinnerContext,
): string | null {
  if (wizardKind === "round_of_16") {
    const r32Index = parseInt(feederSlotKey, 10) - 1;
    if (!Number.isFinite(r32Index) || r32Index < 0) return null;
    return readOfficialR32MatchResultWinner(r32Index, r32Ctx);
  }
  const upstreamDef = knockoutMatchStepDef(
    wizardKind === "quarterfinalist"
      ? "round_of_16"
      : wizardKind === "semifinalist"
        ? "quarterfinalist"
        : "semifinalist",
  );
  if (!upstreamDef) return null;
  const fifaMatchNo = feederMatchNoForSlot(wizardKind, feederSlotKey);
  if (fifaMatchNo == null) return null;
  return officialKnockoutMatchResultWinner(
    fifaMatchNo,
    upstreamDef.stageCode,
    teams,
    tournamentMatches,
  );
}

function participantPickForFeeder(
  wizardKind: KnockoutWizardBracketKind,
  feederSlotKey: string,
  slots: KnockoutPickSlotDraft[],
  r32Ctx: ConfirmedR32WinnerContext,
): { teamId: string | null; pickStatus: "active" | "out" | null } {
  if (wizardKind === "round_of_16") {
    const r32Index = parseInt(feederSlotKey, 10) - 1;
    if (!Number.isFinite(r32Index) || r32Index < 0) {
      return { teamId: null, pickStatus: null };
    }
    const teamId = readParticipantR32MatchWinnerPick(
      r32Index,
      slots,
      r32Ctx,
    ).trim();
    const saveRow = slots.find(
      (s) =>
        s.predictionKind === "round_of_16" &&
        s.slotKey === feederSlotKey,
    );
    return {
      teamId: teamId || null,
      pickStatus: saveRow?.pickStatus ?? null,
    };
  }
  const feederKind =
    wizardKind === "quarterfinalist"
      ? "quarterfinalist"
      : wizardKind === "semifinalist"
        ? "semifinalist"
        : "finalist";
  const saveRow = slots.find(
    (s) => s.predictionKind === feederKind && s.slotKey === feederSlotKey,
  );
  const teamId = saveRow?.teamId.trim() ?? "";
  return {
    teamId: teamId || null,
    pickStatus: saveRow?.pickStatus ?? null,
  };
}

function classifyFeederSide(input: {
  participantPickTeamId: string | null;
  pickStatus: "active" | "out" | null;
  officialWinnerTeamId: string | null;
}): StrictBracketFeederIssueKind {
  const official = input.officialWinnerTeamId?.trim() ?? "";
  if (!official) return "valid";

  const saved = input.participantPickTeamId?.trim() ?? "";
  if (!saved) return "missing_pick";
  if (
    input.pickStatus === "out" ||
    isKnockoutPickLockedOut({
      teamId: saved,
      pickStatus: input.pickStatus,
    })
  ) {
    return "stale_path";
  }
  if (saved !== official) return "stale_path";
  return "valid";
}

/**
 * Strict bracket continuity: downstream rows are pickable only when each
 * official feeder side matches the participant's saved upstream winner.
 */
export function evaluateStrictBracketPathForMatch(input: {
  wizardKind: KnockoutWizardBracketKind;
  matchIndex: number;
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  gradual: GradualKnockoutSelectionState;
  knockoutBracketPicksUnlocked?: boolean;
  nowMs?: number;
}): StrictBracketPathEvaluation | null {
  if (input.knockoutBracketPicksUnlocked === false) return null;

  const feederSlotKeys = upstreamFeederSlotKeys(
    input.wizardKind,
    input.matchIndex,
  );
  if (!feederSlotKeys) return null;

  const r32Ctx: ConfirmedR32WinnerContext = {
    teams: input.teams,
    tournamentMatches: input.tournamentMatches,
    gradual: input.gradual,
    knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
  };

  const issues: StrictBracketFeederIssue[] = [];
  let anyOfficialFeeder = false;

  for (const feederSlotKey of feederSlotKeys) {
    const officialWinnerTeamId = officialWinnerForFeeder(
      input.wizardKind,
      feederSlotKey,
      input.teams,
      input.tournamentMatches,
      input.gradual,
      r32Ctx,
    );
    if (officialWinnerTeamId) anyOfficialFeeder = true;

    const { teamId: participantPickTeamId, pickStatus } =
      participantPickForFeeder(
        input.wizardKind,
        feederSlotKey,
        input.slots,
        r32Ctx,
      );

    const kind = classifyFeederSide({
      participantPickTeamId,
      pickStatus,
      officialWinnerTeamId,
    });

    issues.push({
      kind,
      feederSlotKey,
      feederMatchNo: feederMatchNoForSlot(input.wizardKind, feederSlotKey),
      participantPickTeamId,
      officialWinnerTeamId,
    });
  }

  if (!anyOfficialFeeder) return null;

  const hasStalePath = issues.some((i) => i.kind === "stale_path");
  const hasMissingRequiredPick = issues.some((i) => i.kind === "missing_pick");
  const allFeedersValid = issues.every((i) => i.kind === "valid");
  const primaryStale = issues.find((i) => i.kind === "stale_path");

  return {
    issues,
    hasStalePath,
    hasMissingRequiredPick,
    allFeedersValid,
    primaryStalePickTeamId: primaryStale?.participantPickTeamId ?? null,
  };
}

export function strictBracketStageLabel(
  wizardKind: KnockoutWizardBracketKind,
): string {
  return knockoutMatchStepDef(wizardKind)?.stageLabel ?? "match";
}

/** Participant-facing copy when strict path blocks a future confirmed matchup. */
export function strictBracketPathBlockedCopy(
  evaluation: StrictBracketPathEvaluation,
  teams: Team[],
  wizardKind: KnockoutWizardBracketKind,
): string {
  const stage = strictBracketStageLabel(wizardKind).toLowerCase();
  if (evaluation.hasStalePath && evaluation.primaryStalePickTeamId) {
    const name =
      teamName(evaluation.primaryStalePickTeamId, teams) ??
      evaluation.primaryStalePickTeamId;
    return `This ${stage} is unavailable because your earlier pick ${name} did not advance.`;
  }
  if (evaluation.hasMissingRequiredPick) {
    return `Your bracket path for this ${stage} is incomplete — pick the required earlier-round winners first.`;
  }
  return `Your bracket path for this ${stage} is broken because an earlier pick did not advance.`;
}

/** True when participant must not save a winner on this row (strict path broken). */
export function isStrictBracketPathBlockedForParticipant(input: {
  wizardKind: KnockoutWizardBracketKind;
  matchIndex: number;
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  gradual: GradualKnockoutSelectionState;
  knockoutBracketPicksUnlocked?: boolean;
  nowMs?: number;
}): boolean {
  const def = knockoutMatchStepDef(input.wizardKind);
  if (!def) return false;
  const publicMatch = publicMatchForFifaNo(
    (input.tournamentMatches ?? []).filter((m) => m.stage_code === def.stageCode),
    def.stageCode,
    def.firstFifaMatchNo + input.matchIndex,
  );
  if (publicMatch && isKnockoutMatchLockedForParticipant(publicMatch, input.nowMs)) {
    return false;
  }
  const evaluation = evaluateStrictBracketPathForMatch(input);
  if (!evaluation) return false;
  return evaluation.hasStalePath || evaluation.hasMissingRequiredPick;
}

function upstreamWizardKindForStrictPath(
  wizardKind: KnockoutWizardBracketKind,
): KnockoutWizardBracketKind | null {
  if (wizardKind === "quarterfinalist") return "round_of_16";
  if (wizardKind === "semifinalist") return "quarterfinalist";
  if (wizardKind === "finalist") return "semifinalist";
  return null;
}

/** Map a saved progression slot to the wizard match row it updates. */
export function wizardMatchRefForSavedSlot(
  predictionKind: string,
  slotKey: string | null,
): { wizardKind: KnockoutWizardBracketKind; matchIndex: number } | null {
  if (predictionKind === "quarterfinalist") {
    const n = parseInt(slotKey ?? "", 10);
    if (!Number.isFinite(n) || n < 1 || n > 8) return null;
    return { wizardKind: "round_of_16", matchIndex: n - 1 };
  }
  if (predictionKind === "semifinalist") {
    const n = parseInt(slotKey ?? "", 10);
    if (!Number.isFinite(n) || n < 1 || n > 4) return null;
    return { wizardKind: "quarterfinalist", matchIndex: n - 1 };
  }
  if (predictionKind === "finalist") {
    const n = parseInt(slotKey ?? "", 10);
    if (!Number.isFinite(n) || n < 1 || n > 2) return null;
    return { wizardKind: "semifinalist", matchIndex: n - 1 };
  }
  if (predictionKind === "champion") {
    return { wizardKind: "finalist", matchIndex: 0 };
  }
  return null;
}

/**
 * True when a missing strict-path feeder can still be filled via an editable
 * upstream wizard row (participant should pick upstream first).
 */
export function strictPathMissingUpstreamStillWaiting(
  evaluation: StrictBracketPathEvaluation,
  wizardKind: KnockoutWizardBracketKind,
  upstreamRows: (kind: KnockoutWizardBracketKind) => KnockoutMatchPickRow[],
  gradual: GradualKnockoutSelectionState,
): boolean {
  for (const issue of evaluation.issues) {
    if (issue.kind !== "missing_pick") continue;

    if (wizardKind === "round_of_16") {
      const r32Index = parseInt(issue.feederSlotKey, 10) - 1;
      if (!Number.isFinite(r32Index) || r32Index < 0) continue;
      const ms = gradual.matchStates[r32Index];
      if (ms?.pickable && !ms.started) return true;
      continue;
    }

    const upstreamKind = upstreamWizardKindForStrictPath(wizardKind);
    if (!upstreamKind) continue;
    const feederMatchIndex = parseInt(issue.feederSlotKey, 10) - 1;
    if (!Number.isFinite(feederMatchIndex) || feederMatchIndex < 0) continue;
    const upstreamRow = upstreamRows(upstreamKind)[feederMatchIndex];
    if (
      upstreamRow?.lockReason === "pickable" ||
      upstreamRow?.lockReason === "incomplete"
    ) {
      return true;
    }
  }
  return false;
}

/** Whether participant saved picks could produce the official R16 slot sides. */
export function participantR16SlotSidesMatchOfficial(input: {
  slotKey: string;
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  gradual: GradualKnockoutSelectionState;
  knockoutBracketPicksUnlocked?: boolean;
}): boolean {
  const slotNo = parseInt(input.slotKey, 10);
  if (!Number.isFinite(slotNo) || slotNo < 1 || slotNo > 8) return false;
  const r32Ctx: ConfirmedR32WinnerContext = {
    teams: input.teams,
    tournamentMatches: input.tournamentMatches,
    gradual: input.gradual,
    knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
  };
  const official = officialR32ParticipantIds(slotNo - 1, input.slots, r32Ctx);
  if (!official.topId && !official.bottomId) return true;
  const eval_ = evaluateStrictBracketPathForMatch({
    wizardKind: "round_of_16",
    matchIndex: slotNo - 1,
    slots: input.slots,
    teams: input.teams,
    tournamentMatches: input.tournamentMatches,
    gradual: input.gradual,
    knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
  });
  return eval_?.allFeedersValid ?? true;
}
