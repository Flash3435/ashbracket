import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  r32SlotKeysForMatchIndex,
  WC2026_R32_MATCH_DEFS,
} from "../bracket/wc2026RoundOf32";
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
  if (!ms) return "unconfirmed";
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

  const reason = r32SlotLockReason(slotKey, state, fullRoundOf32Official);
  const homeName = r32MatchSideName(ms, "home", teams);
  const awayName = r32MatchSideName(ms, "away", teams);
  const matchupLine =
    homeName && awayName ? `${homeName} vs ${awayName}` : null;
  const matchHeading =
    ms.fifaMatchNo > 0 ? `M${ms.fifaMatchNo} · Round of 32` : slotLabelFallback;

  if (reason === "unconfirmed") {
    return {
      heading: slotLabelFallback,
      emptyPrimaryLine: R32_MATCHUP_NOT_CONFIRMED,
      kickoffIso: null,
      statusLine: null,
      chooseButtonLabel: "Choose team",
    };
  }

  if (reason === "started") {
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

export function allowedTeamsForGradualR32Slot(
  slotKey: string | null | undefined,
  state: GradualKnockoutSelectionState,
  allTeams: Team[],
  fullRoundOf32Official: boolean,
): Team[] | null {
  if (fullRoundOf32Official) return null;
  const ms = matchStateForR32Slot(slotKey, state);
  if (!ms?.pickable) return [];
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
