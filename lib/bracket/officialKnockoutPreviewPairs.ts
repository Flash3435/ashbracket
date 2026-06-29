import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import type { GradualKnockoutSelectionState } from "../picks/gradualKnockoutUnlock";
import {
  buildKnockoutMatchPickRows,
  validatedKnockoutMatchWinner,
  type KnockoutMatchPickRow,
  type KnockoutWizardBracketKind,
} from "../picks/knockoutMatchPickRows";
import type { BracketMatchPair, BracketSide } from "../predictions/knockoutBracketLayout";
import type { BracketMatchResolved, BracketSideResolved } from "./types";

export type OfficialKnockoutPreviewInput = {
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  gradual?: GradualKnockoutSelectionState;
  knockoutBracketPicksUnlocked?: boolean;
};

export { validatedKnockoutMatchWinner };

export function buildOfficialKnockoutMatchRows(
  bracketKind: KnockoutWizardBracketKind,
  input: OfficialKnockoutPreviewInput,
): KnockoutMatchPickRow[] {
  return buildKnockoutMatchPickRows({
    bracketKind,
    slots: input.slots,
    teams: input.teams,
    tournamentMatches: input.tournamentMatches,
    gradual: input.gradual,
    knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
  });
}

function previewSide(
  teamId: string | null,
  row: KnockoutMatchPickRow,
  side: "home" | "away",
): BracketSide | null {
  if (!teamId?.trim()) return null;
  return {
    slotKey: `${row.rowKey}|${side}`,
    teamId,
    rowKey: row.rowKey,
  };
}

/** Preview column pairs aligned with list-view knockout match rows. */
export function knockoutMatchRowsToPreviewPairs(
  rows: KnockoutMatchPickRow[],
): BracketMatchPair[] {
  return rows.map((row) => ({
    matchIndex: row.matchIndex,
    top: previewSide(row.homeTeamId, row, "home"),
    bottom: previewSide(row.awayTeamId, row, "away"),
  }));
}

function resolvedSide(
  teamId: string | null,
  teamById: Map<string, Team>,
): BracketSideResolved {
  const id = teamId?.trim() || null;
  return {
    slotKey: null,
    pickRowKey: null,
    teamId: id,
    displayLabel: id ? (teamById.get(id)?.name ?? "Unknown team") : "TBD",
  };
}

/** Participant bracket model rows aligned with list-view knockout match rows. */
export function knockoutMatchRowsToResolved(
  rows: KnockoutMatchPickRow[],
  teamById: Map<string, Team>,
): BracketMatchResolved[] {
  return rows.map((row) => ({
    matchKey: row.fifaMatchNo > 0 ? `M${row.fifaMatchNo}` : `match-${row.matchIndex + 1}`,
    fifaMatchNo: row.fifaMatchNo,
    home: resolvedSide(row.homeTeamId, teamById),
    away: resolvedSide(row.awayTeamId, teamById),
    winnerTeamId: validatedKnockoutMatchWinner(row),
  }));
}

/** Bracket preview / deriveParticipantBracket helper for one knockout round. */
export function officialKnockoutPreviewPairs(
  bracketKind: KnockoutWizardBracketKind,
  input: OfficialKnockoutPreviewInput,
): BracketMatchPair[] {
  return knockoutMatchRowsToPreviewPairs(
    buildOfficialKnockoutMatchRows(bracketKind, input),
  );
}

export function officialKnockoutResolvedColumn(
  bracketKind: KnockoutWizardBracketKind,
  input: OfficialKnockoutPreviewInput,
  teamById: Map<string, Team>,
): BracketMatchResolved[] {
  return knockoutMatchRowsToResolved(
    buildOfficialKnockoutMatchRows(bracketKind, input),
    teamById,
  );
}
