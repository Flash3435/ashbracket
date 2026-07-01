import {
  knockoutParticipantSlotPair,
  r16R32ParticipantPair,
} from "../bracket/wc2026KnockoutPairings";
import { WC2026_R32_MATCH_DEFS } from "../bracket/wc2026RoundOf32";
import {
  readConfirmedR32MatchWinner,
  type ConfirmedR32WinnerContext,
} from "../picks/knockoutMatchPickRows";
import { r16SlotKeyForR32MatchIndex } from "../picks/gradualKnockoutUnlock";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { KnockoutProgressionPredictionKind } from "./knockoutProgressionKinds";

export const KNOCKOUT_BRACKET_PATH_REVIEW_MESSAGE =
  "The knockout bracket path was updated to match FIFA's official pairings. Please review your Round of 16 and later picks.";

export type KnockoutPathPickClearReason =
  | "not_in_official_matchup"
  | "upstream_incomplete"
  | "not_in_r32_match"
  | "restored_from_audit"
  | "restored_from_reviewed_audit";

export type ClearedKnockoutPathPick = {
  predictionKind: KnockoutProgressionPredictionKind;
  slotKey: string | null;
  rowKey: string;
  teamId: string;
  reason: KnockoutPathPickClearReason;
};

export type PruneOfficialKnockoutPathResult = {
  slots: KnockoutPickSlotDraft[];
  cleared: ClearedKnockoutPathPick[];
};

function slotTeamId(
  slots: KnockoutPickSlotDraft[],
  kind: KnockoutProgressionPredictionKind,
  slotKey: string | null,
): string {
  return (
    slots
      .find((s) => s.predictionKind === kind && s.slotKey === slotKey)
      ?.teamId.trim() ?? ""
  );
}

function r32WinnerTeamId(
  slots: KnockoutPickSlotDraft[],
  matchIndex: number,
  ctx?: ConfirmedR32WinnerContext,
): string | null {
  const winner = readConfirmedR32MatchWinner(matchIndex, slots, ctx);
  return winner || null;
}

/** Pick survives only when both sides are known and the team is in that official matchup. */
function isValidOfficialMatchWinnerPick(
  teamId: string,
  home: string | null,
  away: string | null,
): boolean {
  if (!teamId) return true;
  if (!home || !away) return false;
  return teamId === home || teamId === away;
}

function isValidR32WinnerForMatch(
  slots: KnockoutPickSlotDraft[],
  matchIndex: number,
  teamId: string,
  ctx?: ConfirmedR32WinnerContext,
): boolean {
  if (!teamId) return true;
  return readConfirmedR32MatchWinner(matchIndex, slots, ctx) === teamId;
}

function clearRow(
  slots: KnockoutPickSlotDraft[],
  row: KnockoutPickSlotDraft,
  reason: KnockoutPathPickClearReason,
  cleared: ClearedKnockoutPathPick[],
): KnockoutPickSlotDraft[] {
  const teamId = row.teamId.trim();
  if (!teamId) return slots;
  cleared.push({
    predictionKind: row.predictionKind as KnockoutProgressionPredictionKind,
    slotKey: row.slotKey,
    rowKey: row.rowKey,
    teamId,
    reason,
  });
  return slots.map((s) =>
    s.rowKey === row.rowKey ? { ...s, teamId: "" } : s,
  );
}

function officialR16Sides(
  slots: KnockoutPickSlotDraft[],
  matchIndex: number,
  ctx?: ConfirmedR32WinnerContext,
): { home: string | null; away: string | null } {
  const pair = r16R32ParticipantPair(matchIndex);
  if (!pair) return { home: null, away: null };
  return {
    home: r32WinnerTeamId(slots, pair[0], ctx),
    away: r32WinnerTeamId(slots, pair[1], ctx),
  };
}

