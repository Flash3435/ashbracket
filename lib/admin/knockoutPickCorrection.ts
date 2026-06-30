import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { ParticipantPickSlotPayload } from "../../types/knockoutPicksSave";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { WC2026_R32_MATCH_DEFS } from "../bracket/wc2026RoundOf32";
import { isKnockoutProgressionKind } from "../predictions/knockoutProgressionKinds";
import { pruneOfficialKnockoutPathPicks } from "../predictions/pruneOfficialKnockoutPathPicks";
import {
  applyGradualR32MatchWinnerToSlots,
  getGradualKnockoutSelectionState,
  isFullKnockoutBracketPicksUnlocked,
  r16SlotKeyForR32MatchIndex,
  readGradualR32MatchWinner,
  type GradualKnockoutSelectionState,
} from "../picks/gradualKnockoutUnlock";
import {
  applyKnockoutMatchWinnerToSlots,
  buildKnockoutMatchPickRows,
  type KnockoutMatchPickRow,
  type KnockoutWizardBracketKind,
} from "../picks/knockoutMatchPickRows";

export const KNOCKOUT_PICK_CORRECTION_REASON_REQUIRED =
  "A reason is required for admin pick corrections.";

export const KNOCKOUT_PICK_CORRECTION_ALREADY_MATCHES_SAVED =
  "This correction already matches the saved pick.";

export type KnockoutPickCorrectionMatch = {
  matchCode: string;
  fifaMatchNo: number;
  predictionKind: string;
  slotKey: string | null;
  tournamentStageId: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  oldTeamId: string;
  allowedTeamIds: string[];
  isStarted: boolean;
  /** For R16+ match-row corrections */
  knockoutMatchRow?: KnockoutMatchPickRow;
};

export type KnockoutPickCorrectionApplyResult = {
  slots: KnockoutPickSlotDraft[];
  cleared: ReturnType<typeof pruneOfficialKnockoutPathPicks>["cleared"];
  /** Material DB writes for this admin correction (not a participant pick diff). */
  writePayloads: ParticipantPickSlotPayload[];
  /** @deprecated Prefer `writePayloads`. Kept for dry-run scripts. */
  changedPayloads: ParticipantPickSlotPayload[];
};

const R32_FIRST = WC2026_R32_MATCH_DEFS[0]!.fifaMatchNo;
const R32_LAST =
  WC2026_R32_MATCH_DEFS[WC2026_R32_MATCH_DEFS.length - 1]!.fifaMatchNo;

const LATER_KNOCKOUT_MATCH_RANGES: {
  bracketKind: KnockoutWizardBracketKind;
  firstFifa: number;
  count: number;
}[] = [
  { bracketKind: "round_of_16", firstFifa: 89, count: 8 },
  { bracketKind: "quarterfinalist", firstFifa: 97, count: 4 },
  { bracketKind: "semifinalist", firstFifa: 101, count: 2 },
  { bracketKind: "finalist", firstFifa: 104, count: 1 },
];

export function parseFifaMatchCode(matchCode: string): number | null {
  const trimmed = matchCode.trim().toUpperCase();
  const m = /^M(\d{2,3})$/.exec(trimmed);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  return Number.isFinite(n) ? n : null;
}

export function validateKnockoutPickCorrectionReason(
  reason: string | null | undefined,
): string | null {
  const trimmed = (reason ?? "").trim();
  if (!trimmed) return KNOCKOUT_PICK_CORRECTION_REASON_REQUIRED;
  if (trimmed.length < 8) {
    return "Please provide a more descriptive reason (at least 8 characters).";
  }
  return null;
}

