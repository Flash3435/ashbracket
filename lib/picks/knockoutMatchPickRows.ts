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
import { isMatchStarted } from "./knockoutSelectionWindow";

export type KnockoutWizardBracketKind =
  | "round_of_16"
  | "quarterfinalist"
  | "semifinalist"
  | "finalist"
  | "champion";

export type KnockoutMatchLockReason = "pickable" | "incomplete" | "started";

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

function idsForKind(
  slots: KnockoutPickSlotDraft[],
  kind: KnockoutProgressionPredictionKind,
): Set<string> {
  const s = new Set<string>();
  for (const row of slots) {
    const id = row.teamId.trim();
    if (id && row.predictionKind === kind) s.add(id);
  }
  return s;
}

function pickWinnerAmongParticipants(
  homeId: string | null,
  awayId: string | null,
  nextRoundIds: Set<string>,
): string {
  const ha = homeId ? nextRoundIds.has(homeId) : false;
  const hb = awayId ? nextRoundIds.has(awayId) : false;
  if (ha && !hb) return homeId!;
  if (hb && !ha) return awayId!;
  return "";
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
      statusLine: incompleteMsg,
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
    return readConfirmedR32MatchWinner(matchIndex, slots);
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
 * Confirmed R32 match winner for later-round bracket rows: `round_of_16` slot
 * 1–16 and inference from that participant set — never raw `round_of_32` side picks.
 */
export function readConfirmedR32MatchWinner(
  matchIndex: number,
  slots: KnockoutPickSlotDraft[],
): string {
  const r16Key = r16SlotKeyForR32MatchIndex(matchIndex);
  const stored = slotTeamId(slots, "round_of_16", r16Key);
  if (stored) return stored;

  const { top, bottom } = r32SlotKeysForMatchIndex(matchIndex);
  const topId = slotTeamId(slots, "round_of_32", top) || null;
  const botId = slotTeamId(slots, "round_of_32", bottom) || null;

  // Legacy single-side winner before canonical `round_of_16` storage.
  if (topId && !botId) return topId;
  if (botId && !topId) return botId;

  const r16Participants = idsForKind(slots, "round_of_16");
  return pickWinnerAmongParticipants(topId, botId, r16Participants);
}

/** Which upstream R32 fixtures still need a confirmed winner for this R16 row. */
export function missingR32FifaMatchNosForR16Row(
  matchIndex: number,
  slots: KnockoutPickSlotDraft[],
): number[] {
  const pair = r16R32ParticipantPair(matchIndex);
  if (!pair) return [];
  return pair
    .filter((r32Index) => !readConfirmedR32MatchWinner(r32Index, slots))
    .map((r32Index) => 73 + r32Index);
}

export function incompleteR16MatchMessage(
  matchIndex: number,
  slots: KnockoutPickSlotDraft[],
): string {
  const missing = missingR32FifaMatchNosForR16Row(matchIndex, slots);
  if (missing.length === 0) return INCOMPLETE_UPSTREAM_MSG;
  const list = missing.map((n) => `M${n}`).join(" and ");
  return `Complete Round of 32 first — pick winners for ${list}.`;
}

/** Winner pick counts only when it matches that row's official matchup. */
export function validatedKnockoutMatchWinner(
  row: KnockoutMatchPickRow | undefined,
): string | null {
  if (!row) return null;
  const w = row.winnerTeamId.trim();
  if (!w || !row.homeTeamId || !row.awayTeamId) return null;
  if (w === row.homeTeamId || w === row.awayTeamId) return w;
  return null;
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

type BuildKnockoutMatchPickRowsInput = {
  bracketKind: KnockoutWizardBracketKind;
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  gradual?: GradualKnockoutSelectionState;
  knockoutBracketPicksUnlocked?: boolean;
  nowMs?: number;
};

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
    const home = readConfirmedR32MatchWinner(homeR32Index, input.slots);
    const away = readConfirmedR32MatchWinner(awayR32Index, input.slots);
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
  return {
    homeTeamId: validatedKnockoutMatchWinner(rows[homeIdx]),
    awayTeamId: validatedKnockoutMatchWinner(rows[awayIdx]),
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

    let lockReason: KnockoutMatchLockReason = "pickable";
    if (!homeTeamId || !awayTeamId) {
      lockReason = "incomplete";
    } else if (publicMatch && isMatchStarted(publicMatch, nowMs)) {
      lockReason = "started";
    }

    const incompleteMsg =
      def.wizardBracketKind === "round_of_16" && lockReason === "incomplete"
        ? incompleteR16MatchMessage(matchIndex, input.slots)
        : def.wizardBracketKind === "quarterfinalist" && lockReason === "incomplete"
          ? "Complete Round of 16 picks first."
          : def.wizardBracketKind === "semifinalist" && lockReason === "incomplete"
            ? "Complete quarter-final picks first."
            : def.wizardBracketKind === "finalist" && lockReason === "incomplete"
              ? FINAL_MATCH_INCOMPLETE_MSG
              : INCOMPLETE_UPSTREAM_MSG;

    const homeName = teamName(homeTeamId, input.teams);
    const awayName = teamName(awayTeamId, input.teams);
    const kickoffIso = publicMatch?.kickoff_at?.trim() || null;

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
      lockReason,
      kickoffIso,
      display: {
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
  if (teamId !== row.homeTeamId && teamId !== row.awayTeamId) {
    return "That team is not in this matchup.";
  }
  return null;
}
