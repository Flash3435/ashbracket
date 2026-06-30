import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { ParticipantPickSlotPayload } from "../../types/knockoutPicksSave";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  r32SlotKeysForMatchIndex,
  WC2026_R32_MATCH_DEFS,
} from "../bracket/wc2026RoundOf32";
import { isKnockoutProgressionKind } from "../predictions/knockoutProgressionKinds";
import { kickoffSortMs } from "../tournament/sortTournamentMatches";
import { isMatchStarted } from "./knockoutSelectionWindow";

export const R32_MATCHUP_NOT_CONFIRMED = "Matchup not confirmed yet";
export const R32_LOCKED_AT_KICKOFF = "Locked at kickoff";

export type R32SlotLockReason = "pickable" | "unconfirmed" | "started" | "later_rounds";

export type R32MatchUnlockState = {
  matchIndex: number;
  fifaMatchNo: number;
  topSlotKey: string;
  bottomSlotKey: string;
  publicMatch: TournamentMatchPublicRow | null;
  confirmed: boolean;
  pickable: boolean;
  started: boolean;
  homeCountryCode: string | null;
  awayCountryCode: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  kickoffAtIso: string | null;
};

export type GradualKnockoutSelectionState = {
  r32MatchCount: number;
  confirmedCount: number;
  pickableCount: number;
  pendingCount: number;
  allR32Confirmed: boolean;
  anyR32Started: boolean;
  earliestPickableKickoffIso: string | null;
  matchStates: R32MatchUnlockState[];
};

const PLACEHOLDER_TEAM_TOKENS = new Set([
  "TBD",
  "TBA",
  "TBC",
  "TBN",
  "TO BE DETERMINED",
  "TO BE ANNOUNCED",
]);

