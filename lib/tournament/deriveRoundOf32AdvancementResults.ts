import { r32SlotKeysForMatchIndex } from "../bracket/wc2026RoundOf32";

export type KnockoutMatchForAdvancement = {
  match_code: string;
  stage_code: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_goals: number | null;
  away_goals: number | null;
  winner_team_id: string | null;
  status: string;
  scoring_result_kind: string | null;
  scoring_stage_code: string | null;
};

export type KnockoutAdvancementResultInsert = {
  edition_id: string;
  tournament_stage_id: string;
  kind: string;
  team_id: string;
  group_code: null;
  slot_key: string;
  resolved_at: string;
  source: "sync";
  locked: false;
};

/** FIFA WC 2026 Round of 32 uses match codes M73–M88 (match index 0–15). */
export function wc2026R32MatchIndexFromCode(matchCode: string): number | null {
  const trimmed = matchCode.trim().toUpperCase();
  const m = /^M(\d+)$/.exec(trimmed);
  if (!m) return null;
  const fifaNo = Number.parseInt(m[1]!, 10);
  if (!Number.isFinite(fifaNo) || fifaNo < 73 || fifaNo > 88) return null;
  return fifaNo - 73;
}

/**
 * True when a knockout fixture is finished with a definitive winner suitable for
 * official advancement results (regulation or penalties — not live/scheduled).
 */
export function isOfficialFinishedKnockoutMatchWithWinner(
  match: Pick<
    KnockoutMatchForAdvancement,
    "status" | "winner_team_id" | "home_goals" | "away_goals"
  >,
): boolean {
  if (match.status !== "finished") return false;
  if (!match.winner_team_id?.trim()) return false;
  if (match.home_goals === null || match.away_goals === null) return false;
  return true;
}

function winnerBracketSlotKey(
  match: Pick<KnockoutMatchForAdvancement, "winner_team_id" | "home_team_id" | "away_team_id">,
  matchIndex: number,
): string | null {
  const winnerId = match.winner_team_id?.trim();
  if (!winnerId) return null;
  const { top, bottom } = r32SlotKeysForMatchIndex(matchIndex);
  if (match.home_team_id === winnerId) return top;
  if (match.away_team_id === winnerId) return bottom;
  return null;
}

/**
 * Builds `results` rows for finished official Round of 32 fixtures:
 * - `round_of_32` with the winner in their bracket slot (1–32)
 * - `round_of_16` with the winner in the canonical R16 slot (1–16) for knockout scoring
 *
 * Skips matches that already declare `scoring_result_kind` / `scoring_stage_code` (handled
 * by the generic match→result sync). Skips locked slot keys.
 */
export function buildRoundOf32AdvancementResultInserts(input: {
  editionId: string;
  matches: readonly KnockoutMatchForAdvancement[];
  roundOf32StageId: string;
  roundOf16StageId: string;
  resolvedAtIso: string;
  lockedKeys: ReadonlySet<string>;
  resultSlotKey: (
    stageId: string,
    kind: string,
    groupCode: string | null,
    slotKey: string | null,
  ) => string;
}): KnockoutAdvancementResultInsert[] {
  const out: KnockoutAdvancementResultInsert[] = [];
  const seen = new Set<string>();

  for (const match of input.matches) {
    if (match.stage_code !== "round_of_32") continue;
    if (match.scoring_result_kind && match.scoring_stage_code) continue;
    if (!isOfficialFinishedKnockoutMatchWithWinner(match)) continue;

    const matchIndex = wc2026R32MatchIndexFromCode(match.match_code);
    if (matchIndex == null) continue;

    const winnerId = match.winner_team_id!.trim();
    const resolvedAt = input.resolvedAtIso;

    const r32SlotKey = winnerBracketSlotKey(match, matchIndex);
    if (r32SlotKey) {
      const r32Key = input.resultSlotKey(
        input.roundOf32StageId,
        "round_of_32",
        null,
        r32SlotKey,
      );
      if (!input.lockedKeys.has(r32Key) && !seen.has(r32Key)) {
        seen.add(r32Key);
        out.push({
          edition_id: input.editionId,
          tournament_stage_id: input.roundOf32StageId,
          kind: "round_of_32",
          team_id: winnerId,
          group_code: null,
          slot_key: r32SlotKey,
          resolved_at: resolvedAt,
          source: "sync",
          locked: false,
        });
      }
    }

    const r16SlotKey = String(matchIndex + 1);
    const r16Key = input.resultSlotKey(
      input.roundOf16StageId,
      "round_of_16",
      null,
      r16SlotKey,
    );
    if (!input.lockedKeys.has(r16Key) && !seen.has(r16Key)) {
      seen.add(r16Key);
      out.push({
        edition_id: input.editionId,
        tournament_stage_id: input.roundOf16StageId,
        kind: "round_of_16",
        team_id: winnerId,
        group_code: null,
        slot_key: r16SlotKey,
        resolved_at: resolvedAt,
        source: "sync",
        locked: false,
      });
    }
  }

  return out;
}
