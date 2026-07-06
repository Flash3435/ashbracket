import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  knockoutParticipantSlotPair,
} from "../bracket/wc2026KnockoutPairings";
import { isKnockoutPickLockedOut } from "../predictions/knockoutPickStatus";
import {
  type GradualKnockoutSelectionState,
} from "./gradualKnockoutUnlock";
import {
  isKnockoutMatchLockedForParticipant,
  isValidSavedPickForMatchup,
  resolveOfficialKnockoutSlotMatchupTeamIds,
} from "./knockoutPickEditability";
import {
  knockoutMatchStepDef,
  officialR32ParticipantIds,
  type ConfirmedR32WinnerContext,
  type KnockoutMatchPickRow,
  type KnockoutWizardBracketKind,
} from "./knockoutMatchPickRows";

/** @deprecated Renamed concept — kept for import stability. */
export type StrictBracketFeederIssueKind =
  | "valid"
  | "missing_pick"
  | "stale_path";

/** @deprecated Use {@link MatchSlotSavedPickIssue} instead. */
export type StrictBracketFeederIssue = {
  kind: StrictBracketFeederIssueKind;
  feederSlotKey: string;
  feederMatchNo: number | null;
  participantPickTeamId: string | null;
  officialWinnerTeamId: string | null;
};

/** @deprecated Use {@link MatchSlotSavedPickEvaluation} instead. */
export type StrictBracketPathEvaluation = {
  issues: StrictBracketFeederIssue[];
  hasStalePath: boolean;
  hasMissingRequiredPick: boolean;
  allFeedersValid: boolean;
  primaryStalePickTeamId: string | null;
};

export type MatchSlotSavedPickStatus = "live" | "out" | "missing";

