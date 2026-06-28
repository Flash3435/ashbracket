import {
  knockoutParticipantSlotPair,
  r16R32ParticipantPair,
  WC2026_R16_R32_PARTICIPANT_PAIRS,
} from "../bracket/wc2026KnockoutPairings";
import { r32SlotKeysForMatchIndex } from "../bracket/wc2026RoundOf32";
import { r16SlotKeyForR32MatchIndex } from "../picks/gradualKnockoutUnlock";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { KnockoutProgressionPredictionKind } from "./knockoutProgressionKinds";

export const KNOCKOUT_BRACKET_PATH_REVIEW_MESSAGE =
  "The knockout bracket path was updated to match FIFA's official pairings. Please review your Round of 16 and later picks.";

export type KnockoutPathPickClearReason =
  | "not_in_official_matchup"
  | "upstream_incomplete"
  | "not_in_r32_match";

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

function r32MatchParticipants(
  slots: KnockoutPickSlotDraft[],
  matchIndex: number,
): { home: string | null; away: string | null } {
  const { top, bottom } = r32SlotKeysForMatchIndex(matchIndex);
  const home = slotTeamId(slots, "round_of_32", top) || null;
  const away = slotTeamId(slots, "round_of_32", bottom) || null;
  return { home, away };
}

function r32WinnerTeamId(
  slots: KnockoutPickSlotDraft[],
  matchIndex: number,
): string | null {
  const key = r16SlotKeyForR32MatchIndex(matchIndex);
  return slotTeamId(slots, "round_of_16", key) || null;
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
): boolean {
  if (!teamId) return true;
  const { home, away } = r32MatchParticipants(slots, matchIndex);
  if (!home && !away) return true;
  if (home && away) return teamId === home || teamId === away;
  return (home != null && teamId === home) || (away != null && teamId === away);
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
): { home: string | null; away: string | null } {
  const pair = r16R32ParticipantPair(matchIndex);
  if (!pair) return { home: null, away: null };
  return {
    home: r32WinnerTeamId(slots, pair[0]),
    away: r32WinnerTeamId(slots, pair[1]),
  };
}

function officialQfSides(
  slots: KnockoutPickSlotDraft[],
  matchIndex: number,
): { home: string | null; away: string | null } {
  const pair = knockoutParticipantSlotPair("quarterfinal", matchIndex);
  if (!pair) return { home: null, away: null };
  return {
    home: slotTeamId(slots, "quarterfinalist", pair[0]) || null,
    away: slotTeamId(slots, "quarterfinalist", pair[1]) || null,
  };
}

function officialSfSides(
  slots: KnockoutPickSlotDraft[],
  matchIndex: number,
): { home: string | null; away: string | null } {
  const pair = knockoutParticipantSlotPair("semifinal", matchIndex);
  if (!pair) return { home: null, away: null };
  return {
    home: slotTeamId(slots, "semifinalist", pair[0]) || null,
    away: slotTeamId(slots, "semifinalist", pair[1]) || null,
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
export function pruneOfficialKnockoutPathPicks(
  slots: KnockoutPickSlotDraft[],
): PruneOfficialKnockoutPathResult {
  const cleared: ClearedKnockoutPathPick[] = [];
  let result = slots;

  for (let matchIndex = 0; matchIndex < WC2026_R16_R32_PARTICIPANT_PAIRS.length; matchIndex++) {
    const slotKey = r16SlotKeyForR32MatchIndex(matchIndex);
    const row = result.find(
      (s) => s.predictionKind === "round_of_16" && s.slotKey === slotKey,
    );
    if (!row?.teamId.trim()) continue;
    if (!isValidR32WinnerForMatch(result, matchIndex, row.teamId.trim())) {
      result = clearRow(result, row, "not_in_r32_match", cleared);
    }
  }

  for (let matchIndex = 0; matchIndex < 8; matchIndex++) {
    const slotKey = String(matchIndex + 1);
    const row = result.find(
      (s) => s.predictionKind === "quarterfinalist" && s.slotKey === slotKey,
    );
    if (!row?.teamId.trim()) continue;
    const sides = officialR16Sides(result, matchIndex);
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
    const sides = officialQfSides(result, matchIndex);
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

  for (const slotKey of ["1", "2"]) {
    const row = result.find(
      (s) => s.predictionKind === "finalist" && s.slotKey === slotKey,
    );
    if (!row?.teamId.trim()) continue;
    const sides = officialFinalSides(result);
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