function normalizeCountryCode(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

function slotTeamId(
  slots: KnockoutPickSlotDraft[],
  kind: string,
  slotKey: string | null,
): string {
  return (
    slots
      .find((s) => s.predictionKind === kind && s.slotKey === slotKey)
      ?.teamId.trim() ?? ""
  );
}

function tournamentStageIdForKind(
  slots: KnockoutPickSlotDraft[],
  kind: string,
): string | null {
  return slots.find((s) => s.predictionKind === kind)?.tournamentStageId ?? null;
}

function resolveR32CorrectionMatch(input: {
  fifaMatchNo: number;
  matchCode: string;
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  gradual: GradualKnockoutSelectionState;
}): { match: KnockoutPickCorrectionMatch } | { error: string } {
  const matchIndex = input.fifaMatchNo - R32_FIRST;
  const ms = input.gradual.matchStates[matchIndex];
  if (!ms) {
    return { error: `Unknown Round of 32 match ${input.matchCode}.` };
  }
  if (!ms.started) {
    return {
      error: `${input.matchCode} has not kicked off yet; use the normal pick editor.`,
    };
  }
  const allowedTeamIds = [ms.homeTeamId, ms.awayTeamId].filter(
    (id): id is string => Boolean(id),
  );
  if (allowedTeamIds.length < 2) {
    return {
      error: `${input.matchCode} does not have both teams confirmed yet.`,
    };
  }

  const r16Key = r16SlotKeyForR32MatchIndex(matchIndex);
  const tournamentStageId =
    input.slots.find(
      (s) => s.predictionKind === "round_of_16" && s.slotKey === r16Key,
    )?.tournamentStageId ??
    tournamentStageIdForKind(input.slots, "round_of_16") ??
    tournamentStageIdForKind(input.slots, "round_of_32");
  if (!tournamentStageId) {
    return { error: "Tournament stage for Round of 32 picks is missing." };
  }

  const oldTeamId = readGradualR32MatchWinner(
    matchIndex,
    input.slots,
    input.teams,
    ms,
  );

  return {
    match: {
      matchCode: input.matchCode,
      fifaMatchNo: input.fifaMatchNo,
      predictionKind: "round_of_16",
      slotKey: r16Key,
      tournamentStageId,
      homeTeamId: ms.homeTeamId,
      awayTeamId: ms.awayTeamId,
      oldTeamId,
      allowedTeamIds,
      isStarted: true,
    },
  };
}

function resolveLaterKnockoutCorrectionMatch(input: {
  fifaMatchNo: number;
  matchCode: string;
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  tournamentMatches: TournamentMatchPublicRow[];
  gradual: GradualKnockoutSelectionState;
  knockoutBracketPicksUnlocked: boolean;
  nowMs: number;
}): { match: KnockoutPickCorrectionMatch } | { error: string } {
  const range = LATER_KNOCKOUT_MATCH_RANGES.find(
    (r) =>
      input.fifaMatchNo >= r.firstFifa &&
      input.fifaMatchNo < r.firstFifa + r.count,
  );
  if (!range) {
    return { error: `Unknown knockout match ${input.matchCode}.` };
  }

  const matchIndex = input.fifaMatchNo - range.firstFifa;
  const rows = buildKnockoutMatchPickRows({
    bracketKind: range.bracketKind,
    slots: input.slots,
    teams: input.teams,
    tournamentMatches: input.tournamentMatches,
    gradual: input.gradual,
    knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
    nowMs: input.nowMs,
  });
  const row = rows.find((r) => r.fifaMatchNo === input.fifaMatchNo);
  if (!row) {
    return { error: `Could not resolve ${input.matchCode} in the bracket model.` };
  }
  if (row.lockReason !== "started") {
    if (row.lockReason === "incomplete") {
      return {
        error: `${input.matchCode} is not ready for correction — upstream picks are incomplete.`,
      };
    }
    return {
      error: `${input.matchCode} has not kicked off yet; use the normal pick editor.`,
    };
  }

  const allowedTeamIds = [row.homeTeamId, row.awayTeamId].filter(
    (id): id is string => Boolean(id),
  );
  if (allowedTeamIds.length < 2) {
    return {
      error: `${input.matchCode} does not have both teams available in this bracket.`,
    };
  }

  const saveRow = input.slots.find((s) => s.rowKey === row.saveRowKey);
  const tournamentStageId =
    saveRow?.tournamentStageId ??
    tournamentStageIdForKind(input.slots, row.savePredictionKind);
  if (!tournamentStageId) {
    return { error: "Tournament stage for this knockout pick is missing." };
  }

  return {
    match: {
      matchCode: input.matchCode,
      fifaMatchNo: input.fifaMatchNo,
      predictionKind: row.savePredictionKind,
      slotKey: row.saveSlotKey,
      tournamentStageId,
      homeTeamId: row.homeTeamId,
      awayTeamId: row.awayTeamId,
      oldTeamId: row.winnerTeamId.trim(),
      allowedTeamIds,
      isStarted: true,
      knockoutMatchRow: row,
    },
  };
}

export function resolveKnockoutPickCorrectionMatch(input: {
  matchCode: string;
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  tournamentMatches: TournamentMatchPublicRow[];
  fullRoundOf32Official: boolean;
  knockoutBracketPicksUnlocked?: boolean;
  nowMs?: number;
}): { match: KnockoutPickCorrectionMatch } | { error: string } {
  const fifaMatchNo = parseFifaMatchCode(input.matchCode);
  if (fifaMatchNo == null) {
    return { error: "Match code must look like M73." };
  }

  const nowMs = input.nowMs ?? Date.now();
  const gradual = getGradualKnockoutSelectionState({
    matches: input.tournamentMatches,
    teams: input.teams,
    nowMs,
    fullRoundOf32Official: input.fullRoundOf32Official,
  });
  const matchCode = `M${fifaMatchNo}`;

  if (fifaMatchNo >= R32_FIRST && fifaMatchNo <= R32_LAST) {
    return resolveR32CorrectionMatch({
      fifaMatchNo,
      matchCode,
      slots: input.slots,
      teams: input.teams,
      gradual,
    });
  }

  return resolveLaterKnockoutCorrectionMatch({
    fifaMatchNo,
    matchCode,
    slots: input.slots,
    teams: input.teams,
    tournamentMatches: input.tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked ?? true,
    nowMs,
  });
}

export function resolveKnockoutPickCorrectionTeamId(input: {
  teamId?: string | null;
  teamCode?: string | null;
  teams: Team[];
  allowedTeamIds: string[];
}): { teamId: string; countryCode: string } | { error: string } {
  const direct = (input.teamId ?? "").trim();
  if (direct) {
    if (!input.allowedTeamIds.includes(direct)) {
      return { error: "That team is not in this matchup." };
    }
    const team = input.teams.find((t) => t.id === direct);
    return {
      teamId: direct,
      countryCode: normalizeCountryCode(team?.countryCode),
    };
  }

  const code = normalizeCountryCode(input.teamCode);
  if (!code) {
    return { error: "A team id or country code is required." };
  }
  const candidates = input.teams.filter(
    (t) =>
      normalizeCountryCode(t.countryCode) === code ||
      normalizeCountryCode(t.fifaCode) === code,
  );
  const allowed = candidates.filter((t) => input.allowedTeamIds.includes(t.id));
  if (allowed.length === 0) {
    return { error: "That team is not in this matchup." };
  }
  if (allowed.length > 1) {
    return { error: "Multiple teams match that country code; pass team id instead." };
  }
  return {
    teamId: allowed[0]!.id,
    countryCode: normalizeCountryCode(allowed[0]!.countryCode),
  };
}

function slotPayloadFromDraft(
  row: KnockoutPickSlotDraft,
  teamIdOverride?: string,
): ParticipantPickSlotPayload {
  return {
    predictionKind: row.predictionKind,
    tournamentStageId: row.tournamentStageId,
    slotKey: row.slotKey,
    groupCode: row.groupCode,
    bonusKey: row.bonusKey,
    teamId: teamIdOverride ?? row.teamId,
  };
}

function progressionPayloadKey(payload: ParticipantPickSlotPayload): string {
  return `${payload.predictionKind}\0${payload.tournamentStageId}\0${payload.slotKey ?? ""}\0${payload.groupCode ?? ""}\0${payload.bonusKey ?? ""}`;
}

function dedupePickPayloads(
  payloads: ParticipantPickSlotPayload[],
): ParticipantPickSlotPayload[] {
  const seen = new Set<string>();
  const out: ParticipantPickSlotPayload[] = [];
  for (const payload of payloads) {
    const key = progressionPayloadKey(payload);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(payload);
  }
  return out;
}

/**
 * Builds explicit admin correction writes. Unlike participant save diffs, these
 * always include the corrected slot when `newTeamId` differs from the saved winner.
 */
export function buildAdminKnockoutPickCorrectionWritePayloads(input: {
  before: KnockoutPickSlotDraft[];
  after: KnockoutPickSlotDraft[];
  match: KnockoutPickCorrectionMatch;
  newTeamId: string;
  pruneCleared: ReturnType<typeof pruneOfficialKnockoutPathPicks>["cleared"];
  fullRoundOf32Official: boolean;
  gradual: GradualKnockoutSelectionState;
}): ParticipantPickSlotPayload[] {
  const newId = input.newTeamId.trim();
  const payloads: ParticipantPickSlotPayload[] = [];

  const correctionRow = input.after.find(
    (s) =>
      s.predictionKind === input.match.predictionKind &&
      s.slotKey === input.match.slotKey,
  );
  if (correctionRow) {
    payloads.push(slotPayloadFromDraft(correctionRow, newId));
  }

  for (const clear of input.pruneCleared) {
    const row = input.after.find((s) => s.rowKey === clear.rowKey);
    if (row) payloads.push(slotPayloadFromDraft(row));
  }

  if (!input.fullRoundOf32Official && !input.match.knockoutMatchRow) {
    const matchIndex = input.match.fifaMatchNo - R32_FIRST;
    const ms = input.gradual.matchStates[matchIndex];
    if (ms) {
      for (const sk of [ms.topSlotKey, ms.bottomSlotKey]) {
        const beforeId =
          input.before.find(
            (s) => s.predictionKind === "round_of_32" && s.slotKey === sk,
          )?.teamId.trim() ?? "";
        const afterRow = input.after.find(
          (s) => s.predictionKind === "round_of_32" && s.slotKey === sk,
        );
        const afterId = afterRow?.teamId.trim() ?? "";
        if (beforeId !== afterId && afterRow) {
          payloads.push(slotPayloadFromDraft(afterRow));
        }
      }
    }
  }

  return dedupePickPayloads(payloads);
}

function changedKnockoutPayloads(
  before: KnockoutPickSlotDraft[],
  after: KnockoutPickSlotDraft[],
): ParticipantPickSlotPayload[] {
  const out: ParticipantPickSlotPayload[] = [];
  for (const row of after) {
    if (!isKnockoutProgressionKind(row.predictionKind)) continue;
    const prev = before.find((s) => s.rowKey === row.rowKey);
    const prevId = prev?.teamId.trim() ?? "";
    const nextId = row.teamId.trim();
    if (prevId !== nextId) {
      out.push(slotPayloadFromDraft(row));
    }
  }
  return out;
}

export function applyKnockoutPickCorrection(input: {
  slots: KnockoutPickSlotDraft[];
  match: KnockoutPickCorrectionMatch;
  newTeamId: string;
  teams: Team[];
  tournamentMatches: TournamentMatchPublicRow[];
  fullRoundOf32Official: boolean;
  knockoutBracketPicksUnlocked?: boolean;
  nowMs?: number;
}): KnockoutPickCorrectionApplyResult {
  const nowMs = input.nowMs ?? Date.now();
  const newTeamId = input.newTeamId.trim();
  const savedWinnerId = input.match.oldTeamId.trim();
  if (savedWinnerId && savedWinnerId === newTeamId) {
    return {
      slots: input.slots,
      cleared: [],
      writePayloads: [],
      changedPayloads: [],
    };
  }

  const gradual = getGradualKnockoutSelectionState({
    matches: input.tournamentMatches,
    teams: input.teams,
    nowMs,
    fullRoundOf32Official: input.fullRoundOf32Official,
  });
  const r32MatchIndex = input.match.knockoutMatchRow
    ? null
    : input.match.fifaMatchNo - R32_FIRST;

  let next = input.slots;
  if (input.match.knockoutMatchRow) {
    next = applyKnockoutMatchWinnerToSlots(
      next,
      input.match.knockoutMatchRow,
      newTeamId,
    );
  } else if (r32MatchIndex != null && r32MatchIndex >= 0) {
    next = applyGradualR32MatchWinnerToSlots(
      next,
      r32MatchIndex,
      newTeamId,
      gradual,
      { preserveR32ParticipantSlots: input.fullRoundOf32Official },
    );
  }

  const pruned = pruneOfficialKnockoutPathPicks(next, {
    teams: input.teams,
    tournamentMatches: input.tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: isFullKnockoutBracketPicksUnlocked({
      officialRoundOf32Complete: input.fullRoundOf32Official,
      gradual,
    }),
    exemptR32MatchIndices:
      r32MatchIndex != null && r32MatchIndex >= 0 ? [r32MatchIndex] : undefined,
  });

  let finalSlots = pruned.slots;
  if (
    r32MatchIndex != null &&
    r32MatchIndex >= 0 &&
    input.match.predictionKind === "round_of_16" &&
    input.match.slotKey
  ) {
    finalSlots = finalSlots.map((s) =>
      s.predictionKind === "round_of_16" && s.slotKey === input.match.slotKey
        ? { ...s, teamId: newTeamId }
        : s,
    );
  } else if (input.match.knockoutMatchRow) {
    finalSlots = finalSlots.map((s) =>
      s.rowKey === input.match.knockoutMatchRow!.saveRowKey
        ? { ...s, teamId: newTeamId }
        : s,
    );
  }

  const writePayloads = buildAdminKnockoutPickCorrectionWritePayloads({
    before: input.slots,
    after: finalSlots,
    match: input.match,
    newTeamId,
    pruneCleared: pruned.cleared,
    fullRoundOf32Official: input.fullRoundOf32Official,
    gradual,
  });
  const changedPayloads = changedKnockoutPayloads(input.slots, finalSlots);

  return {
    slots: finalSlots,
    cleared: pruned.cleared,
    writePayloads,
    changedPayloads,
  };
}

export function summarizeKnockoutPickCorrectionDryRun(input: {
  match: KnockoutPickCorrectionMatch;
  newTeamId: string;
  teams: Team[];
  applyResult: KnockoutPickCorrectionApplyResult;
}): {
  matchCode: string;
  oldTeamLabel: string;
  newTeamLabel: string;
  clearedLabels: string[];
} {
  const teamLabel = (id: string) => {
    const tid = id.trim();
    if (!tid) return "(empty)";
    const t = input.teams.find((x) => x.id === tid);
    return t?.name?.trim() || tid;
  };

  return {
    matchCode: input.match.matchCode,
    oldTeamLabel: teamLabel(input.match.oldTeamId),
    newTeamLabel: teamLabel(input.newTeamId),
    clearedLabels: input.applyResult.cleared.map((c) => {
      const row = input.applyResult.slots.find((s) => s.rowKey === c.rowKey);
      const label = row?.slotLabel ?? c.predictionKind;
      return `${label} (${teamLabel(c.teamId)}) — ${c.reason}`;
    }),
  };
}

/** Read-only helper for tests and UI labels. */
export function readKnockoutPickForMatch(
  slots: KnockoutPickSlotDraft[],
  match: KnockoutPickCorrectionMatch,
): string {
  if (match.knockoutMatchRow) {
    return slotTeamId(
      slots,
      match.predictionKind,
      match.slotKey,
    );
  }
  return slotTeamId(slots, match.predictionKind, match.slotKey);
}