export type MatchSlotSavedPickEvaluation = {
  status: MatchSlotSavedPickStatus;
  savedTeamId: string | null;
  /** True when the saved team is one of the official matchup sides. */
  savedTeamInOfficialMatchup: boolean;
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

function resultKindForWizardKind(
  wizardKind: KnockoutWizardBracketKind,
): string | null {
  return knockoutMatchStepDef(wizardKind)?.resultKind ?? null;
}

function slotKeyForMatchIndex(
  wizardKind: KnockoutWizardBracketKind,
  matchIndex: number,
): string | null {
  const kind = resultKindForWizardKind(wizardKind);
  if (!kind || kind === "champion") return null;
  return String(matchIndex + 1);
}

function savedPickForMatchSlot(
  wizardKind: KnockoutWizardBracketKind,
  matchIndex: number,
  slots: KnockoutPickSlotDraft[],
): { teamId: string | null; pickStatus: "active" | "out" | null } {
  const resultKind = resultKindForWizardKind(wizardKind);
  if (!resultKind) return { teamId: null, pickStatus: null };

  if (resultKind === "champion") {
    const row = slots.find((s) => s.predictionKind === "champion");
    const teamId = row?.teamId.trim() ?? "";
    return {
      teamId: teamId || null,
      pickStatus: row?.pickStatus ?? null,
    };
  }

  const slotKey = slotKeyForMatchIndex(wizardKind, matchIndex);
  if (!slotKey) return { teamId: null, pickStatus: null };
  const row = slots.find(
    (s) => s.predictionKind === resultKind && s.slotKey === slotKey,
  );
  const teamId = row?.teamId.trim() ?? "";
  return {
    teamId: teamId || null,
    pickStatus: row?.pickStatus ?? null,
  };
}

function officialMatchupSidesForWizardMatch(input: {
  wizardKind: KnockoutWizardBracketKind;
  matchIndex: number;
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  gradual: GradualKnockoutSelectionState;
}): { homeTeamId: string | null; awayTeamId: string | null } {
  const def = knockoutMatchStepDef(input.wizardKind);
  if (!def) return { homeTeamId: null, awayTeamId: null };

  const fifaMatchNo = def.firstFifaMatchNo + input.matchIndex;
  const stageMatches = (input.tournamentMatches ?? []).filter(
    (m) => m.stage_code === def.stageCode,
  );
  const pub = publicMatchForFifaNo(stageMatches, def.stageCode, fifaMatchNo);
  if (pub && input.teams.length) {
    const homeFromFixture = input.teams.find(
      (t) =>
        (t.countryCode ?? "").trim().toUpperCase() ===
        (pub.home_country_code ?? "").trim().toUpperCase(),
    )?.id;
    const awayFromFixture = input.teams.find(
      (t) =>
        (t.countryCode ?? "").trim().toUpperCase() ===
        (pub.away_country_code ?? "").trim().toUpperCase(),
    )?.id;
    if (homeFromFixture || awayFromFixture) {
      return {
        homeTeamId: homeFromFixture ?? null,
        awayTeamId: awayFromFixture ?? null,
      };
    }
  }

  const resultKind = def.resultKind;
  const slotKey = slotKeyForMatchIndex(input.wizardKind, input.matchIndex);
  if (!resultKind || !slotKey) {
    return { homeTeamId: null, awayTeamId: null };
  }

  return resolveOfficialKnockoutSlotMatchupTeamIds({
    predictionKind: resultKind,
    slotKey,
    tournamentMatches: input.tournamentMatches,
    gradual: input.gradual,
    teams: input.teams,
  });
}

/**
 * Match-slot pick health: saved winner vs official matchup sides for this FIFA slot.
 * Upstream predicted opponents/paths do not affect validity.
 */
export function evaluateMatchSlotSavedPick(input: {
  wizardKind: KnockoutWizardBracketKind;
  matchIndex: number;
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  gradual: GradualKnockoutSelectionState;
  knockoutBracketPicksUnlocked?: boolean;
}): MatchSlotSavedPickEvaluation | null {
  if (input.knockoutBracketPicksUnlocked === false) return null;

  const { teamId: savedTeamId, pickStatus } = savedPickForMatchSlot(
    input.wizardKind,
    input.matchIndex,
    input.slots,
  );
  if (!savedTeamId) {
    return {
      status: "missing",
      savedTeamId: null,
      savedTeamInOfficialMatchup: false,
    };
  }

  const { homeTeamId, awayTeamId } = officialMatchupSidesForWizardMatch(input);
  const bothSidesKnown = Boolean(homeTeamId?.trim() && awayTeamId?.trim());
  const inMatchup = isValidSavedPickForMatchup({
    savedTeamId,
    homeTeamId,
    awayTeamId,
    pickStatus,
  });

  if (!bothSidesKnown) {
    return {
      status: pickStatus === "out" ? "out" : "live",
      savedTeamId,
      savedTeamInOfficialMatchup: false,
    };
  }

  if (
    pickStatus === "out" ||
    isKnockoutPickLockedOut({ teamId: savedTeamId, pickStatus })
  ) {
    return {
      status: "out",
      savedTeamId,
      savedTeamInOfficialMatchup: inMatchup,
    };
  }

  return {
    status: inMatchup ? "live" : "out",
    savedTeamId,
    savedTeamInOfficialMatchup: inMatchup,
  };
}

/**
 * @deprecated Upstream bracket-path validation removed — use
 * {@link evaluateMatchSlotSavedPick} for match-slot pick status.
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
  const slotEval = evaluateMatchSlotSavedPick(input);
  if (!slotEval) return null;

  const { homeTeamId, awayTeamId } = officialMatchupSidesForWizardMatch(input);
  if (!homeTeamId?.trim() || !awayTeamId?.trim()) return null;

  const issues: StrictBracketFeederIssue[] = [];
  if (slotEval.status === "out" && slotEval.savedTeamId) {
    issues.push({
      kind: "stale_path",
      feederSlotKey: slotKeyForMatchIndex(input.wizardKind, input.matchIndex) ?? "",
      feederMatchNo:
        (knockoutMatchStepDef(input.wizardKind)?.firstFifaMatchNo ?? 0) +
        input.matchIndex,
      participantPickTeamId: slotEval.savedTeamId,
      officialWinnerTeamId: null,
    });
  }

  return {
    issues,
    hasStalePath: slotEval.status === "out" && Boolean(slotEval.savedTeamId),
    hasMissingRequiredPick: slotEval.status === "missing",
    allFeedersValid: slotEval.status === "live" || slotEval.status === "missing",
    primaryStalePickTeamId:
      slotEval.status === "out" ? slotEval.savedTeamId : null,
  };
}

export function strictBracketStageLabel(
  wizardKind: KnockoutWizardBracketKind,
): string {
  return knockoutMatchStepDef(wizardKind)?.stageLabel ?? "match";
}

/** Participant-facing copy when a saved pick is not in the official match slot. */
export function matchSlotSavedPickStatusCopy(
  evaluation: MatchSlotSavedPickEvaluation,
  teams: Team[],
  wizardKind: KnockoutWizardBracketKind,
): string | null {
  if (evaluation.status === "missing") return null;
  const name =
    teamName(evaluation.savedTeamId, teams) ?? evaluation.savedTeamId ?? "That team";
  if (evaluation.status === "live") {
    return `Your original pick is still alive because ${name} is in this match.`;
  }
  if (evaluation.savedTeamInOfficialMatchup) {
    return `Your original pick is out — ${name} did not win this match.`;
  }
  return `Your original pick is out because ${name} did not reach this match.`;
}

/** @deprecated Use {@link matchSlotSavedPickStatusCopy}. */
export function strictBracketPathBlockedCopy(
  evaluation: StrictBracketPathEvaluation,
  teams: Team[],
  wizardKind: KnockoutWizardBracketKind,
): string {
  if (evaluation.hasStalePath && evaluation.primaryStalePickTeamId) {
    const name =
      teamName(evaluation.primaryStalePickTeamId, teams) ??
      evaluation.primaryStalePickTeamId;
    return `Your original pick is out because ${name} did not reach this match.`;
  }
  if (evaluation.hasMissingRequiredPick) {
    const stage = strictBracketStageLabel(wizardKind).toLowerCase();
    return `No saved pick for this ${stage} yet.`;
  }
  return matchSlotSavedPickStatusCopy(
    {
      status: "out",
      savedTeamId: evaluation.primaryStalePickTeamId,
      savedTeamInOfficialMatchup: false,
    },
    teams,
    wizardKind,
  )!;
}

/** True when participant must not save a new winner on this row (pick is locked). */
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
  return false;
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

/** @deprecated Upstream missing-feeder gating removed under match-slot pick rules. */
export function strictPathMissingUpstreamStillWaiting(
  _evaluation: StrictBracketPathEvaluation,
  _wizardKind: KnockoutWizardBracketKind,
  _upstreamRows: (kind: KnockoutWizardBracketKind) => KnockoutMatchPickRow[],
  _gradual: GradualKnockoutSelectionState,
): boolean {
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

  const saved = savedPickForMatchSlot(
    "round_of_16",
    slotNo - 1,
    input.slots,
  ).teamId;
  if (!saved) return true;

  return isValidSavedPickForMatchup({
    savedTeamId: saved,
    homeTeamId: official.topId,
    awayTeamId: official.bottomId,
  });
}
