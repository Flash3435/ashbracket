import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  knockoutParticipantSlotPair,
  r16R32ParticipantPair,
} from "../bracket/wc2026KnockoutPairings";
import {
  isKnockoutProgressionKind,
  type KnockoutProgressionPredictionKind,
} from "../predictions/knockoutProgressionKinds";
import {
  matchStateForR16GradualWinnerSlot,
  matchStateForR32Slot,
  r32MatchIndexForR16SlotKey,
  type GradualKnockoutSelectionState,
} from "./gradualKnockoutUnlock";
import { isMatchStarted } from "./knockoutSelectionWindow";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";

export const KNOCKOUT_PICK_LOCKED_AT_KICKOFF =
  "This match has already kicked off and can no longer be edited.";

export const KNOCKOUT_PICK_LOCKED_OFFICIAL_RESULT =
  "This match is locked because an official result is published.";

export const KNOCKOUT_PICK_LOCKED_FEEDER_RESULTS =
  "This pick is locked because feeder match results are official.";

export const KNOCKOUT_MISSING_PICK_PROGRESS_LOCK_HELPER =
  "This pick is locked because no original pick was saved.";

/** Participant copy when a QF/SF/Final winner pick was never saved after feeders resolved. */
export function knockoutMissingSavedPickBackfillBlockedCopy(
  resultKind: LaterRoundKnockoutResultKind,
): string {
  switch (resultKind) {
    case "semifinalist":
      return "No quarter-final winner pick was saved before this matchup was set.";
    case "finalist":
      return "No semi-final winner pick was saved before this matchup was set.";
    case "champion":
      return "No final winner pick was saved before this matchup was set.";
    case "quarterfinalist":
      return "No Round of 16 winner pick was saved before this matchup was set.";
  }
}

export const KNOCKOUT_R16_MISSING_PICK_OPEN_UNTIL_KICKOFF =
  "Pick still open until this match kicks off.";

export const KNOCKOUT_MISSING_PICK_AFTER_KICKOFF =
  "No pick saved — match has kicked off.";

/** Saved winner counts only when it matches the current official matchup sides. */
export function isValidSavedPickForMatchup(input: {
  savedTeamId?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  pickStatus?: "active" | "out" | null;
}): boolean {
  const saved = input.savedTeamId?.trim() ?? "";
  if (!saved) return false;
  const home = input.homeTeamId?.trim() ?? "";
  const away = input.awayTeamId?.trim() ?? "";
  if (!home || !away) return false;
  return saved === home || saved === away;
}

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

function officialWinnerTeamIdFromPublicMatch(
  pub: TournamentMatchPublicRow | null | undefined,
  teams: Team[],
): string | null {
  if (!pub?.winner_country_code?.trim()) return null;
  return teamIdForCountryCode(teams, pub.winner_country_code);
}

function officialR32WinnerTeamId(
  matchIndex: number,
  tournamentMatches: TournamentMatchPublicRow[] | null | undefined,
  gradual: GradualKnockoutSelectionState,
  teams: Team[],
): string | null {
  const fromState = gradual.matchStates[matchIndex]?.publicMatch ?? null;
  const pub =
    fromState ??
    publicMatchForFifaNo(
      tournamentMatches ?? [],
      "round_of_32",
      73 + matchIndex,
    );
  return officialWinnerTeamIdFromPublicMatch(pub, teams);
}