function validatedR16MatchWinner(
  slots: KnockoutPickSlotDraft[],
  r16MatchIndex: number,
  ctx?: ConfirmedR32WinnerContext,
): string | null {
  const sides = officialR16Sides(slots, r16MatchIndex, ctx);
  const pick = slotTeamId(slots, "quarterfinalist", String(r16MatchIndex + 1));
  if (!pick || !sides.home || !sides.away) return null;
  if (pick === sides.home || pick === sides.away) return pick;
  return null;
}

function validatedQfMatchWinner(
  slots: KnockoutPickSlotDraft[],
  qfMatchIndex: number,
  ctx?: ConfirmedR32WinnerContext,
): string | null {
  const sides = officialQfMatchSides(slots, qfMatchIndex, ctx);
  const pick = slotTeamId(slots, "semifinalist", String(qfMatchIndex + 1));
  if (!pick || !sides.home || !sides.away) return null;
  if (pick === sides.home || pick === sides.away) return pick;
  return null;
}

function officialQfMatchSides(
  slots: KnockoutPickSlotDraft[],
  matchIndex: number,
  ctx?: ConfirmedR32WinnerContext,
): { home: string | null; away: string | null } {
  const pair = knockoutParticipantSlotPair("quarterfinal", matchIndex);
  if (!pair) return { home: null, away: null };
  return {
    home: validatedR16MatchWinner(slots, parseInt(pair[0], 10) - 1, ctx),
    away: validatedR16MatchWinner(slots, parseInt(pair[1], 10) - 1, ctx),
  };
}

function officialQfSides(
  slots: KnockoutPickSlotDraft[],
  matchIndex: number,
  ctx?: ConfirmedR32WinnerContext,
): { home: string | null; away: string | null } {
  return officialQfMatchSides(slots, matchIndex, ctx);
}

function officialSfSides(
  slots: KnockoutPickSlotDraft[],
  matchIndex: number,
  ctx?: ConfirmedR32WinnerContext,
): { home: string | null; away: string | null } {
  const pair = knockoutParticipantSlotPair("semifinal", matchIndex);
  if (!pair) return { home: null, away: null };
  return {
    home: validatedQfMatchWinner(slots, parseInt(pair[0], 10) - 1, ctx),
    away: validatedQfMatchWinner(slots, parseInt(pair[1], 10) - 1, ctx),
  };
}

function officialFinalSides(slots: KnockoutPickSlotDraft[]): {
  home: string | null;
  away: string | null;
} {
  const pair = knockoutParticipantSlotPair("final", 0);
  if (!pair) return { home: null, away: null };
  return {
    home: slotTeamId(slots, "finalist", pair[0]) || null,
    away: slotTeamId(slots, "finalist", pair[1]) || null,
  };
}

/**
 * Clears knockout progression picks that cannot be valid under FIFA's official
 * bracket path (M89–M104). Does not touch group, third-place, or bonus rows.
 */
export type PruneOfficialKnockoutPathOptions = ConfirmedR32WinnerContext & {
  /** Skip R32 winner-slot validation for these match indices (admin corrections). */
  exemptR32MatchIndices?: ReadonlySet<number> | readonly number[];
};

function isExemptR32MatchIndex(
  matchIndex: number,
  exempt: PruneOfficialKnockoutPathOptions["exemptR32MatchIndices"],
): boolean {
  if (!exempt) return false;
  if (exempt instanceof Set) return exempt.has(matchIndex);
  return (exempt as readonly number[]).includes(matchIndex);
}