function normalizeCountryCode(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

function isRealTeamLabel(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  if (!n) return false;
  return !PLACEHOLDER_TEAM_TOKENS.has(n.toUpperCase());
}

/** Both sides have stable FIFA country codes (preferred) or non-placeholder names. */
export function isKnockoutMatchConfirmed(
  match: Pick<
    TournamentMatchPublicRow,
    | "home_country_code"
    | "away_country_code"
    | "home_team_name"
    | "away_team_name"
    | "kickoff_at"
  >,
): boolean {
  const homeCode = normalizeCountryCode(match.home_country_code);
  const awayCode = normalizeCountryCode(match.away_country_code);
  const hasHome = homeCode.length >= 3 || isRealTeamLabel(match.home_team_name);
  const hasAway = awayCode.length >= 3 || isRealTeamLabel(match.away_team_name);
  const kickoff = match.kickoff_at?.trim();
  return hasHome && hasAway && Boolean(kickoff);
}

export function isMatchPickable(
  match: TournamentMatchPublicRow,
  nowMs = Date.now(),
): boolean {
  if (!isKnockoutMatchConfirmed(match)) return false;
  return !isMatchStarted(match, nowMs);
}

function roundOf32PublicMatches(
  matches: TournamentMatchPublicRow[] | null | undefined,
): TournamentMatchPublicRow[] {
  return (matches ?? []).filter((m) => m.stage_code === "round_of_32");
}

function publicMatchForFifaNo(
  r32: TournamentMatchPublicRow[],
  fifaMatchNo: number,
): TournamentMatchPublicRow | null {
  const direct = `M${fifaMatchNo}`;
  return (
    r32.find((m) => m.match_code === direct) ??
    r32.find((m) => m.match_code.endsWith(`-${fifaMatchNo}`)) ??
    null
  );
}

function teamIdByCountryCode(teams: Team[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of teams) {
    const code = normalizeCountryCode(t.countryCode);
    if (code) m.set(code, t.id);
  }
  return m;
}

function earliestKickoffIso(
  matches: TournamentMatchPublicRow[],
): string | null {
  let best: string | null = null;
  let bestMs = Number.POSITIVE_INFINITY;
  for (const m of matches) {
    const iso = m.kickoff_at?.trim();
    if (!iso) continue;
    const ms = kickoffSortMs(iso);
    if (ms === Number.POSITIVE_INFINITY) continue;
    if (ms < bestMs) {
      bestMs = ms;
      best = iso;
    }
  }
  return best;
}

export function r32SlotMatchIndex(slotKey: string | null | undefined): number {
  const n = slotKey != null ? parseInt(slotKey, 10) : NaN;
  if (!Number.isFinite(n) || n < 1) return -1;
  return Math.floor((n - 1) / 2);
}

/** R32 match index (0–15) → `round_of_16` slot key storing that match's winner during gradual unlock. */
export function r16SlotKeyForR32MatchIndex(matchIndex: number): string {
  return String(matchIndex + 1);
}

/** `round_of_16` slot key (1–16) → R32 match index (0–15), or -1 when not a gradual winner slot. */
export function r32MatchIndexForR16SlotKey(
  slotKey: string | null | undefined,
): number {
  const n = slotKey != null ? parseInt(slotKey, 10) : NaN;
  if (!Number.isFinite(n) || n < 1 || n > WC2026_R32_MATCH_DEFS.length) return -1;
  return n - 1;
}

export function matchStateForR32MatchIndex(
  matchIndex: number,
  state: GradualKnockoutSelectionState,
): R32MatchUnlockState | null {
  if (matchIndex < 0) return null;
  return state.matchStates[matchIndex] ?? null;
}

export function matchStateForR16GradualWinnerSlot(
  slotKey: string | null | undefined,
  state: GradualKnockoutSelectionState,
): R32MatchUnlockState | null {
  return matchStateForR32MatchIndex(r32MatchIndexForR16SlotKey(slotKey), state);
}

/** Gradual R32 UI uses one `round_of_16` row per FIFA matchup (M73–M88). */
export function isGradualR32WinnerPickRow(
  row: Pick<KnockoutPickSlotDraft, "predictionKind" | "slotKey">,
  fullRoundOf32Official: boolean,
): boolean {
  if (fullRoundOf32Official) return false;
  if (row.predictionKind !== "round_of_16") return false;
  return r32MatchIndexForR16SlotKey(row.slotKey) >= 0;
}

function teamIsInR32Match(
  teamId: string,
  match: R32MatchUnlockState,
  teams: Team[],
): boolean {
  const id = teamId.trim();
  if (!id) return false;
  if (match.homeTeamId === id || match.awayTeamId === id) return true;
  const team = teams.find((t) => t.id === id);
  if (!team) return false;
  const code = normalizeCountryCode(team.countryCode);
  const home = normalizeCountryCode(match.homeCountryCode);
  const away = normalizeCountryCode(match.awayCountryCode);
  return Boolean(code && home && away && (code === home || code === away));
}

/**
 * Winner for a gradual R32 matchup: canonical `round_of_16` slot, with legacy
 * `round_of_32` top/bottom slots only when a single side was used as the winner
 * (not when both sides are filled as an official two-team assignment).
 */
export function readGradualR32MatchWinner(
  matchIndex: number,
  slots: KnockoutPickSlotDraft[],
  teams: Team[],
  match: R32MatchUnlockState,
): string {
  const r16Key = r16SlotKeyForR32MatchIndex(matchIndex);
  const r16Row = slots.find(
    (s) => s.predictionKind === "round_of_16" && s.slotKey === r16Key,
  );
  const r16Id = r16Row?.teamId.trim() ?? "";
  if (r16Id && teamIsInR32Match(r16Id, match, teams)) return r16Id;

  const { top, bottom } = r32SlotKeysForMatchIndex(matchIndex);
  const topId =
    slots
      .find((s) => s.predictionKind === "round_of_32" && s.slotKey === top)
      ?.teamId.trim() ?? "";
  const botId =
    slots
      .find((s) => s.predictionKind === "round_of_32" && s.slotKey === bottom)
      ?.teamId.trim() ?? "";

  // Legacy saves: winner on exactly one R32 side before canonical `round_of_16` storage.
  if (topId && !botId && teamIsInR32Match(topId, match, teams)) return topId;
  if (botId && !topId && teamIsInR32Match(botId, match, teams)) return botId;

  return "";
}

export function countGradualR32MatchupsFilled(input: {
  slots: KnockoutPickSlotDraft[];
  state: GradualKnockoutSelectionState;
  teams: Team[];
  /** When set, only count among these match indices (e.g. pickable matchups). */
  matchIndices?: number[];
}): number {
  const indices =
    input.matchIndices ??
    input.state.matchStates.map((m) => m.matchIndex);
  let n = 0;
  for (const matchIndex of indices) {
    const match = input.state.matchStates[matchIndex];
    if (!match) continue;
    if (
      readGradualR32MatchWinner(
        matchIndex,
        input.slots,
        input.teams,
        match,
      )
    ) {
      n += 1;
    }
  }
  return n;
}

export function applyGradualR32MatchWinnerToSlots(
  slots: KnockoutPickSlotDraft[],
  matchIndex: number,
  teamId: string,
  state: GradualKnockoutSelectionState,
  options?: { preserveR32ParticipantSlots?: boolean },
): KnockoutPickSlotDraft[] {
  const ms = state.matchStates[matchIndex];
  if (!ms) return slots;
  const r16Key = r16SlotKeyForR32MatchIndex(matchIndex);
  const preserveR32 = options?.preserveR32ParticipantSlots === true;
  return slots.map((s) => {
    if (s.predictionKind === "round_of_16" && s.slotKey === r16Key) {
      return { ...s, teamId };
    }
    if (
      !preserveR32 &&
      s.predictionKind === "round_of_32" &&
      (s.slotKey === ms.topSlotKey || s.slotKey === ms.bottomSlotKey)
    ) {
      return { ...s, teamId: "" };
    }
    return s;
  });
}

export type GradualR32MatchPickRow = {
  matchIndex: number;
  fifaMatchNo: number;
  rowKey: string;
  saveSlotKey: string;
  winnerTeamId: string;
  lockReason: R32SlotLockReason;
  display: R32SlotRowDisplay;
};

/** One UI row per R32 matchup (16 total) during gradual unlock. */
export function buildGradualR32MatchPickRows(input: {
  slots: KnockoutPickSlotDraft[];
  state: GradualKnockoutSelectionState;
  teams: Team[];
  fullRoundOf32Official: boolean;
}): GradualR32MatchPickRow[] {
  const r16Rows = input.slots
    .filter((s) => s.predictionKind === "round_of_16")
    .sort(
      (a, b) =>
        parseInt(a.slotKey ?? "0", 10) - parseInt(b.slotKey ?? "0", 10),
    );

  return input.state.matchStates.map((ms, matchIndex) => {
    const slotRow = r16Rows.find(
      (s) => s.slotKey === r16SlotKeyForR32MatchIndex(matchIndex),
    );
    const lockReason = gradualR32MatchLockReason(
      ms,
      input.fullRoundOf32Official,
    );
    return {
      matchIndex,
      fifaMatchNo: ms.fifaMatchNo,
      rowKey: slotRow?.rowKey ?? `round_of_16|${matchIndex + 1}`,
      saveSlotKey: r16SlotKeyForR32MatchIndex(matchIndex),
      winnerTeamId: readGradualR32MatchWinner(
        matchIndex,
        input.slots,
        input.teams,
        ms,
      ),
      lockReason,
      display: r32MatchRowDisplay(
        ms,
        input.teams,
        input.fullRoundOf32Official,
        lockReason,
      ),
    };
  });
}

export function getR32MatchUnlockState(
  matchIndex: number,
  publicMatch: TournamentMatchPublicRow | null,
  teams: Team[],
  nowMs: number,
): R32MatchUnlockState {
  const def = WC2026_R32_MATCH_DEFS[matchIndex];
  const { top: topSlotKey, bottom: bottomSlotKey } =
    r32SlotKeysForMatchIndex(matchIndex);
  const teamByCode = teamIdByCountryCode(teams);
  const homeCode = publicMatch
    ? normalizeCountryCode(publicMatch.home_country_code) || null
    : null;
  const awayCode = publicMatch
    ? normalizeCountryCode(publicMatch.away_country_code) || null
    : null;
  const confirmed = publicMatch != null && isKnockoutMatchConfirmed(publicMatch);
  const started = publicMatch != null && isMatchStarted(publicMatch, nowMs);
  const pickable = publicMatch != null && isMatchPickable(publicMatch, nowMs);

  return {
    matchIndex,
    fifaMatchNo: def?.fifaMatchNo ?? 0,
    topSlotKey,
    bottomSlotKey,
    publicMatch,
    confirmed,
    pickable,
    started,
    homeCountryCode: homeCode,
    awayCountryCode: awayCode,
    homeTeamId: homeCode ? (teamByCode.get(homeCode) ?? null) : null,
    awayTeamId: awayCode ? (teamByCode.get(awayCode) ?? null) : null,
    kickoffAtIso: publicMatch?.kickoff_at?.trim() || null,
  };
}

/** True when public schedule includes Round of 32 fixture rows (M73–M88). */
export function hasRoundOf32PublicFixtures(
  matches: TournamentMatchPublicRow[] | null | undefined,
): boolean {
  return Boolean(matches?.some((m) => m.stage_code === "round_of_32"));
}

/**
 * Match-row R32 UI (16 rows, one winner per matchup) vs legacy 32 side-slot rows.
 * Admin and participant flows share this gate whenever fixture data is loaded.
 */
export function shouldUseR32MatchRowUi(input: {
  tournamentMatches: TournamentMatchPublicRow[] | null | undefined;
  knockoutBracketPicksUnlocked: boolean;
  gradualPickableCount: number;
}): boolean {
  return (
    hasRoundOf32PublicFixtures(input.tournamentMatches) ||
    (!input.knockoutBracketPicksUnlocked && input.gradualPickableCount > 0)
  );
}

export function getGradualKnockoutSelectionState(input: {
  matches: TournamentMatchPublicRow[] | null | undefined;
  teams?: Team[];
  nowMs?: number;
  /** When true, all 16 R32 fixtures are official (organizer `results` gate). */
  fullRoundOf32Official?: boolean;
}): GradualKnockoutSelectionState {
  const nowMs = input.nowMs ?? Date.now();
  const teams = input.teams ?? [];
  const r32 = roundOf32PublicMatches(input.matches);
  const matchStates: R32MatchUnlockState[] = WC2026_R32_MATCH_DEFS.map(
    (_, matchIndex) => {
      const def = WC2026_R32_MATCH_DEFS[matchIndex]!;
      const publicMatch = publicMatchForFifaNo(r32, def.fifaMatchNo);
      return getR32MatchUnlockState(matchIndex, publicMatch, teams, nowMs);
    },
  );

  const confirmedCount = matchStates.filter((m) => m.confirmed).length;
  const pickableCount = matchStates.filter((m) => m.pickable).length;
  const pendingCount = matchStates.length - confirmedCount;
  const allR32Confirmed =
    input.fullRoundOf32Official === true ||
    (matchStates.length > 0 && confirmedCount === matchStates.length);
  const anyR32Started = matchStates.some((m) => m.started);
  const pickableMatches = matchStates
    .filter((m) => m.pickable && m.kickoffAtIso)
    .map((m) => m.publicMatch!)
    .filter(Boolean);
  const earliestPickableKickoffIso = earliestKickoffIso(pickableMatches);

  return {
    r32MatchCount: matchStates.length,
    confirmedCount,
    pickableCount,
    pendingCount,
    allR32Confirmed,
    anyR32Started,
    earliestPickableKickoffIso,
    matchStates,
  };
}

export function formatGradualKnockoutStatusLine(
  state: GradualKnockoutSelectionState,
): string | null {
  if (state.r32MatchCount === 0) return null;
  if (!state.allR32Confirmed && state.confirmedCount === 0) return null;
  return `${state.pickableCount} confirmed matchups available · ${state.pendingCount} waiting for confirmation`;
}

/**
 * True when participants may fill Round of 16 through champion — either organizers
 * published all 32 official `results` rows, or every R32 fixture has both teams set.
 */
export function isFullKnockoutBracketPicksUnlocked(input: {
  officialRoundOf32Complete: boolean;
  gradual: GradualKnockoutSelectionState;
}): boolean {
  if (input.officialRoundOf32Complete) return true;
  return (
    input.gradual.r32MatchCount > 0 &&
    input.gradual.matchStates.every((m) => m.confirmed)
  );
}

/** Whether any gradual R32 winner is still stored on canonical `round_of_16` slots. */
export function hasGradualR32WinnerStorage(
  slots: KnockoutPickSlotDraft[],
  state: GradualKnockoutSelectionState,
  teams: Team[],
): boolean {
  return state.matchStates.some((ms) =>
    Boolean(
      readGradualR32MatchWinner(ms.matchIndex, slots, teams, ms) &&
        slots.some(
          (s) =>
            s.predictionKind === "round_of_16" &&
            s.slotKey === r16SlotKeyForR32MatchIndex(ms.matchIndex) &&
            s.teamId.trim(),
        ),
    ),
  );
}

/**
 * Before Round of 16 picks, copy official matchup teams into `round_of_32` slots and
 * clear temporary gradual R32 winners from `round_of_16` slots (1–16).
 */
export function promoteGradualR32WinnersToRoundOf32Slots(
  slots: KnockoutPickSlotDraft[],
  state: GradualKnockoutSelectionState,
  teams: Team[],
): KnockoutPickSlotDraft[] {
  let next = slots;
  for (const ms of state.matchStates) {
    const r16Key = r16SlotKeyForR32MatchIndex(ms.matchIndex);
    const gradualWinner = readGradualR32MatchWinner(ms.matchIndex, next, teams, ms);
    const gradualStoredOnR16 = next.some(
      (s) =>
        s.predictionKind === "round_of_16" &&
        s.slotKey === r16Key &&
        s.teamId.trim(),
    );
    if (!gradualStoredOnR16) continue;

    if (ms.homeTeamId) {
      next = next.map((s) =>
        s.predictionKind === "round_of_32" && s.slotKey === ms.topSlotKey
          ? { ...s, teamId: ms.homeTeamId! }
          : s,
      );
    }
    if (ms.awayTeamId) {
      next = next.map((s) =>
        s.predictionKind === "round_of_32" && s.slotKey === ms.bottomSlotKey
          ? { ...s, teamId: ms.awayTeamId! }
          : s,
      );
    }
    // Keep gradual R32 winners on `round_of_16` slots 1–16 — they feed Round of 16 matchup sides.
    if (!gradualWinner) continue;
  }
  return next;
}

export function hasEditableKnockoutPicks(input: {
  gradual: GradualKnockoutSelectionState;
  fullRoundOf32Official: boolean;
}): boolean {
  const { gradual, fullRoundOf32Official } = input;
  if (gradual.pickableCount > 0) return true;
  if (fullRoundOf32Official && !gradual.anyR32Started) return true;
  if (fullRoundOf32Official && gradual.anyR32Started) return true;
  return false;
}

export function matchStateForR32Slot(
  slotKey: string | null | undefined,
  state: GradualKnockoutSelectionState,
): R32MatchUnlockState | null {
  const idx = r32SlotMatchIndex(slotKey);
  if (idx < 0) return null;
  return state.matchStates[idx] ?? null;
}

export function r32SlotLockReason(
  slotKey: string | null | undefined,
  state: GradualKnockoutSelectionState,
  fullRoundOf32Official: boolean,
): R32SlotLockReason {
  if (fullRoundOf32Official) {
    const ms = matchStateForR32Slot(slotKey, state);
    if (ms?.started) return "started";
    return "pickable";
  }
  const ms = matchStateForR32Slot(slotKey, state);
  return ms ? gradualR32MatchLockReason(ms, fullRoundOf32Official) : "unconfirmed";
}

export function gradualR32MatchLockReason(
  ms: R32MatchUnlockState,
  fullRoundOf32Official: boolean,
): R32SlotLockReason {
  if (fullRoundOf32Official) {
    if (ms.started) return "started";
    return "pickable";
  }
  if (!ms.confirmed) return "unconfirmed";
  if (ms.started) return "started";
  if (ms.pickable) return "pickable";
  return "unconfirmed";
}

export function r32SlotLockMessage(
  slotKey: string | null | undefined,
  state: GradualKnockoutSelectionState,
  fullRoundOf32Official: boolean,
): string | null {
  const reason = r32SlotLockReason(slotKey, state, fullRoundOf32Official);
  if (reason === "pickable") return null;
  if (reason === "started") return R32_LOCKED_AT_KICKOFF;
  return R32_MATCHUP_NOT_CONFIRMED;
}

export type R32SlotRowDisplay = {
  heading: string;
  emptyPrimaryLine: string;
  kickoffIso: string | null;
  statusLine: string | null;
  chooseButtonLabel: string;
};

function r32MatchSideName(
  ms: R32MatchUnlockState,
  side: "home" | "away",
  teams: Team[],
): string | null {
  const id = side === "home" ? ms.homeTeamId : ms.awayTeamId;
  if (id) {
    const t = teams.find((x) => x.id === id);
    if (t?.name?.trim()) return t.name.trim();
  }
  const pub = ms.publicMatch;
  if (!pub) return null;
  const name = side === "home" ? pub.home_team_name : pub.away_team_name;
  return isRealTeamLabel(name) ? name!.trim() : null;
}

/** Participant row copy for one R32 matchup during gradual or full unlock. */
export function r32MatchRowDisplay(
  ms: R32MatchUnlockState,
  teams: Team[],
  fullRoundOf32Official: boolean,
  reason?: R32SlotLockReason,
): R32SlotRowDisplay {
  const lockReason = reason ?? gradualR32MatchLockReason(ms, fullRoundOf32Official);
  const homeName = r32MatchSideName(ms, "home", teams);
  const awayName = r32MatchSideName(ms, "away", teams);
  const matchupLine =
    homeName && awayName ? `${homeName} vs ${awayName}` : null;
  const matchHeading =
    ms.fifaMatchNo > 0
      ? `M${ms.fifaMatchNo} · Round of 32`
      : "Round of 32";

  if (lockReason === "unconfirmed") {
    return {
      heading: matchHeading,
      emptyPrimaryLine: R32_MATCHUP_NOT_CONFIRMED,
      kickoffIso: null,
      statusLine: null,
      chooseButtonLabel: "Choose team",
    };
  }

  if (lockReason === "started") {
    return {
      heading: matchHeading,
      emptyPrimaryLine: matchupLine ?? R32_LOCKED_AT_KICKOFF,
      kickoffIso: ms.kickoffAtIso,
      statusLine: R32_LOCKED_AT_KICKOFF,
      chooseButtonLabel: "Pick winner",
    };
  }

  return {
    heading: matchHeading,
    emptyPrimaryLine: matchupLine ?? "Pick needed",
    kickoffIso: ms.kickoffAtIso,
    statusLine: null,
    chooseButtonLabel: "Pick winner",
  };
}

/** Participant row copy for Round of 32 slots during gradual or full unlock. */
export function r32SlotRowDisplay(
  slotKey: string | null | undefined,
  state: GradualKnockoutSelectionState,
  teams: Team[],
  fullRoundOf32Official: boolean,
  slotLabelFallback: string,
): R32SlotRowDisplay | null {
  const ms = matchStateForR32Slot(slotKey, state);
  if (!ms) return null;
  return r32MatchRowDisplay(
    ms,
    teams,
    fullRoundOf32Official,
    r32SlotLockReason(slotKey, state, fullRoundOf32Official),
  );
}

export function allowedTeamsForGradualR32Match(
  matchIndex: number,
  state: GradualKnockoutSelectionState,
  allTeams: Team[],
  fullRoundOf32Official: boolean,
): Team[] {
  const ms = state.matchStates[matchIndex];
  if (!ms || ms.started) return [];
  const sidesReady =
    ms.confirmed ||
    Boolean(ms.homeTeamId && ms.awayTeamId) ||
    Boolean(ms.homeCountryCode && ms.awayCountryCode);
  if (!sidesReady) return [];
  if (fullRoundOf32Official || ms.pickable) {
    return allowedTeamsForGradualR32MatchState(ms, allTeams);
  }
  return [];
}

function allowedTeamsForGradualR32MatchState(
  ms: R32MatchUnlockState,
  allTeams: Team[],
): Team[] {
  const ids = new Set(
    [ms.homeTeamId, ms.awayTeamId].filter((id): id is string => Boolean(id)),
  );
  if (ids.size === 0) {
    const codes = new Set(
      [ms.homeCountryCode, ms.awayCountryCode].filter((c): c is string =>
        Boolean(c),
      ),
    );
    return allTeams.filter((t) => codes.has(normalizeCountryCode(t.countryCode)));
  }
  return allTeams.filter((t) => ids.has(t.id));
}

export function allowedTeamsForGradualR32Slot(
  slotKey: string | null | undefined,
  state: GradualKnockoutSelectionState,
  allTeams: Team[],
  fullRoundOf32Official: boolean,
): Team[] | null {
  if (fullRoundOf32Official) return null;
  const ms = matchStateForR32Slot(slotKey, state);
  if (!ms?.pickable) return [];
  return allowedTeamsForGradualR32MatchState(ms, allTeams);
}

function pickSlotPayload(slot: KnockoutPickSlotDraft): ParticipantPickSlotPayload {
  return {
    predictionKind: slot.predictionKind,
    tournamentStageId: slot.tournamentStageId,
    slotKey: slot.slotKey,
    groupCode: slot.groupCode,
    bonusKey: slot.bonusKey,
    teamId: slot.teamId,
  };
}

/**
 * Minimal save payload for gradual Round of 32: group/third/bonus rows plus only
 * pickable matchup winner slots (and their legacy R32 pair rows for clearing).
 * Omits locked unconfirmed progression rows so empty values are not treated as clears.
 */
export function buildGradualR32SavePayload(input: {
  slots: KnockoutPickSlotDraft[];
  state: GradualKnockoutSelectionState;
  /**
   * When group/third/bonus picks are locked, omit them so a gradual knockout save
   * cannot fail frozen-pick validation or rewrite locked rows.
   */
  omitFrozenPreBracketPicks?: boolean;
}): ParticipantPickSlotPayload[] {
  const out: ParticipantPickSlotPayload[] = [];
  for (const slot of input.slots) {
    if (!isKnockoutProgressionKind(slot.predictionKind)) {
      if (input.omitFrozenPreBracketPicks) continue;
      out.push(pickSlotPayload(slot));
    }
  }
  for (const ms of input.state.matchStates) {
    if (!ms.pickable) continue;
    const r16Key = r16SlotKeyForR32MatchIndex(ms.matchIndex);
    const r16Row = input.slots.find(
      (s) => s.predictionKind === "round_of_16" && s.slotKey === r16Key,
    );
    if (r16Row) out.push(pickSlotPayload(r16Row));
    for (const sk of [ms.topSlotKey, ms.bottomSlotKey]) {
      const r32Row = input.slots.find(
        (s) => s.predictionKind === "round_of_32" && s.slotKey === sk,
      );
      if (r32Row) out.push(pickSlotPayload(r32Row));
    }
  }
  return out;
}

export type ValidateKnockoutMatchPickInput = {
  slotKey: string;
  selectedTeamId: string;
  match: R32MatchUnlockState;
  teams: Team[];
  nowMs?: number;
};

export function validateKnockoutMatchPick(
  input: ValidateKnockoutMatchPickInput,
): string | null {
  const { slotKey, selectedTeamId, match, teams } = input;
  const nowMs = input.nowMs ?? Date.now();
  const teamId = selectedTeamId.trim();
  if (!teamId) return null;

  if (!match.publicMatch) {
    return `Round of 32 slot ${slotKey} is not an official matchup yet.`;
  }
  if (!match.confirmed) {
    return R32_MATCHUP_NOT_CONFIRMED;
  }
  if (isMatchStarted(match.publicMatch, nowMs)) {
    return "This match has already kicked off and can no longer be edited.";
  }

  const allowed = allowedTeamsForGradualR32Slot(
    slotKey,
    {
      r32MatchCount: 1,
      confirmedCount: match.confirmed ? 1 : 0,
      pickableCount: match.pickable ? 1 : 0,
      pendingCount: 0,
      allR32Confirmed: false,
      anyR32Started: match.started,
      earliestPickableKickoffIso: match.kickoffAtIso,
      matchStates: [match],
    },
    teams,
    false,
  );
  if (allowed && allowed.length > 0 && !allowed.some((t) => t.id === teamId)) {
    return "That team is not in this confirmed matchup.";
  }

  const team = teams.find((t) => t.id === teamId);
  if (!team) return "Invalid team id.";
  const code = normalizeCountryCode(team.countryCode);
  const home = normalizeCountryCode(match.homeCountryCode);
  const away = normalizeCountryCode(match.awayCountryCode);
  if (home && away && code !== home && code !== away) {
    return "That team is not in this confirmed matchup.";
  }

  return null;
}
