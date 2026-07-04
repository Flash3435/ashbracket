import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { getGradualKnockoutSelectionState } from "./gradualKnockoutUnlock";
import {
  buildKnockoutMatchPickRows,
  isKnockoutMatchDirectPickEligible,
  knockoutMatchSavedPickPresentation,
  readOfficialR32MatchResultWinner,
  type ConfirmedR32WinnerContext,
  type KnockoutMatchPickRow,
} from "./knockoutMatchPickRows";
import {
  isKnockoutSlotFrozenByOfficialFeeders,
  isValidSavedPickForMatchup,
} from "./knockoutPickEditability";
import { applyKnockoutPathInvalidation } from "../predictions/knockoutPathInvalidation";
import { pruneOfficialKnockoutPathPicks } from "../predictions/pruneOfficialKnockoutPathPicks";
import { pruneParticipantPicks } from "../predictions/knockoutPickConsistency";

export type KnockoutR16RowDiagnostic = {
  participantId: string | null;
  poolId: string | null;
  fifaMatchNo: number;
  storedWinnerTeamId: string | null;
  storedPickStatus: KnockoutMatchPickRow["pickStatus"];
  resolvedSideTeamIds: {
    homeTeamId: string | null;
    awayTeamId: string | null;
  };
  feederOfficialWinners: Record<string, string | null>;
  kickoffIso: string | null;
  matchStartedOrResult: boolean;
  feedersOfficial: boolean;
  validSavedPick: boolean;
  lockReason: KnockoutMatchPickRow["lockReason"];
  directPickEligible: boolean;
  editabilityReason: string;
  matchupLine: string | null;
  savedPickSummaryLine: string | null;
  deployCommitSha: string | null;
};

function teamLabel(teamId: string | null, teams: Team[]): string | null {
  if (!teamId?.trim()) return null;
  return teams.find((t) => t.id === teamId)?.name?.trim() ?? teamId;
}

function editabilityReasonForRow(
  row: KnockoutMatchPickRow,
  input: {
    feedersOfficial: boolean;
    validSavedPick: boolean;
    matchStartedOrResult: boolean;
  },
): string {
  if (row.lockReason === "incomplete") {
    return "upstream_feeders_incomplete";
  }
  if (row.lockReason === "started" || input.matchStartedOrResult) {
    return "match_started_or_official_result";
  }
  if (row.pickStatus === "out" && row.winnerTeamId.trim()) {
    return "saved_pick_marked_out";
  }
  if (row.lockReason === "frozen" && input.validSavedPick) {
    return "valid_saved_pick_after_official_feeders";
  }
  if (row.lockReason === "frozen") {
    return "frozen_without_valid_saved_pick";
  }
  if (row.lockReason === "pickable" && !input.validSavedPick) {
    return input.feedersOfficial
      ? "open_until_kickoff_missing_or_stale_pick"
      : "pickable_before_feeder_results";
  }
  return row.lockReason;
}

/** Production/debug snapshot for one R16 wizard row (e.g. M90). */
export function diagnoseKnockoutR16MatchRow(input: {
  fifaMatchNo: number;
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  knockoutBracketPicksUnlocked?: boolean;
  participantId?: string | null;
  poolId?: string | null;
  nowMs?: number;
  deployCommitSha?: string | null;
  /** When true, run the same on-load repair path as KnockoutPicksWizard. */
  simulateWizardLoadRepair?: boolean;
}): KnockoutR16RowDiagnostic | null {
  const nowMs = input.nowMs ?? Date.now();
  const gradual = getGradualKnockoutSelectionState({
    matches: input.tournamentMatches,
    teams: input.teams,
    nowMs,
    fullRoundOf32Official: input.knockoutBracketPicksUnlocked ?? false,
  });
  const ctx: ConfirmedR32WinnerContext = {
    teams: input.teams,
    tournamentMatches: input.tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked ?? false,
  };

  let slots = input.slots;
  if (input.simulateWizardLoadRepair) {
    const pruned = pruneOfficialKnockoutPathPicks(slots, ctx);
    slots = applyKnockoutPathInvalidation(pruned.slots, pruned.cleared, {
      teams: input.teams,
      tournamentMatches: input.tournamentMatches,
      knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked ?? false,
      nowMs,
    });
    slots = pruneParticipantPicks(slots, { r32WinnerContext: ctx });
  }

  const rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots,
    teams: input.teams,
    tournamentMatches: input.tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked ?? false,
    nowMs,
  });
  const row = rows.find((r) => r.fifaMatchNo === input.fifaMatchNo);
  if (!row) return null;

  const saveSlotKey = row.saveSlotKey;
  const saveRow = slots.find(
    (s) =>
      s.predictionKind === row.savePredictionKind &&
      (saveSlotKey == null ? s.slotKey == null : s.slotKey === saveSlotKey),
  );

  const pairIndex = row.matchIndex;
  const feederMatchNos: Record<string, number> = {};
  if (pairIndex === 1) {
    feederMatchNos.M73 = 73;
    feederMatchNos.M75 = 75;
  }

  const feederOfficialWinners: Record<string, string | null> = {};
  for (const [label, fifaNo] of Object.entries(feederMatchNos)) {
    const matchIndex = fifaNo - 73;
    feederOfficialWinners[label] = readOfficialR32MatchResultWinner(
      matchIndex,
      ctx,
    );
  }

  const feedersOfficial = isKnockoutSlotFrozenByOfficialFeeders({
    predictionKind: row.savePredictionKind,
    slotKey: row.saveSlotKey,
    tournamentMatches: input.tournamentMatches,
    gradual,
  });

  const validSavedPick = isValidSavedPickForMatchup({
    savedTeamId: row.winnerTeamId,
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    pickStatus: row.pickStatus,
  });

  const presentation = knockoutMatchSavedPickPresentation(row, input.teams);
  const matchStartedOrResult = row.lockReason === "started";

  return {
    participantId: input.participantId ?? null,
    poolId: input.poolId ?? null,
    fifaMatchNo: row.fifaMatchNo,
    storedWinnerTeamId: saveRow?.teamId.trim() || row.winnerTeamId.trim() || null,
    storedPickStatus: saveRow?.pickStatus ?? row.pickStatus,
    resolvedSideTeamIds: {
      homeTeamId: row.homeTeamId,
      awayTeamId: row.awayTeamId,
    },
    feederOfficialWinners: Object.fromEntries(
      Object.entries(feederOfficialWinners).map(([k, id]) => [
        k,
        id ? teamLabel(id, input.teams) : null,
      ]),
    ),
    kickoffIso: row.kickoffIso,
    matchStartedOrResult,
    feedersOfficial,
    validSavedPick,
    lockReason: row.lockReason,
    directPickEligible: isKnockoutMatchDirectPickEligible(row),
    editabilityReason: editabilityReasonForRow(row, {
      feedersOfficial,
      validSavedPick,
      matchStartedOrResult,
    }),
    matchupLine:
      presentation.matchupLine ??
      (row.homeTeamId && row.awayTeamId
        ? `${teamLabel(row.homeTeamId, input.teams)} vs ${teamLabel(row.awayTeamId, input.teams)}`
        : null),
    savedPickSummaryLine: presentation.savedPickSummaryLine,
    deployCommitSha:
      input.deployCommitSha ??
      process.env.VERCEL_GIT_COMMIT_SHA?.trim() ??
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.trim() ??
      null,
  };
}

/** Log-friendly one-line summary for support/admin consoles. */
export function formatKnockoutR16RowDiagnostic(
  diagnostic: KnockoutR16RowDiagnostic,
): string {
  return JSON.stringify(diagnostic);
}