/** Official M89–M104 matchup sides from published feeder results (not participant picks). */
export function resolveOfficialKnockoutSlotMatchupTeamIds(input: {
  predictionKind: string;
  slotKey: string | null;
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  gradual: GradualKnockoutSelectionState;
  teams: Team[];
}): { homeTeamId: string | null; awayTeamId: string | null } {
  if (!isLaterRoundKnockoutResultKind(input.predictionKind)) {
    return { homeTeamId: null, awayTeamId: null };
  }

  if (input.predictionKind === "quarterfinalist") {
    const slotNo = parseInt(input.slotKey ?? "", 10);
    if (!Number.isFinite(slotNo) || slotNo < 1 || slotNo > 8) {
      return { homeTeamId: null, awayTeamId: null };
    }
    const pair = r16R32ParticipantPair(slotNo - 1);
    if (!pair) return { homeTeamId: null, awayTeamId: null };
    const [homeR32Index, awayR32Index] = pair;
    return {
      homeTeamId: officialR32WinnerTeamId(
        homeR32Index,
        input.tournamentMatches,
        input.gradual,
        input.teams,
      ),
      awayTeamId: officialR32WinnerTeamId(
        awayR32Index,
        input.tournamentMatches,
        input.gradual,
        input.teams,
      ),
    };
  }

  const mapping = LATER_KNOCKOUT_SLOT_STAGES.find(
    (row) => row.predictionKind === input.predictionKind,
  );
  if (!mapping) return { homeTeamId: null, awayTeamId: null };

  const slotNo =
    input.predictionKind === "champion"
      ? 1
      : parseInt(input.slotKey ?? "", 10);
  if (!Number.isFinite(slotNo) || slotNo < 1 || slotNo > mapping.maxSlot) {
    return { homeTeamId: null, awayTeamId: null };
  }

  const slotStage =
    mapping.stageCode === "quarterfinal"
      ? "quarterfinal"
      : mapping.stageCode === "semifinal"
        ? "semifinal"
        : "final";
  const pair = knockoutParticipantSlotPair(slotStage, slotNo - 1);
  if (!pair) return { homeTeamId: null, awayTeamId: null };

  const upstreamStage =
    mapping.stageCode === "quarterfinal"
      ? "round_of_16"
      : mapping.stageCode === "semifinal"
        ? "quarterfinal"
        : "semifinal";
  const upstreamFirstFifa =
    mapping.stageCode === "quarterfinal"
      ? 89
      : mapping.stageCode === "semifinal"
        ? 97
        : 101;

  const homePub = publicMatchForFifaNo(
    input.tournamentMatches ?? [],
    upstreamStage,
    upstreamFirstFifa + parseInt(pair[0], 10) - 1,
  );
  const awayPub = publicMatchForFifaNo(
    input.tournamentMatches ?? [],
    upstreamStage,
    upstreamFirstFifa + parseInt(pair[1], 10) - 1,
  );
  return {
    homeTeamId: officialWinnerTeamIdFromPublicMatch(homePub, input.teams),
    awayTeamId: officialWinnerTeamIdFromPublicMatch(awayPub, input.teams),
  };
}

/** Result kinds stored by M89+ wizard match rows (not R32 gradual rows). */
export const LATER_ROUND_KNOCKOUT_RESULT_KINDS = [
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "champion",
] as const;

export type LaterRoundKnockoutResultKind =
  (typeof LATER_ROUND_KNOCKOUT_RESULT_KINDS)[number];

export type KnockoutProgressionRowRef = Pick<
  { predictionKind: string; slotKey: string | null; teamId: string | null },
  "predictionKind" | "slotKey" | "teamId"
>;

export function isLaterRoundKnockoutResultKind(
  kind: string,
): kind is LaterRoundKnockoutResultKind {
  return (LATER_ROUND_KNOCKOUT_RESULT_KINDS as readonly string[]).includes(
    kind,
  );
}

function progressIndicatorKindsForResultKind(
  resultKind: LaterRoundKnockoutResultKind,
): readonly string[] {
  switch (resultKind) {
    case "quarterfinalist":
      return ["quarterfinalist", "semifinalist", "finalist", "champion"];
    case "semifinalist":
      return ["semifinalist", "finalist", "champion"];
    case "finalist":
      return ["finalist", "champion"];
    case "champion":
      return ["finalist"];
  }
}