export function pruneOfficialKnockoutPathPicks(
  slots: KnockoutPickSlotDraft[],
  ctx?: PruneOfficialKnockoutPathOptions,
): PruneOfficialKnockoutPathResult {
  const cleared: ClearedKnockoutPathPick[] = [];
  let result = slots;

  for (let matchIndex = 0; matchIndex < WC2026_R32_MATCH_DEFS.length; matchIndex++) {
    if (isExemptR32MatchIndex(matchIndex, ctx?.exemptR32MatchIndices)) continue;
    const slotKey = r16SlotKeyForR32MatchIndex(matchIndex);
    const row = result.find(
      (s) => s.predictionKind === "round_of_16" && s.slotKey === slotKey,
    );
    if (!row?.teamId.trim()) continue;
    if (
      !isValidR32WinnerForMatch(result, matchIndex, row.teamId.trim(), ctx)
    ) {
      result = clearRow(result, row, "not_in_r32_match", cleared);
    }
  }

  for (let matchIndex = 0; matchIndex < 8; matchIndex++) {
    const slotKey = String(matchIndex + 1);
    const row = result.find(
      (s) => s.predictionKind === "quarterfinalist" && s.slotKey === slotKey,
    );
    if (!row?.teamId.trim()) continue;
    const sides = officialR16Sides(result, matchIndex, ctx);
    const reason: KnockoutPathPickClearReason =
      !sides.home || !sides.away ? "upstream_incomplete" : "not_in_official_matchup";
    if (
      !isValidOfficialMatchWinnerPick(
        row.teamId.trim(),
        sides.home,
        sides.away,
      )
    ) {
      result = clearRow(result, row, reason, cleared);
    }
  }

  for (let matchIndex = 0; matchIndex < 4; matchIndex++) {
    const slotKey = String(matchIndex + 1);
    const row = result.find(
      (s) => s.predictionKind === "semifinalist" && s.slotKey === slotKey,
    );
    if (!row?.teamId.trim()) continue;
    const sides = officialQfSides(result, matchIndex, ctx);
    const reason: KnockoutPathPickClearReason =
      !sides.home || !sides.away ? "upstream_incomplete" : "not_in_official_matchup";
    if (
      !isValidOfficialMatchWinnerPick(
        row.teamId.trim(),
        sides.home,
        sides.away,
      )
    ) {
      result = clearRow(result, row, reason, cleared);
    }
  }

  // Finalist slots store semi-final match winners (M101/M102), not the final pairing.
  for (let matchIndex = 0; matchIndex < 2; matchIndex++) {
    const slotKey = String(matchIndex + 1);
    const row = result.find(
      (s) => s.predictionKind === "finalist" && s.slotKey === slotKey,
    );
    if (!row?.teamId.trim()) continue;
    const sides = officialSfSides(result, matchIndex, ctx);
    const reason: KnockoutPathPickClearReason =
      !sides.home || !sides.away ? "upstream_incomplete" : "not_in_official_matchup";
    if (
      !isValidOfficialMatchWinnerPick(
        row.teamId.trim(),
        sides.home,
        sides.away,
      )
    ) {
      result = clearRow(result, row, reason, cleared);
    }
  }

  const champRow = result.find((s) => s.predictionKind === "champion");
  if (champRow?.teamId.trim()) {
    const sides = officialFinalSides(result);
    const reason: KnockoutPathPickClearReason =
      !sides.home || !sides.away ? "upstream_incomplete" : "not_in_official_matchup";
    if (
      !isValidOfficialMatchWinnerPick(
        champRow.teamId.trim(),
        sides.home,
        sides.away,
      )
    ) {
      result = clearRow(result, champRow, reason, cleared);
    }
  }

  return { slots: result, cleared };
}

export function summarizeKnockoutPathRepair(cleared: ClearedKnockoutPathPick[]): {
  clearedByKind: Record<string, number>;
  totalCleared: number;
} {
  const clearedByKind: Record<string, number> = {};
  for (const row of cleared) {
    clearedByKind[row.predictionKind] =
      (clearedByKind[row.predictionKind] ?? 0) + 1;
  }
  return { clearedByKind, totalCleared: cleared.length };
}

export function participantNeedsKnockoutPathReview(
  cleared: ClearedKnockoutPathPick[],
): boolean {
  return cleared.some((c) =>
    ["quarterfinalist", "semifinalist", "finalist", "champion"].includes(
      c.predictionKind,
    ),
  );
}
