import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { knockoutParticipantSlotPair } from "../bracket/wc2026KnockoutPairings";
import type { KnockoutProgressionPredictionKind } from "../predictions/knockoutProgressionKinds";
import { isKnockoutPickLockedOut } from "../predictions/knockoutPickStatus";
import type { GradualKnockoutSelectionState } from "./gradualKnockoutUnlock";
import {
  isLaterRoundKnockoutResultKind,
  isLaterRoundKnockoutRowFrozenForMissingBackfill,
  type LaterRoundKnockoutResultKind,
} from "./knockoutPickEditability";

export type AutoCarriedMatchSlotPickSourceSlot = {
  predictionKind: KnockoutProgressionPredictionKind;
  slotKey: string;
};

export type AutoCarriedMatchSlotPickResult =
  | {
      status: "inferred_live";
      inferredTeamId: string;
      sourceSlots: AutoCarriedMatchSlotPickSourceSlot[];
      summaryCopy: string;
      detailCopy: string;
    }
  | {
      status: "not_inferable";
      inferredTeamId: null;
      sourceSlots: [];
      summaryCopy: null;
      detailCopy: null;
    };

function teamName(teamId: string, teams: Team[]): string {
  return teams.find((t) => t.id === teamId)?.name?.trim() ?? teamId;
}

function feederConfigForResultKind(resultKind: LaterRoundKnockoutResultKind): {
  stage: "quarterfinal" | "semifinal" | "final";
  feederPredictionKind: KnockoutProgressionPredictionKind;
} | null {
  switch (resultKind) {
    case "semifinalist":
      return { stage: "quarterfinal", feederPredictionKind: "quarterfinalist" };
    case "finalist":
      return { stage: "semifinal", feederPredictionKind: "semifinalist" };
    case "champion":
      return { stage: "final", feederPredictionKind: "finalist" };
    case "quarterfinalist":
      return null;
  }
}

function matchIndexForSlotKey(
  resultKind: LaterRoundKnockoutResultKind,
  slotKey: string | null,
): number | null {
  if (resultKind === "champion") return 0;
  const slotNo = parseInt(slotKey ?? "", 10);
  if (!Number.isFinite(slotNo) || slotNo < 1) return null;
  return slotNo - 1;
}

function readFeederSavedTeamId(
  slots: readonly KnockoutPickSlotDraft[],
  feederPredictionKind: KnockoutProgressionPredictionKind,
  feederSlotKey: string,
): string | null {
  const row = slots.find(
    (s) =>
      s.predictionKind === feederPredictionKind && s.slotKey === feederSlotKey,
  );
  const teamId = row?.teamId.trim() ?? "";
  if (!teamId || isKnockoutPickLockedOut(row ?? { teamId: "", pickStatus: null })) {
    return null;
  }
  return teamId;
}

function survivingOfficialSidesFromUpstreamFeeders(input: {
  resultKind: LaterRoundKnockoutResultKind;
  slotKey: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  slots: readonly KnockoutPickSlotDraft[];
}): {
  teams: string[];
  sourceSlots: AutoCarriedMatchSlotPickSourceSlot[];
} {
  const home = input.homeTeamId?.trim() ?? "";
  const away = input.awayTeamId?.trim() ?? "";
  if (!home || !away) {
    return { teams: [], sourceSlots: [] };
  }

  const feederConfig = feederConfigForResultKind(input.resultKind);
  const matchIndex = matchIndexForSlotKey(input.resultKind, input.slotKey);
  if (!feederConfig || matchIndex == null) {
    return { teams: [], sourceSlots: [] };
  }

  const pair = knockoutParticipantSlotPair(feederConfig.stage, matchIndex);
  if (!pair) return { teams: [], sourceSlots: [] };

  const officialSides = new Set([home, away]);
  const teams: string[] = [];
  const sourceSlots: AutoCarriedMatchSlotPickSourceSlot[] = [];

  for (const feederSlotKey of pair) {
    const teamId = readFeederSavedTeamId(
      input.slots,
      feederConfig.feederPredictionKind,
      feederSlotKey,
    );
    if (!teamId || !officialSides.has(teamId)) continue;
    if (teams.includes(teamId)) continue;
    teams.push(teamId);
    sourceSlots.push({
      predictionKind: feederConfig.feederPredictionKind,
      slotKey: feederSlotKey,
    });
  }

  return { teams, sourceSlots };
}

export function autoCarriedPickDetailCopy(teamNameLabel: string): string {
  return `${teamNameLabel} was carried forward from your original bracket because it is the only surviving original pick in this match.`;
}

export function autoCarriedPickSummaryCopy(teamNameLabel: string): string {
  return `Auto-carried pick: ${teamNameLabel}`;
}

/**
 * Infer a missing later-round winner from upstream surviving original feeder picks.
 * Only when the official matchup is known, the slot is frozen, and exactly one
 * official side matches a non-out upstream saved pick.
 */
export function inferAutoCarriedMatchSlotPick(input: {
  resultKind: string;
  slotKey: string | null;
  savedTeamId?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  slots: readonly KnockoutPickSlotDraft[];
  teams: Team[];
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  gradual: GradualKnockoutSelectionState;
  nowMs?: number;
}): AutoCarriedMatchSlotPickResult {
  const notInferable: AutoCarriedMatchSlotPickResult = {
    status: "not_inferable",
    inferredTeamId: null,
    sourceSlots: [],
    summaryCopy: null,
    detailCopy: null,
  };

  if (input.savedTeamId?.trim()) return notInferable;
  if (!isLaterRoundKnockoutResultKind(input.resultKind)) return notInferable;
  if (input.resultKind === "quarterfinalist") return notInferable;

  const frozen = isLaterRoundKnockoutRowFrozenForMissingBackfill({
    resultKind: input.resultKind,
    slotKey: input.slotKey,
    savedTeamId: input.savedTeamId,
    tournamentMatches: input.tournamentMatches,
    gradual: input.gradual,
    progressionRows: input.slots,
    teams: input.teams,
    nowMs: input.nowMs,
  });
  if (!frozen) return notInferable;

  const { teams, sourceSlots } = survivingOfficialSidesFromUpstreamFeeders({
    resultKind: input.resultKind,
    slotKey: input.slotKey,
    homeTeamId: input.homeTeamId ?? null,
    awayTeamId: input.awayTeamId ?? null,
    slots: input.slots,
  });

  if (teams.length !== 1) return notInferable;

  const inferredTeamId = teams[0]!;
  const label = teamName(inferredTeamId, input.teams);
  return {
    status: "inferred_live",
    inferredTeamId,
    sourceSlots,
    summaryCopy: autoCarriedPickSummaryCopy(label),
    detailCopy: autoCarriedPickDetailCopy(label),
  };
}

/** @alias inferAutoCarriedMatchSlotPick */
export const deriveAutoCarriedMatchSlotPick = inferAutoCarriedMatchSlotPick;
