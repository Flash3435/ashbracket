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

export const KNOCKOUT_PICK_LOCKED_AT_KICKOFF =
  "This match has already kicked off and can no longer be edited.";

export const KNOCKOUT_PICK_LOCKED_OFFICIAL_RESULT =
  "This match is locked because an official result is published.";

export const KNOCKOUT_PICK_LOCKED_FEEDER_RESULTS =
  "This pick is locked because feeder match results are official.";

export const KNOCKOUT_MISSING_PICK_PROGRESS_LOCK_HELPER =
  "This matchup is locked because this part of the bracket was already in progress after official feeder results.";

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
  { predictionKind: string; slotKey: string | null; teamId: string },
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
    if (!row.teamId.trim()) return false;
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

/** Freeze a missing later-round pick when feeders are official and the bracket was in progress. */
export function isLaterRoundKnockoutRowFrozenForMissingBackfill(input: {
  resultKind: string;
  slotKey: string | null;
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  gradual: GradualKnockoutSelectionState;
  progressionRows: readonly KnockoutProgressionRowRef[];
}): boolean {
  if (!isLaterRoundKnockoutResultKind(input.resultKind)) return false;
  if (
    !isKnockoutSlotFrozenByOfficialFeeders({
      predictionKind: input.resultKind,
      slotKey: input.slotKey,
      tournamentMatches: input.tournamentMatches,
      gradual: input.gradual,
    })
  ) {
    return false;
  }
  return participantHasKnockoutProgressPastStage(
    input.progressionRows,
    input.resultKind,
    input.slotKey,
  );
}

export function shouldFreezeLaterRoundKnockoutMatchRow(input: {
  resultKind: KnockoutProgressionPredictionKind;
  slotKey: string | null;
  savedTeamId?: string | null;
  pickStatus?: "active" | "out" | null;
  clearedByPathRepair?: boolean;
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  gradual: GradualKnockoutSelectionState;
  progressionRows: readonly KnockoutProgressionRowRef[];
}): boolean {
  if (!isLaterRoundKnockoutResultKind(input.resultKind)) return false;
  if (
    !isKnockoutSlotFrozenByOfficialFeeders({
      predictionKind: input.resultKind,
      slotKey: input.slotKey,
      tournamentMatches: input.tournamentMatches,
      gradual: input.gradual,
    })
  ) {
    return false;
  }
  if (input.savedTeamId?.trim()) return true;
  if (input.pickStatus === "out" && input.savedTeamId?.trim()) return true;
  if (input.clearedByPathRepair) return true;
  return participantHasKnockoutProgressPastStage(
    input.progressionRows,
    input.resultKind,
    input.slotKey,
  );
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
}): string {
  const rowLabel = knockoutPickEditBlockedRowLabel(input);
  if (isKnockoutSlotFrozenByOfficialFeeders(input)) {
    return `${rowLabel}: ${KNOCKOUT_PICK_LOCKED_FEEDER_RESULTS}`;
  }
  const match = resolveTournamentMatchForKnockoutSlot(input);
  if (match && hasOfficialKnockoutMatchResult(match)) {
    return `${rowLabel}: ${KNOCKOUT_PICK_LOCKED_OFFICIAL_RESULT}`;
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
  progressionRows?: readonly KnockoutProgressionRowRef[];
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

  if (isKnockoutSlotFrozenByOfficialFeeders(input)) {
    if (input.savedTeamId?.trim()) return false;
    if (
      input.progressionRows &&
      isLaterRoundKnockoutRowFrozenForMissingBackfill({
        resultKind: input.predictionKind,
        slotKey: input.slotKey,
        tournamentMatches: input.tournamentMatches,
        gradual: input.gradual,
        progressionRows: input.progressionRows,
      })
    ) {
      return false;
    }
    return true;
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
  progressionRows?: readonly KnockoutProgressionRowRef[];
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

  if (isKnockoutSlotFrozenByOfficialFeeders(input)) {
    if (input.savedTeamId?.trim()) return true;
    if (
      input.progressionRows &&
      isLaterRoundKnockoutRowFrozenForMissingBackfill({
        resultKind: input.predictionKind,
        slotKey: input.slotKey,
        tournamentMatches: input.tournamentMatches,
        gradual: input.gradual,
        progressionRows: input.progressionRows,
      })
    ) {
      return true;
    }
    return false;
  }

  return false;
}
