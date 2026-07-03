import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { KnockoutProgressionPredictionKind } from "../predictions/knockoutProgressionKinds";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  knockoutParticipantSlotPair,
  r16R32ParticipantPair,
} from "../bracket/wc2026KnockoutPairings";
import { r32SlotKeysForMatchIndex } from "../bracket/wc2026RoundOf32";
import {
  type GradualKnockoutSelectionState,
  type R32SlotRowDisplay,
  readGradualR32MatchWinner,
  r16SlotKeyForR32MatchIndex,
} from "./gradualKnockoutUnlock";
import {
  isKnockoutMatchLockedForParticipant,
  isKnockoutSlotFrozenByOfficialFeeders,
} from "./knockoutPickEditability";
import { isMatchStarted } from "./knockoutSelectionWindow";
import {
  blockedKnockoutRowUserCopy,
  blockedKnockoutStepGateCopy,
} from "./knockoutBlockedRowExplanation";
import { isKnockoutPickLockedOut } from "../predictions/knockoutPickStatus";

export type KnockoutWizardBracketKind =
  | "round_of_16"
  | "quarterfinalist"
  | "semifinalist"
  | "finalist"
  | "champion";

export type KnockoutMatchLockReason = "pickable" | "incomplete" | "started" | "frozen";

export type KnockoutMatchPickRow = {
  matchIndex: number;
  fifaMatchNo: number;
  /** Stable UI key for React lists */
  rowKey: string;
  /** Draft row to update when saving the winner */
  saveRowKey: string;
  savePredictionKind: KnockoutProgressionPredictionKind;
  saveSlotKey: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  winnerTeamId: string;
  pickStatus: import("../predictions/knockoutPickStatus").KnockoutPickStatus | null;
  lockReason: KnockoutMatchLockReason;
  display: R32SlotRowDisplay;
  kickoffIso: string | null;
};

type KnockoutMatchStepDef = {
  wizardBracketKind: KnockoutWizardBracketKind;
  stageCode: string;
  stageLabel: string;
  matchCount: number;
  firstFifaMatchNo: number;
  resultKind: KnockoutProgressionPredictionKind;
  /** When set, sides come from paired slots of this kind (QF/SF/Final). */
  participantKind?: KnockoutProgressionPredictionKind;
};

const KNOCKOUT_MATCH_STEPS: readonly KnockoutMatchStepDef[] = [
  {
    wizardBracketKind: "round_of_16",
    stageCode: "round_of_16",
    stageLabel: "Round of 16",
    matchCount: 8,
    firstFifaMatchNo: 89,
    resultKind: "quarterfinalist",
  },
  {
    wizardBracketKind: "quarterfinalist",
    stageCode: "quarterfinal",
    stageLabel: "Quarter-finals",
    matchCount: 4,
    firstFifaMatchNo: 97,
    resultKind: "semifinalist",
    participantKind: "quarterfinalist",
  },
  {
    wizardBracketKind: "semifinalist",
    stageCode: "semifinal",
    stageLabel: "Semi-finals",
    matchCount: 2,
    firstFifaMatchNo: 101,
    resultKind: "finalist",
    participantKind: "semifinalist",
  },
  {
    wizardBracketKind: "finalist",
    stageCode: "final",
    stageLabel: "Final",
    matchCount: 1,
    firstFifaMatchNo: 104,
    resultKind: "champion",
    participantKind: "finalist",
  },
] as const;

const INCOMPLETE_UPSTREAM_MSG = "Complete previous round picks first.";
export const FINAL_MATCH_INCOMPLETE_MSG = "Complete semi-final picks first.";

export function knockoutMatchStepDef(
  bracketKind: KnockoutWizardBracketKind,
): KnockoutMatchStepDef | null {
  if (bracketKind === "champion") return null;
  return (
    KNOCKOUT_MATCH_STEPS.find((s) => s.wizardBracketKind === bracketKind) ??
    null
  );
}

export function usesKnockoutMatchPickRows(
  bracketKind: string,
  fullBracketPicksUnlocked: boolean,
): boolean {
  if (!fullBracketPicksUnlocked) return false;
  if (
    bracketKind === "round_of_32" ||
    bracketKind === "third_place_qualifier" ||
    bracketKind === "champion"
  ) {
    return false;
  }
  return knockoutMatchStepDef(bracketKind as KnockoutWizardBracketKind) != null;
}

function slotTeamId(
  slots: KnockoutPickSlotDraft[],
  kind: KnockoutProgressionPredictionKind,
  slotKey: string,
): string {
  return (
    slots
      .find((s) => s.predictionKind === kind && s.slotKey === slotKey)
      ?.teamId.trim() ?? ""
  );
}

