import {
  knockoutParticipantSlotPair,
  r16R32ParticipantPair,
} from "../bracket/wc2026KnockoutPairings";
import { WC2026_R32_MATCH_DEFS } from "../bracket/wc2026RoundOf32";
import {
  readConfirmedR32MatchWinner,
  readOfficialR32MatchResultWinner,
  type ConfirmedR32WinnerContext,
} from "../picks/knockoutMatchPickRows";
import { r16SlotKeyForR32MatchIndex } from "../picks/gradualKnockoutUnlock";
import { isValidSavedPickForMatchup } from "../picks/knockoutPickEditability";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { KnockoutProgressionPredictionKind } from "./knockoutProgressionKinds";

export const KNOCKOUT_BRACKET_PATH_REVIEW_MESSAGE =
  "Some saved knockout picks no longer match the official match slots. Your original picks are preserved — review any picks marked out.";

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

const LATER_MATCH_SLOT_KINDS: {
  predictionKind: KnockoutProgressionPredictionKind;
  slotCount: number;
  officialSides: (
    slots: KnockoutPickSlotDraft[],
    slotIndex: number,
    ctx?: ConfirmedR32WinnerContext,
  ) => { home: string | null; away: string | null };
}[] = [
  {
    predictionKind: "quarterfinalist",
    slotCount: 8,
    officialSides: (slots, slotIndex, ctx) => {
      const sides = officialR16Sides(slots, slotIndex, ctx);
      return { home: sides.home, away: sides.away };
    },
  },
  {
    predictionKind: "semifinalist",
    slotCount: 4,
    officialSides: (slots, slotIndex, ctx) => {
      const sides = officialQfSides(slots, slotIndex, ctx);
      return { home: sides.home, away: sides.away };
    },
  },
  {
    predictionKind: "finalist",
    slotCount: 2,
    officialSides: (slots, slotIndex, ctx) => {
      const sides = officialSfSides(slots, slotIndex, ctx);
      return { home: sides.home, away: sides.away };
    },
  },
  {
    predictionKind: "champion",
    slotCount: 1,
    officialSides: (slots) => {
      const sides = officialFinalSides(slots);
      return { home: sides.home, away: sides.away };
    },
  },
];

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

function officialR32WinnerTeamId(
  matchIndex: number,
  ctx?: ConfirmedR32WinnerContext,
): string | null {
  return readOfficialR32MatchResultWinner(matchIndex, ctx);
}

function isValidR32WinnerForMatch(
  slots: KnockoutPickSlotDraft[],
  matchIndex: number,
  teamId: string,
  ctx?: ConfirmedR32WinnerContext,
): boolean {
  if (!teamId) return true;
  const official = officialR32WinnerTeamId(matchIndex, ctx);
  if (official) return official === teamId;
  return readConfirmedR32MatchWinner(matchIndex, slots, ctx) === teamId;
}

function recordInvalidPick(
  row: KnockoutPickSlotDraft,
  reason: KnockoutPathPickClearReason,
  cleared: ClearedKnockoutPathPick[],
): void {
  const teamId = row.teamId.trim();
  if (!teamId) return;
  if (row.pickStatus === "out") return;
  cleared.push({
    predictionKind: row.predictionKind as KnockoutProgressionPredictionKind,
    slotKey: row.slotKey,
    rowKey: row.rowKey,
    teamId,
    reason,
  });
}

function officialR16Sides(
  slots: KnockoutPickSlotDraft[],
  matchIndex: number,
  ctx?: ConfirmedR32WinnerContext,
): { home: string | null; away: string | null } {
  const pair = r16R32ParticipantPair(matchIndex);
  if (!pair) return { home: null, away: null };
  return {
    home: officialR32WinnerTeamId(pair[0], ctx),
    away: officialR32WinnerTeamId(pair[1], ctx),
  };
}