/** True when saved downstream (or same-step) picks show the bracket was already in progress. */
export function participantHasKnockoutProgressPastStage(
  rows: readonly KnockoutProgressionRowRef[],
  resultKind: LaterRoundKnockoutResultKind,
  excludeSlotKey?: string | null,
): boolean {
  const indicatorKinds = progressIndicatorKindsForResultKind(resultKind);
  return rows.some((row) => {
    if (!indicatorKinds.includes(row.predictionKind)) return false;
    if (!(row.teamId ?? "").trim()) return false;
    if (
      row.predictionKind === resultKind &&
      excludeSlotKey != null &&
      row.slotKey === excludeSlotKey
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Missing QF/SF/Final winner picks cannot be backfilled once upstream feeders
 * have kicked off or published a result. Round of 16 winner picks stay open
 * until that match kicks off (see {@link KNOCKOUT_R16_MISSING_PICK_OPEN_UNTIL_KICKOFF}).
 */
export function isLaterRoundKnockoutRowFrozenForMissingBackfill(input: {
  resultKind: string;
  slotKey: string | null;
  savedTeamId?: string | null;
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  gradual: GradualKnockoutSelectionState;
  progressionRows: readonly KnockoutProgressionRowRef[];
  teams?: Team[];
  nowMs?: number;
}): boolean {
  if (input.resultKind === "quarterfinalist") return false;
  if (!isLaterRoundKnockoutResultKind(input.resultKind)) return false;
  if (input.savedTeamId?.trim()) return false;

  const official = resolveOfficialKnockoutSlotMatchupTeamIds({
    predictionKind: input.resultKind,
    slotKey: input.slotKey,
    tournamentMatches: input.tournamentMatches,
    gradual: input.gradual,
    teams: input.teams ?? [],
  });
  if (!official.homeTeamId?.trim() || !official.awayTeamId?.trim()) {
    return false;
  }

  const feeders = resolveFeederMatchesForKnockoutSlot({
    predictionKind: input.resultKind,
    slotKey: input.slotKey,
    tournamentMatches: input.tournamentMatches,
    gradual: input.gradual,
  });
  if (feeders.length === 0) return false;

  const nowMs = input.nowMs ?? Date.now();
  return feeders.some(
    (match) =>
      hasOfficialKnockoutMatchResult(match) || isMatchStarted(match, nowMs),
  );
}

/**
 * Freeze a later-round match row for participant UI when the saved pick is locked
 * out, or when a missing QF/SF/Final winner pick can no longer be backfilled.
 */
export function shouldFreezeLaterRoundKnockoutMatchRow(input: {
  resultKind: KnockoutProgressionPredictionKind;
  slotKey: string | null;
  savedTeamId?: string | null;
  pickStatus?: "active" | "out" | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  clearedByPathRepair?: boolean;
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  gradual: GradualKnockoutSelectionState;
  progressionRows: readonly KnockoutProgressionRowRef[];
  teams?: Team[];
  nowMs?: number;
}): boolean {
  if (!isLaterRoundKnockoutResultKind(input.resultKind)) return false;
  if (input.pickStatus === "out" && input.savedTeamId?.trim()) return true;
  if (input.savedTeamId?.trim()) return false;
  return isLaterRoundKnockoutRowFrozenForMissingBackfill(input);
}

const LATER_KNOCKOUT_SLOT_STAGES: {
  predictionKind: string;
  stageCode: string;
  firstFifaMatchNo: number;
  maxSlot: number;
}[] = [
  {
    predictionKind: "quarterfinalist",
    stageCode: "round_of_16",
    firstFifaMatchNo: 89,
    maxSlot: 8,
  },
  {
    predictionKind: "semifinalist",
    stageCode: "quarterfinal",
    firstFifaMatchNo: 97,
    maxSlot: 4,
  },
  {
    predictionKind: "finalist",
    stageCode: "semifinal",
    firstFifaMatchNo: 101,
    maxSlot: 2,
  },
  {
    predictionKind: "champion",
    stageCode: "final",
    firstFifaMatchNo: 104,
    maxSlot: 1,
  },
];

export function hasOfficialKnockoutMatchResult(
  match: Pick<TournamentMatchPublicRow, "winner_country_code"> | null | undefined,
): boolean {
  return Boolean(match?.winner_country_code?.trim());
}

/** True when a participant must not change picks tied to this fixture. */
export function isKnockoutMatchLockedForParticipant(
  match:
    | Pick<TournamentMatchPublicRow, "kickoff_at" | "status" | "winner_country_code">
    | null
    | undefined,
  nowMs = Date.now(),
): boolean {
  if (!match) return false;
  if (hasOfficialKnockoutMatchResult(match)) return true;
  return isMatchStarted(match, nowMs);
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

function resolveR32PublicMatch(
  matchIndex: number,
  gradual: GradualKnockoutSelectionState,
  tournamentMatches: TournamentMatchPublicRow[] | null | undefined,
): TournamentMatchPublicRow | null {
  const fromState = gradual.matchStates[matchIndex]?.publicMatch ?? null;
  if (fromState) return fromState;
  return publicMatchForFifaNo(
    tournamentMatches ?? [],
    "round_of_32",
    73 + matchIndex,
  );
}

/** Resolve the official schedule row backing a saved knockout progression slot. */
export function resolveTournamentMatchForKnockoutSlot(input: {
  predictionKind: string;
  slotKey: string | null;
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  gradual: GradualKnockoutSelectionState;
}): TournamentMatchPublicRow | null {
  if (!isKnockoutProgressionKind(input.predictionKind)) return null;

  if (input.predictionKind === "round_of_32") {
    const ms = matchStateForR32Slot(input.slotKey, input.gradual);
    if (!ms) return null;
    return resolveR32PublicMatch(
      ms.matchIndex,
      input.gradual,
      input.tournamentMatches,
    );
  }

  if (input.predictionKind === "round_of_16") {
    const r32Index = r32MatchIndexForR16SlotKey(input.slotKey);
    if (r32Index < 0) return null;
    return resolveR32PublicMatch(
      r32Index,
      input.gradual,
      input.tournamentMatches,
    );
  }

  const mapping = LATER_KNOCKOUT_SLOT_STAGES.find(
    (row) => row.predictionKind === input.predictionKind,
  );
  if (!mapping) return null;

  const slotNo =
    input.predictionKind === "champion"
      ? 1
      : parseInt(input.slotKey ?? "", 10);
  if (!Number.isFinite(slotNo) || slotNo < 1 || slotNo > mapping.maxSlot) {
    return null;
  }

  return publicMatchForFifaNo(
    input.tournamentMatches ?? [],
    mapping.stageCode,
    mapping.firstFifaMatchNo + slotNo - 1,
  );
}

/** Upstream fixtures that determine teams in a saved knockout progression slot. */
export function resolveFeederMatchesForKnockoutSlot(input: {
  predictionKind: string;
  slotKey: string | null;
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  gradual: GradualKnockoutSelectionState;
}): TournamentMatchPublicRow[] {
  if (!isKnockoutProgressionKind(input.predictionKind)) return [];

  if (input.predictionKind === "round_of_32") return [];

  if (input.predictionKind === "round_of_16") {
    const r32Index = r32MatchIndexForR16SlotKey(input.slotKey);
    if (r32Index < 0) return [];
    const match = resolveR32PublicMatch(
      r32Index,
      input.gradual,
      input.tournamentMatches,
    );
    return match ? [match] : [];
  }

  if (input.predictionKind === "quarterfinalist") {
    const slotNo = parseInt(input.slotKey ?? "", 10);
    if (!Number.isFinite(slotNo) || slotNo < 1 || slotNo > 8) return [];
    const pair = r16R32ParticipantPair(slotNo - 1);
    if (!pair) return [];
    return pair
      .map((idx) =>
        resolveR32PublicMatch(idx, input.gradual, input.tournamentMatches),
      )
      .filter((m): m is TournamentMatchPublicRow => m != null);
  }

  if (input.predictionKind === "semifinalist") {
    const slotNo = parseInt(input.slotKey ?? "", 10);
    if (!Number.isFinite(slotNo) || slotNo < 1 || slotNo > 4) return [];
    const pair = knockoutParticipantSlotPair("quarterfinal", slotNo - 1);
    if (!pair) return [];
    return pair
      .map((sk) =>
        publicMatchForFifaNo(
          input.tournamentMatches ?? [],
          "round_of_16",
          89 + parseInt(sk, 10) - 1,
        ),
      )
      .filter((m): m is TournamentMatchPublicRow => m != null);
  }

  if (input.predictionKind === "finalist") {
    const slotNo = parseInt(input.slotKey ?? "", 10);
    if (!Number.isFinite(slotNo) || slotNo < 1 || slotNo > 2) return [];
    const pair = knockoutParticipantSlotPair("semifinal", slotNo - 1);
    if (!pair) return [];
    return pair
      .map((sk) =>
        publicMatchForFifaNo(
          input.tournamentMatches ?? [],
          "quarterfinal",
          97 + parseInt(sk, 10) - 1,
        ),
      )
      .filter((m): m is TournamentMatchPublicRow => m != null);
  }

  if (input.predictionKind === "champion") {
    const pair = knockoutParticipantSlotPair("final", 0);
    if (!pair) return [];
    return pair
      .map((sk) =>
        publicMatchForFifaNo(
          input.tournamentMatches ?? [],
          "semifinal",
          101 + parseInt(sk, 10) - 1,
        ),
      )
      .filter((m): m is TournamentMatchPublicRow => m != null);
  }

  return [];
}

/** True when any upstream feeder has a published winner. */
export function isKnockoutSlotFrozenByOfficialFeeders(input: {
  predictionKind: string;
  slotKey: string | null;
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  gradual: GradualKnockoutSelectionState;
}): boolean {
  return resolveFeederMatchesForKnockoutSlot(input).some((match) =>
    hasOfficialKnockoutMatchResult(match),
  );
}

function knockoutPickEditBlockedRowLabel(input: {
  predictionKind: string;
  slotKey: string | null;
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  gradual: GradualKnockoutSelectionState;
}): string {
  const match = resolveTournamentMatchForKnockoutSlot(input);
  if (match?.match_code?.trim()) {
    return match.match_code.trim();
  }
  if (input.slotKey?.trim()) {
    return `${input.predictionKind.replaceAll("_", " ")} slot ${input.slotKey}`;
  }
  return input.predictionKind.replaceAll("_", " ");
}

export function knockoutPickEditBlockedMessage(input: {
  predictionKind: string;
  slotKey: string | null;
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  gradual: GradualKnockoutSelectionState;
  nowMs?: number;
  teams?: Team[];
  slots?: readonly KnockoutPickSlotDraft[];
  knockoutBracketPicksUnlocked?: boolean;
  savedTeamId?: string | null;
  progressionRows?: readonly KnockoutProgressionRowRef[];
}): string {
  const rowLabel = knockoutPickEditBlockedRowLabel(input);
  const match = resolveTournamentMatchForKnockoutSlot(input);
  const nowMs = input.nowMs ?? Date.now();
  if (
    !input.savedTeamId?.trim() &&
    isLaterRoundKnockoutResultKind(input.predictionKind) &&
    isLaterRoundKnockoutRowFrozenForMissingBackfill({
      resultKind: input.predictionKind,
      slotKey: input.slotKey,
      savedTeamId: input.savedTeamId,
      tournamentMatches: input.tournamentMatches,
      gradual: input.gradual,
      progressionRows: input.progressionRows ?? input.slots ?? [],
      teams: input.teams,
      nowMs,
    })
  ) {
    return `${rowLabel}: ${knockoutMissingSavedPickBackfillBlockedCopy(input.predictionKind)}`;
  }
  if (match && hasOfficialKnockoutMatchResult(match)) {
    return `${rowLabel}: ${KNOCKOUT_PICK_LOCKED_OFFICIAL_RESULT}`;
  }
  if (match && isMatchStarted(match, nowMs)) {
    return `${rowLabel}: ${KNOCKOUT_PICK_LOCKED_AT_KICKOFF}`;
  }
  if (isKnockoutSlotFrozenByOfficialFeeders(input)) {
    return `${rowLabel}: ${KNOCKOUT_PICK_LOCKED_FEEDER_RESULTS}`;
  }
  return `${rowLabel}: ${KNOCKOUT_PICK_LOCKED_AT_KICKOFF}`;
}

export function isKnockoutPickEditableForParticipant(input: {
  predictionKind: string;
  slotKey: string | null;
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  gradual: GradualKnockoutSelectionState;
  fullRoundOf32Official: boolean;
  savedTeamId?: string | null;
  pickStatus?: "active" | "out" | null;
  teams?: Team[];
  matchupHomeTeamId?: string | null;
  matchupAwayTeamId?: string | null;
  progressionRows?: readonly KnockoutProgressionRowRef[];
  slots?: readonly KnockoutPickSlotDraft[];
  nowMs?: number;
}): boolean {
  if (!isKnockoutProgressionKind(input.predictionKind)) return true;

  const nowMs = input.nowMs ?? Date.now();

  if (input.predictionKind === "round_of_32") {
    const ms = matchStateForR32Slot(input.slotKey, input.gradual);
    if (!ms) return false;
    if (!input.fullRoundOf32Official) return false;
    const pub = resolveR32PublicMatch(
      ms.matchIndex,
      input.gradual,
      input.tournamentMatches,
    );
    if (ms.started) return false;
    if (pub && hasOfficialKnockoutMatchResult(pub)) return false;
    return ms.confirmed;
  }

  if (input.predictionKind === "round_of_16") {
    const r32Index = r32MatchIndexForR16SlotKey(input.slotKey);
    if (r32Index < 0) return false;
    const ms = matchStateForR16GradualWinnerSlot(input.slotKey, input.gradual);
    if (!ms) return false;
    if (!ms.confirmed) return false;
    const pub = resolveR32PublicMatch(
      r32Index,
      input.gradual,
      input.tournamentMatches,
    );
    if (ms.started) return false;
    if (pub && hasOfficialKnockoutMatchResult(pub)) return false;
    if (input.fullRoundOf32Official) {
      return true;
    }
    return ms.pickable;
  }

  if (!input.fullRoundOf32Official) return false;

  const match = resolveTournamentMatchForKnockoutSlot(input);
  if (match && isKnockoutMatchLockedForParticipant(match, nowMs)) return false;

  if (input.pickStatus === "out" && input.savedTeamId?.trim()) return false;

  if (input.savedTeamId?.trim()) return false;

  if (
    isLaterRoundKnockoutRowFrozenForMissingBackfill({
      resultKind: input.predictionKind,
      slotKey: input.slotKey,
      savedTeamId: input.savedTeamId,
      tournamentMatches: input.tournamentMatches,
      gradual: input.gradual,
      progressionRows: input.progressionRows ?? [],
      teams: input.teams,
      nowMs,
    })
  ) {
    return false;
  }

  return true;
}

/** True when kickoff, live/final status, or an official result freezes the saved pick. */
export function isKnockoutPickFrozenForParticipant(input: {
  predictionKind: string;
  slotKey: string | null;
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  gradual: GradualKnockoutSelectionState;
  savedTeamId?: string | null;
  pickStatus?: "active" | "out" | null;
  teams?: Team[];
  matchupHomeTeamId?: string | null;
  matchupAwayTeamId?: string | null;
  progressionRows?: readonly KnockoutProgressionRowRef[];
  slots?: readonly KnockoutPickSlotDraft[];
  fullRoundOf32Official?: boolean;
  nowMs?: number;
}): boolean {
  if (!isKnockoutProgressionKind(input.predictionKind)) return false;

  const nowMs = input.nowMs ?? Date.now();

  if (input.predictionKind === "round_of_16") {
    const ms = matchStateForR16GradualWinnerSlot(input.slotKey, input.gradual);
    if (ms?.started) return true;
    const pub = resolveR32PublicMatch(
      r32MatchIndexForR16SlotKey(input.slotKey),
      input.gradual,
      input.tournamentMatches,
    );
    if (pub && hasOfficialKnockoutMatchResult(pub)) return true;
    return false;
  }

  if (input.predictionKind === "round_of_32") {
    const ms = matchStateForR32Slot(input.slotKey, input.gradual);
    if (ms?.started) return true;
    const pub =
      ms != null
        ? resolveR32PublicMatch(
            ms.matchIndex,
            input.gradual,
            input.tournamentMatches,
          )
        : null;
    if (pub && hasOfficialKnockoutMatchResult(pub)) return true;
    return false;
  }

  const match = resolveTournamentMatchForKnockoutSlot(input);
  if (match && isKnockoutMatchLockedForParticipant(match, nowMs)) return true;

  if (input.pickStatus === "out" && input.savedTeamId?.trim()) return true;

  if (input.savedTeamId?.trim()) return true;

  if (
    isLaterRoundKnockoutRowFrozenForMissingBackfill({
      resultKind: input.predictionKind,
      slotKey: input.slotKey,
      savedTeamId: input.savedTeamId,
      tournamentMatches: input.tournamentMatches,
      gradual: input.gradual,
      progressionRows: input.progressionRows ?? [],
      teams: input.teams,
      nowMs,
    })
  ) {
    return true;
  }

  return false;
}