export type ConfirmedR32WinnerContext = {
  teams?: Team[];
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  gradual?: GradualKnockoutSelectionState;
  knockoutBracketPicksUnlocked?: boolean;
};

function normalizeCountryCode(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

function teamIdForCountryCode(
  teams: Team[],
  code: string | null | undefined,
): string | null {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return null;
  const match = teams.find(
    (t) => normalizeCountryCode(t.countryCode) === normalized,
  );
  return match?.id ?? null;
}

function r32PublicMatchForIndex(
  tournamentMatches: TournamentMatchPublicRow[] | null | undefined,
  matchIndex: number,
): TournamentMatchPublicRow | null {
  const fifaMatchNo = 73 + matchIndex;
  const r32 = (tournamentMatches ?? []).filter(
    (m) => m.stage_code === "round_of_32",
  );
  const direct = `M${fifaMatchNo}`;
  return (
    r32.find((m) => m.match_code === direct) ??
    r32.find((m) => m.match_code.endsWith(`-${fifaMatchNo}`)) ??
    null
  );
}

function r32MatchSideTeamIds(
  matchIndex: number,
  slots: KnockoutPickSlotDraft[],
): { topId: string | null; bottomId: string | null } {
  const { top, bottom } = r32SlotKeysForMatchIndex(matchIndex);
  return {
    topId: slotTeamId(slots, "round_of_32", top) || null,
    bottomId: slotTeamId(slots, "round_of_32", bottom) || null,
  };
}

function officialR32ParticipantIdsFromFixture(
  matchIndex: number,
  ctx?: ConfirmedR32WinnerContext,
): { topId: string | null; bottomId: string | null } | null {
  const ms = ctx?.gradual?.matchStates[matchIndex];
  if (!ms) return null;

  let topId = ms.homeTeamId ?? null;
  let bottomId = ms.awayTeamId ?? null;
  if (ctx?.teams?.length) {
    const pub = r32PublicMatchForIndex(ctx.tournamentMatches, matchIndex);
    if (pub) {
      topId = topId ?? teamIdForCountryCode(ctx.teams, pub.home_country_code);
      bottomId =
        bottomId ?? teamIdForCountryCode(ctx.teams, pub.away_country_code);
    }
  }
  // Fixture / gradual teams are authoritative — do not fall back to legacy slots.
  if (topId || bottomId) return { topId, bottomId };
  if (!ms.confirmed) return null;
  return null;
}

/** Official R32 matchup participants from slots, gradual unlock, and tournament data. */
export function officialR32ParticipantIds(
  matchIndex: number,
  slots: KnockoutPickSlotDraft[],
  ctx?: ConfirmedR32WinnerContext,
): { topId: string | null; bottomId: string | null } {
  const fromFixture = officialR32ParticipantIdsFromFixture(matchIndex, ctx);
  if (fromFixture) return fromFixture;

  const { topId: slotTop, bottomId: slotBottom } = r32MatchSideTeamIds(
    matchIndex,
    slots,
  );
  let topId = slotTop;
  let bottomId = slotBottom;

  const ms = ctx?.gradual?.matchStates[matchIndex];
  if (ms) {
    topId = topId ?? ms.homeTeamId ?? null;
    bottomId = bottomId ?? ms.awayTeamId ?? null;
  }

  if (ctx?.teams?.length) {
    const pub = r32PublicMatchForIndex(ctx.tournamentMatches, matchIndex);
    if (pub) {
      topId = topId ?? teamIdForCountryCode(ctx.teams, pub.home_country_code);
      bottomId =
        bottomId ?? teamIdForCountryCode(ctx.teams, pub.away_country_code);
    }
  }

  return { topId, bottomId };
}

function officialR32ResultWinner(
  matchIndex: number,
  ctx?: ConfirmedR32WinnerContext,
): string | null {
  if (!ctx?.teams?.length) return null;
  const pub = r32PublicMatchForIndex(ctx.tournamentMatches, matchIndex);
  if (!pub?.winner_country_code?.trim()) return null;
  return teamIdForCountryCode(ctx.teams, pub.winner_country_code);
}

/** Official R32 winner from published fixture results (not participant picks). */
export function readOfficialR32MatchResultWinner(
  matchIndex: number,
  ctx?: ConfirmedR32WinnerContext,
): string | null {
  return officialR32ResultWinner(matchIndex, ctx);
}

/** Official knockout winner from a published M89–M104 fixture (not participant picks). */
export function officialKnockoutMatchResultWinner(
  fifaMatchNo: number,
  stageCode: string,
  teams: Team[],
  tournamentMatches?: TournamentMatchPublicRow[] | null,
): string | null {
  if (!teams.length || fifaMatchNo <= 0) return null;
  const stageMatches = (tournamentMatches ?? []).filter(
    (m) => m.stage_code === stageCode,
  );
  const pub = publicMatchForFifaNo(stageMatches, stageCode, fifaMatchNo);
  if (!pub?.winner_country_code?.trim()) return null;
  return teamIdForCountryCode(teams, pub.winner_country_code);
}

function isTeamInR32Match(
  teamId: string,
  topId: string | null,
  bottomId: string | null,
): boolean {
  return (
    (topId != null && teamId === topId) ||
    (bottomId != null && teamId === bottomId)
  );
}

function confirmedR32WinnerContextFromBuildInput(
  input: BuildKnockoutMatchPickRowsInput,
): ConfirmedR32WinnerContext {
  return {
    teams: input.teams,
    tournamentMatches: input.tournamentMatches,
    gradual: input.gradual,
    knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
  };
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

function teamName(teamId: string | null, teams: Team[]): string | null {
  if (!teamId?.trim()) return null;
  const t = teams.find((x) => x.id === teamId.trim());
  return t?.name?.trim() || null;
}

function matchRowDisplay(
  stageLabel: string,
  fifaMatchNo: number,
  homeName: string | null,
  awayName: string | null,
  lockReason: KnockoutMatchLockReason,
  options?: {
    championPick?: boolean;
    incompleteMsg?: string;
  },
): R32SlotRowDisplay {
  const heading =
    fifaMatchNo > 0 ? `M${fifaMatchNo} · ${stageLabel}` : stageLabel;
  const matchupLine =
    homeName && awayName ? `${homeName} vs ${awayName}` : null;
  const championPick = options?.championPick === true;
  const chooseButtonLabel = championPick ? "Pick champion" : "Pick winner";
  const incompleteMsg =
    options?.incompleteMsg ??
    (championPick ? FINAL_MATCH_INCOMPLETE_MSG : INCOMPLETE_UPSTREAM_MSG);

  if (lockReason === "incomplete") {
    return {
      heading,
      emptyPrimaryLine: incompleteMsg,
      kickoffIso: null,
      statusLine: null,
      chooseButtonLabel,
    };
  }

  if (lockReason === "started") {
    return {
      heading,
      emptyPrimaryLine: matchupLine ?? "Locked at kickoff",
      kickoffIso: null,
      statusLine: "Locked at kickoff",
      chooseButtonLabel,
    };
  }

  if (lockReason === "frozen") {
    return {
      heading,
      emptyPrimaryLine: matchupLine ?? "Locked",
      kickoffIso: null,
      statusLine: "Locked — feeder results are official.",
      chooseButtonLabel,
    };
  }

  return {
    heading,
    emptyPrimaryLine: matchupLine ?? "Pick needed",
    kickoffIso: null,
    statusLine: null,
    chooseButtonLabel,
  };
}

/**
 * R32 match winner for bracket progression — gradual `round_of_16` storage, legacy
 * `round_of_32` slots, or official inference from the round_of_16 participant set.
 */
export function readR32MatchWinnerForBracket(
  matchIndex: number,
  slots: KnockoutPickSlotDraft[],
  teams: Team[],
  options: {
    gradual?: GradualKnockoutSelectionState;
    knockoutBracketPicksUnlocked?: boolean;
  },
): string {
  if (options.knockoutBracketPicksUnlocked) {
    return readConfirmedR32MatchWinner(matchIndex, slots, {
      teams,
      gradual: options.gradual,
      knockoutBracketPicksUnlocked: true,
    });
  }

  const ms = options.gradual?.matchStates[matchIndex];
  if (ms) {
    const w = readGradualR32MatchWinner(matchIndex, slots, teams, ms);
    if (w) return w;
  }

  const { top, bottom } = r32SlotKeysForMatchIndex(matchIndex);
  const topId = slotTeamId(slots, "round_of_32", top) || null;
  const botId = slotTeamId(slots, "round_of_32", bottom) || null;
  const r16Key = r16SlotKeyForR32MatchIndex(matchIndex);
  const stored = slotTeamId(slots, "round_of_16", r16Key);
  if (stored) return stored;
  return topId || botId || "";
}

/**
 * Participant's saved winner for an R32 matchup (ignores official results).
 */
export function readParticipantR32MatchWinnerPick(
  matchIndex: number,
  slots: KnockoutPickSlotDraft[],
  ctx?: ConfirmedR32WinnerContext,
): string {
  const ms = ctx?.gradual?.matchStates[matchIndex];
  if (ms && ctx?.teams?.length) {
    const gradualWinner = readGradualR32MatchWinner(
      matchIndex,
      slots,
      ctx.teams,
      ms,
    );
    if (gradualWinner) {
      return gradualWinner;
    }
  }

  const r16Key = r16SlotKeyForR32MatchIndex(matchIndex);
  const stored = slotTeamId(slots, "round_of_16", r16Key);
  const { topId, bottomId: botId } = officialR32ParticipantIds(
    matchIndex,
    slots,
    ctx,
  );
  const hasParticipants = topId != null || botId != null;

  if (stored) {
    if (!hasParticipants || isTeamInR32Match(stored, topId, botId)) {
      return stored;
    }
  }

  if (topId && !botId) return topId;
  if (botId && !topId) return botId;

  return "";
}

/**
 * Confirmed R32 match winner for later-round bracket rows: canonical `round_of_16`
 * slot 1–16 when valid, otherwise a single known official `round_of_32` side.
 * When an official result exists, that winner is returned.
 */
export function readConfirmedR32MatchWinner(
  matchIndex: number,
  slots: KnockoutPickSlotDraft[],
  ctx?: ConfirmedR32WinnerContext,
): string {
  const resultWinner = officialR32ResultWinner(matchIndex, ctx);
  if (resultWinner) {
    return resultWinner;
  }

  return readParticipantR32MatchWinnerPick(matchIndex, slots, ctx);
}

/** Which upstream R32 fixtures still need a confirmed winner for this R16 row. */
export function missingR32FifaMatchNosForR16Row(
  matchIndex: number,
  slots: KnockoutPickSlotDraft[],
  ctx?: ConfirmedR32WinnerContext,
): number[] {
  const pair = r16R32ParticipantPair(matchIndex);
  if (!pair) return [];
  return pair
    .filter((r32Index) => !readConfirmedR32MatchWinner(r32Index, slots, ctx))
    .map((r32Index) => 73 + r32Index);
}

export function incompleteR16MatchMessage(
  matchIndex: number,
  slots: KnockoutPickSlotDraft[],
  ctx?: ConfirmedR32WinnerContext,
): string {
  const missing = missingR32FifaMatchNosForR16Row(matchIndex, slots, ctx);
  if (missing.length === 0) return INCOMPLETE_UPSTREAM_MSG;
  const list = missing.map((n) => `M${n}`).join(" and ");
  return `Complete Round of 32 first — pick winners for ${list}.`;
}

/** Winner pick counts only when it matches that row's official matchup. */
export function validatedKnockoutMatchWinner(
  row: KnockoutMatchPickRow | undefined,
): string | null {
  if (!row) return null;
  if (row.pickStatus === "out") return null;
  const w = row.winnerTeamId.trim();
  if (!w || !row.homeTeamId || !row.awayTeamId) return null;
  if (w === row.homeTeamId || w === row.awayTeamId) return w;
  return null;
}

export type KnockoutMatchSavedPickStatus = "valid" | "missing" | "stale";

export type KnockoutMatchSavedPickPresentation = {
  savedPickTeamId: string | null;
  savedPickLabel: string | null;
  savedPickStatus: KnockoutMatchSavedPickStatus;
  savedPickSummaryLine: string;
  savedPickWarning: string | null;
  lockStatusLine: string | null;
  matchupLine: string | null;
};

function knockoutMatchRowMatchupLine(row: KnockoutMatchPickRow): string | null {
  const primary = row.display.emptyPrimaryLine?.trim() ?? "";
  if (primary.includes(" vs ")) return primary;
  return null;
}

/** Prefer stored slot data for locked rows when display pruning cleared the visible winner. */
export function mergeKnockoutMatchRowSavedPickFromSlots(
  row: KnockoutMatchPickRow,
  slots: KnockoutPickSlotDraft[],
): KnockoutMatchPickRow {
  if (row.winnerTeamId.trim()) return row;
  if (row.lockReason !== "frozen" && row.lockReason !== "started") return row;
  const saveRow = slots.find((s) => s.rowKey === row.saveRowKey);
  if (!saveRow?.teamId.trim()) return row;
  return {
    ...row,
    winnerTeamId: saveRow.teamId.trim(),
    pickStatus: saveRow.pickStatus ?? row.pickStatus,
  };
}

/** Saved pick copy for locked knockout rows — uses stored slot data, not validated draft state. */
export function knockoutMatchSavedPickPresentation(
  row: KnockoutMatchPickRow,
  teams: Team[],
): KnockoutMatchSavedPickPresentation {
  const savedPickTeamId = row.winnerTeamId.trim() || null;
  const savedPickLabel = savedPickTeamId
    ? teamName(savedPickTeamId, teams)
    : null;
  const validatedId = validatedKnockoutMatchWinner(row);

  let savedPickStatus: KnockoutMatchSavedPickStatus;
  if (!savedPickTeamId) {
    savedPickStatus = "missing";
  } else if (validatedId) {
    savedPickStatus = "valid";
  } else {
    savedPickStatus = "stale";
  }

  const savedPickSummaryLine =
    savedPickStatus === "missing"
      ? "No pick saved"
      : `Saved pick: ${savedPickLabel ?? savedPickTeamId}`;

  let savedPickWarning: string | null = null;
  if (row.pickStatus === "out" && savedPickTeamId) {
    savedPickWarning =
      row.lockReason === "frozen" || row.lockReason === "started"
        ? "Saved pick is eliminated or no longer matches this matchup."
        : (row.display.statusLine ?? "Pick out");
  } else if (savedPickStatus === "stale") {
    savedPickWarning =
      row.lockReason === "frozen" || row.lockReason === "started"
        ? "Saved pick is eliminated or no longer matches this matchup."
        : "Does not match this matchup anymore.";
  }

  let lockStatusLine: string | null = null;
  if (row.lockReason === "started") {
    lockStatusLine = row.display.statusLine ?? "Locked at kickoff";
  } else if (row.lockReason === "frozen") {
    lockStatusLine = "Locked — feeder results are official.";
  }

  return {
    savedPickTeamId,
    savedPickLabel,
    savedPickStatus,
    savedPickSummaryLine,
    savedPickWarning,
    lockStatusLine,
    matchupLine: knockoutMatchRowMatchupLine(row),
  };
}

/**
 * Bracket progression winner: valid participant pick, otherwise the published
 * fixture result when the row is locked by official feeders or kickoff.
 */
export function readConfirmedKnockoutMatchWinner(
  row: KnockoutMatchPickRow,
  bracketKind: KnockoutWizardBracketKind,
  input: BuildKnockoutMatchPickRowsInput,
): string | null {
  const participant = validatedKnockoutMatchWinner(row);
  if (participant) return participant;

  const def = knockoutMatchStepDef(bracketKind);
  if (!def) return null;

  const official = officialKnockoutMatchResultWinner(
    row.fifaMatchNo,
    def.stageCode,
    input.teams,
    input.tournamentMatches,
  );
  if (!official) return null;
  if (row.homeTeamId && row.awayTeamId) {
    if (official === row.homeTeamId || official === row.awayTeamId) {
      return official;
    }
    return null;
  }
  return official;
}

function buildInputForBracketKind(
  input: BuildKnockoutMatchPickRowsInput,
  bracketKind: KnockoutWizardBracketKind,
): BuildKnockoutMatchPickRowsInput {
  return { ...input, bracketKind };
}

export function isKnockoutMatchDirectPickEligible(
  row: KnockoutMatchPickRow,
): boolean {
  return (
    row.lockReason === "pickable" &&
    Boolean(row.homeTeamId?.trim()) &&
    Boolean(row.awayTeamId?.trim())
  );
}

export function knockoutMatchTeamPickAriaLabel(input: {
  teamName: string;
  fifaMatchNo: number;
  pickKind: "winner" | "champion";
}): string {
  const matchRef = input.fifaMatchNo > 0 ? `M${input.fifaMatchNo}` : "the final";
  if (input.pickKind === "champion") {
    return `Pick ${input.teamName} as champion in ${matchRef}`;
  }
  return `Pick ${input.teamName} to win ${matchRef}`;
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

export type BuildKnockoutMatchPickRowsInput = {
  bracketKind: KnockoutWizardBracketKind;
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  gradual?: GradualKnockoutSelectionState;
  knockoutBracketPicksUnlocked?: boolean;
  nowMs?: number;
  clearedPickRowKeys?: ReadonlySet<string>;
};

/** Friendly copy for a pickable or upstream-blocked knockout matchup. */
export function formatMissingKnockoutDependencyLabel(
  row: KnockoutMatchPickRow,
  options?: { clearedByRepair?: boolean },
): string {
  if (row.lockReason === "pickable" && !validatedKnockoutMatchWinner(row)) {
    const matchup = row.display.emptyPrimaryLine;
    if (
      matchup &&
      matchup !== "Pick needed" &&
      !matchup.startsWith("Complete ")
    ) {
      if (options?.clearedByRepair) {
        return `This pick was cleared because it no longer fits the official path. Pick a winner for ${matchup}.`;
      }
      return `Pick a winner for ${matchup} first.`;
    }
    if (options?.clearedByRepair) {
      return "This pick was cleared because it no longer fits the official path.";
    }
  }
  if (row.fifaMatchNo > 0) {
    return `Complete M${row.fifaMatchNo} first.`;
  }
  return row.display.emptyPrimaryLine ?? INCOMPLETE_UPSTREAM_MSG;
}

function buildRowExplanationOptions(input: BuildKnockoutMatchPickRowsInput) {
  return input.clearedPickRowKeys
    ? { clearedPickRowKeys: input.clearedPickRowKeys }
    : undefined;
}

/** Row gate copy when sides are unknown — names the first unresolved upstream feeder. */
export function upstreamIncompleteMessageForRow(
  row: KnockoutMatchPickRow,
  bracketKind: KnockoutWizardBracketKind,
  input: BuildKnockoutMatchPickRowsInput,
): string {
  return blockedKnockoutRowUserCopy(
    row,
    bracketKind,
    input,
    buildRowExplanationOptions(input),
  );
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

/**
 * Deepest actionable blocker for a knockout wizard step — pickable gaps first,
 * then upstream incomplete feeders (e.g. a missing QF winner blocking M101).
 */
export function findDeepestBlockingKnockoutDependency(
  input: BuildKnockoutMatchPickRowsInput,
): string | null {
  return blockedKnockoutStepGateCopy(
    input.bracketKind,
    input,
    buildRowExplanationOptions(input),
  );
}

function readMatchSides(
  def: KnockoutMatchStepDef,
  matchIndex: number,
  input: BuildKnockoutMatchPickRowsInput,
  upstreamRows: (kind: KnockoutWizardBracketKind) => KnockoutMatchPickRow[],
): { homeTeamId: string | null; awayTeamId: string | null } {
  if (def.wizardBracketKind === "round_of_16") {
    const pair = r16R32ParticipantPair(matchIndex);
    if (!pair) {
      return { homeTeamId: null, awayTeamId: null };
    }
    const [homeR32Index, awayR32Index] = pair;
    const r32Ctx = confirmedR32WinnerContextFromBuildInput(input);
    const home = readConfirmedR32MatchWinner(
      homeR32Index,
      input.slots,
      r32Ctx,
    );
    const away = readConfirmedR32MatchWinner(
      awayR32Index,
      input.slots,
      r32Ctx,
    );
    return {
      homeTeamId: home || null,
      awayTeamId: away || null,
    };
  }

  const upstreamKind = upstreamWizardKindForMatchSides(def.wizardBracketKind);
  const slotStage = slotStageForWizardKind(def.wizardBracketKind);
  if (!upstreamKind || !slotStage) {
    return { homeTeamId: null, awayTeamId: null };
  }

  const slotPair = knockoutParticipantSlotPair(slotStage, matchIndex);
  if (!slotPair) {
    return { homeTeamId: null, awayTeamId: null };
  }

  const rows = upstreamRows(upstreamKind);
  const homeIdx = parseInt(slotPair[0], 10) - 1;
  const awayIdx = parseInt(slotPair[1], 10) - 1;
  const upstreamInput = buildInputForBracketKind(input, upstreamKind);
  const homeRow = rows[homeIdx];
  const awayRow = rows[awayIdx];
  return {
    homeTeamId: homeRow
      ? readConfirmedKnockoutMatchWinner(homeRow, upstreamKind, upstreamInput)
      : null,
    awayTeamId: awayRow
      ? readConfirmedKnockoutMatchWinner(awayRow, upstreamKind, upstreamInput)
      : null,
  };
}

function resultSlotKeyForMatch(
  def: KnockoutMatchStepDef,
  matchIndex: number,
): string | null {
  if (def.resultKind === "champion") return null;
  return String(matchIndex + 1);
}

function findSaveRow(
  slots: KnockoutPickSlotDraft[],
  kind: KnockoutProgressionPredictionKind,
  slotKey: string | null,
): KnockoutPickSlotDraft | undefined {
  if (kind === "champion") {
    return slots.find((s) => s.predictionKind === "champion");
  }
  return slots.find((s) => s.predictionKind === kind && s.slotKey === slotKey);
}

export function buildKnockoutMatchPickRows(
  input: BuildKnockoutMatchPickRowsInput,
): KnockoutMatchPickRow[] {
  const def = knockoutMatchStepDef(input.bracketKind);
  if (!def) return [];

  const nowMs = input.nowMs ?? Date.now();
  const gradual = input.gradual ?? {
    r32MatchCount: 16,
    confirmedCount: 0,
    pickableCount: 0,
    pendingCount: 16,
    allR32Confirmed: false,
    anyR32Started: false,
    earliestPickableKickoffIso: null,
    matchStates: [],
  };
  const stageMatches = (input.tournamentMatches ?? []).filter(
    (m) => m.stage_code === def.stageCode,
  );

  const upstreamCache = new Map<
    KnockoutWizardBracketKind,
    KnockoutMatchPickRow[]
  >();
  const upstreamRows = (kind: KnockoutWizardBracketKind): KnockoutMatchPickRow[] => {
    let cached = upstreamCache.get(kind);
    if (!cached) {
      cached = buildKnockoutMatchPickRows({ ...input, bracketKind: kind });
      upstreamCache.set(kind, cached);
    }
    return cached;
  };

  return Array.from({ length: def.matchCount }, (_, matchIndex) => {
    const fifaMatchNo = def.firstFifaMatchNo + matchIndex;
    const publicMatch = publicMatchForFifaNo(
      stageMatches,
      def.stageCode,
      fifaMatchNo,
    );
    const { homeTeamId, awayTeamId } = readMatchSides(
      def,
      matchIndex,
      input,
      upstreamRows,
    );
    const saveSlotKey = resultSlotKeyForMatch(def, matchIndex);
    const saveRow = findSaveRow(input.slots, def.resultKind, saveSlotKey);
    const winnerTeamId = saveRow?.teamId.trim() ?? "";
    const pickStatus = saveRow?.pickStatus ?? null;
    const pickOut = isKnockoutPickLockedOut(
      saveRow ?? { pickStatus: null, teamId: "" },
    );

    let lockReason: KnockoutMatchLockReason = "pickable";
    if (!homeTeamId || !awayTeamId) {
      lockReason = "incomplete";
    } else if (
      publicMatch &&
      isKnockoutMatchLockedForParticipant(publicMatch, nowMs)
    ) {
      lockReason = "started";
    } else if (
      isKnockoutSlotFrozenByOfficialFeeders({
        predictionKind: def.resultKind,
        slotKey: saveSlotKey,
        tournamentMatches: input.tournamentMatches,
        gradual,
      })
    ) {
      lockReason = "frozen";
    }

    const homeName = teamName(homeTeamId, input.teams);
    const awayName = teamName(awayTeamId, input.teams);
    const kickoffIso = publicMatch?.kickoff_at?.trim() || null;

    const incompleteMsg =
      lockReason === "incomplete"
        ? upstreamIncompleteMessageForRow(
            {
              matchIndex,
              fifaMatchNo,
              rowKey: "",
              saveRowKey: "",
              savePredictionKind: def.resultKind,
              saveSlotKey,
              homeTeamId,
              awayTeamId,
              winnerTeamId,
              pickStatus: null,
              lockReason,
              display: matchRowDisplay(
                def.stageLabel,
                fifaMatchNo,
                homeName,
                awayName,
                lockReason,
              ),
              kickoffIso,
            },
            def.wizardBracketKind,
            input,
          )
        : INCOMPLETE_UPSTREAM_MSG;

    return {
      matchIndex,
      fifaMatchNo,
      rowKey: `${def.wizardBracketKind}|match|${matchIndex + 1}`,
      saveRowKey:
        saveRow?.rowKey ??
        (def.resultKind === "champion"
          ? "champion|"
          : `${def.resultKind}|${saveSlotKey}`),
      savePredictionKind: def.resultKind,
      saveSlotKey,
      homeTeamId,
      awayTeamId,
      winnerTeamId,
      pickStatus,
      lockReason,
      kickoffIso,
      display: {
        ...(pickOut
          ? {
              heading: matchRowDisplay(
                def.stageLabel,
                fifaMatchNo,
                homeName,
                awayName,
                lockReason,
              ).heading,
              emptyPrimaryLine: `${teamName(winnerTeamId, input.teams)} · Out`,
              kickoffIso,
              statusLine: "Pick out",
              chooseButtonLabel: matchRowDisplay(
                def.stageLabel,
                fifaMatchNo,
                homeName,
                awayName,
                lockReason,
              ).chooseButtonLabel,
            }
          : {
              ...matchRowDisplay(
                def.stageLabel,
                fifaMatchNo,
                homeName,
                awayName,
                lockReason,
                {
                  championPick: def.resultKind === "champion",
                  incompleteMsg,
                },
              ),
              kickoffIso,
            }),
      },
    };
  });
}

/** Ensures a champion draft row exists before writing a final-match winner. */
export function ensureChampionPickSlot(
  slots: KnockoutPickSlotDraft[],
): KnockoutPickSlotDraft[] {
  if (slots.some((s) => s.predictionKind === "champion")) return slots;
  const tournamentStageId =
    slots.find((s) => s.predictionKind === "finalist")?.tournamentStageId ??
    slots.find((s) => s.predictionKind === "semifinalist")?.tournamentStageId ??
    null;
  if (!tournamentStageId) return slots;
  return [
    ...slots,
    {
      rowKey: "champion|",
      sectionLabel: "Champion",
      slotLabel: "Champion",
      predictionKind: "champion",
      tournamentStageId,
      slotKey: null,
      groupCode: null,
      bonusKey: null,
      teamId: "",
    },
  ];
}

export function allowedTeamsForKnockoutMatchRow(
  row: KnockoutMatchPickRow,
  teams: Team[],
): Team[] {
  if (row.lockReason !== "pickable") return [];
  const ids = [row.homeTeamId, row.awayTeamId].filter(
    (id): id is string => Boolean(id),
  );
  return teams.filter((t) => ids.includes(t.id));
}

export function applyKnockoutMatchWinnerToSlots(
  slots: KnockoutPickSlotDraft[],
  row: Pick<
    KnockoutMatchPickRow,
    "saveRowKey" | "savePredictionKind" | "saveSlotKey" | "homeTeamId" | "awayTeamId"
  >,
  teamId: string,
): KnockoutPickSlotDraft[] {
  const id = teamId.trim();
  if (id) {
    const allowed = new Set(
      [row.homeTeamId, row.awayTeamId].filter((x): x is string => Boolean(x)),
    );
    if (!allowed.has(id)) return slots;
  }

  const baseSlots =
    row.savePredictionKind === "champion"
      ? ensureChampionPickSlot(slots)
      : slots;

  const saveRow = baseSlots.find((s) => s.rowKey === row.saveRowKey);
  if (saveRow) {
    return baseSlots.map((s) =>
      s.rowKey === row.saveRowKey ? { ...s, teamId: id } : s,
    );
  }

  const fallback = baseSlots.find((s) => {
    if (s.predictionKind !== row.savePredictionKind) return false;
    if (row.savePredictionKind === "champion") return true;
    return s.slotKey === row.saveSlotKey;
  });
  if (!fallback) return baseSlots;
  return baseSlots.map((s) =>
    s.rowKey === fallback.rowKey ? { ...s, teamId: id } : s,
  );
}

export function countKnockoutMatchupsFilled(
  rows: KnockoutMatchPickRow[],
  options?: { onlyPickable?: boolean },
): number {
  return rows.filter((r) => {
    if (options?.onlyPickable && r.lockReason !== "pickable") return false;
    return Boolean(validatedKnockoutMatchWinner(r));
  }).length;
}

export function pickableKnockoutMatchRows(
  rows: KnockoutMatchPickRow[],
): KnockoutMatchPickRow[] {
  return rows.filter((r) => r.lockReason === "pickable");
}

/** Pickable matchups still missing a winner. Blocked rows are excluded. */
export function countPickableKnockoutMissing(
  rows: KnockoutMatchPickRow[],
): number {
  return pickableKnockoutMatchRows(rows).filter(
    (r) => !validatedKnockoutMatchWinner(r),
  ).length;
}

/** All currently pickable matchups have winners (future rounds may still be blocked). */
export function knockoutMatchStepCaughtUp(
  rows: KnockoutMatchPickRow[],
): boolean {
  return countPickableKnockoutMissing(rows) === 0;
}

export function knockoutMatchStepComplete(
  rows: KnockoutMatchPickRow[],
): boolean {
  if (rows.length === 0) return false;
  return rows.every((r) => Boolean(validatedKnockoutMatchWinner(r)));
}

export function validateKnockoutLaterMatchPick(
  row: KnockoutMatchPickRow,
  selectedTeamId: string,
): string | null {
  const teamId = selectedTeamId.trim();
  if (!teamId) return null;
  if (row.lockReason === "incomplete") {
    return row.savePredictionKind === "champion"
      ? FINAL_MATCH_INCOMPLETE_MSG
      : INCOMPLETE_UPSTREAM_MSG;
  }
  if (row.lockReason === "started") {
    return "This match has already kicked off and can no longer be edited.";
  }
  if (row.lockReason === "frozen") {
    return "This pick is locked because feeder match results are official.";
  }
  if (teamId !== row.homeTeamId && teamId !== row.awayTeamId) {
    return "That team is not in this matchup.";
  }
  return null;
}