function officialKnockoutFeederWinner(
  stageCode: "round_of_16" | "quarterfinal" | "semifinal",
  firstFifaMatchNo: number,
  feederSlotKey: string,
  ctx?: ConfirmedR32WinnerContext,
): string | null {
  const slotNo = parseInt(feederSlotKey, 10);
  if (!Number.isFinite(slotNo) || slotNo < 1) return null;
  if (!ctx?.teams?.length || !ctx.tournamentMatches) return null;
  const fifaMatchNo = firstFifaMatchNo + slotNo - 1;
  const stageMatches = ctx.tournamentMatches.filter(
    (m) => m.stage_code === stageCode,
  );
  const direct = `M${fifaMatchNo}`;
  const pub =
    stageMatches.find((m) => m.match_code === direct) ??
    stageMatches.find((m) => m.match_code.endsWith(`-${fifaMatchNo}`)) ??
    null;
  if (!pub?.winner_country_code?.trim()) return null;
  const code = pub.winner_country_code.trim().toUpperCase();
  return (
    ctx.teams.find(
      (t) => (t.countryCode ?? "").trim().toUpperCase() === code,
    )?.id ?? null
  );
}

function officialQfSides(
  slots: KnockoutPickSlotDraft[],
  matchIndex: number,
  ctx?: ConfirmedR32WinnerContext,
): { home: string | null; away: string | null } {
  const pair = knockoutParticipantSlotPair("quarterfinal", matchIndex);
  if (!pair) return { home: null, away: null };
  return {
    home: officialKnockoutFeederWinner(
      "round_of_16",
      89,
      pair[0],
      ctx,
    ),
    away: officialKnockoutFeederWinner(
      "round_of_16",
      89,
      pair[1],
      ctx,
    ),
  };
}

function officialSfSides(
  slots: KnockoutPickSlotDraft[],
  matchIndex: number,
  ctx?: ConfirmedR32WinnerContext,
): { home: string | null; away: string | null } {
  const pair = knockoutParticipantSlotPair("semifinal", matchIndex);
  if (!pair) return { home: null, away: null };
  return {
    home: officialKnockoutFeederWinner("quarterfinal", 97, pair[0], ctx),
    away: officialKnockoutFeederWinner("quarterfinal", 97, pair[1], ctx),
  };
}

function officialFinalSides(
  _slots: KnockoutPickSlotDraft[],
  ctx?: ConfirmedR32WinnerContext,
): { home: string | null; away: string | null } {
  const pair = knockoutParticipantSlotPair("final", 0);
  if (!pair) return { home: null, away: null };
  return {
    home: officialKnockoutFeederWinner("semifinal", 101, pair[0], ctx),
    away: officialKnockoutFeederWinner("semifinal", 101, pair[1], ctx),
  };
}

/**
 * Audits knockout progression picks against official match-slot sides (M89–M104).
 * Does not delete or clear participant picks — returns findings only.
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

  for (let matchIndex = 0; matchIndex < WC2026_R32_MATCH_DEFS.length; matchIndex++) {
    if (isExemptR32MatchIndex(matchIndex, ctx?.exemptR32MatchIndices)) continue;
    const slotKey = r16SlotKeyForR32MatchIndex(matchIndex);
    const row = slots.find(
      (s) => s.predictionKind === "round_of_16" && s.slotKey === slotKey,
    );
    if (!row?.teamId.trim()) continue;
    if (
      !isValidR32WinnerForMatch(slots, matchIndex, row.teamId.trim(), ctx)
    ) {
      recordInvalidPick(row, "not_in_r32_match", cleared);
    }
  }

  for (const round of LATER_MATCH_SLOT_KINDS) {
    for (let slotIndex = 0; slotIndex < round.slotCount; slotIndex++) {
      const slotKey =
        round.predictionKind === "champion" ? null : String(slotIndex + 1);
      const row = slots.find(
        (s) =>
          s.predictionKind === round.predictionKind && s.slotKey === slotKey,
      );
      if (!row?.teamId.trim()) continue;
      const sides = round.officialSides(slots, slotIndex, ctx);
      const reason: KnockoutPathPickClearReason =
        !sides.home || !sides.away
          ? "upstream_incomplete"
          : "not_in_official_matchup";
      if (
        !isValidSavedPickForMatchup({
          savedTeamId: row.teamId.trim(),
          homeTeamId: sides.home,
          awayTeamId: sides.away,
        })
      ) {
        if (reason === "not_in_official_matchup") {
          recordInvalidPick(row, reason, cleared);
        }
      }
    }
  }

  return { slots, cleared };
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
