import type { SupabaseClient } from "@supabase/supabase-js";
import { WC2026_R32_MATCH_DEFS } from "../bracket/wc2026RoundOf32";
import { OFFICIAL_EDITION_CODE } from "../config/officialTournament";
import { validateKickoffAtUtc } from "./validateWc2026KickoffAt";
import knockoutFixtures from "./wc2026KnockoutFixtures.json";

export type Wc2026KnockoutFixtureRow = {
  fifa_match_no: number;
  kickoff_at: string;
  stadium: string;
  city: string;
};

export const WC2026_KNOCKOUT_FIXTURES = knockoutFixtures as Wc2026KnockoutFixtureRow[];

export function wc2026R32MatchCode(fifaMatchNo: number): string {
  return `M${fifaMatchNo}`;
}

export type SeedOfficialWc2026KnockoutFixturesSummary = {
  shellRowsCreated: number;
  shellRowsUpdated: number;
  r32RowCount: number;
};

/**
 * Idempotent upsert of official Round of 32 shell rows (M73–M88) for WC 2026.
 * Teams start null; kickoffs come from canonical JSON.
 *
 * Existing rows are never reset to `scheduled` or cleared — only missing shells are
 * inserted and canonical kickoff/stage metadata is patched when the JSON changes.
 *
 * scoring_* columns are omitted (NULL), matching official group-stage rows and
 * tournament_matches_scoring_result_kind_check (round_of_16 is not allowed).
 */
export async function seedOfficialWc2026KnockoutFixtures(
  supabase: SupabaseClient,
  options?: { editionId?: string; editionCode?: string },
): Promise<
  | { ok: true; summary: SeedOfficialWc2026KnockoutFixturesSummary }
  | { ok: false; error: string }
> {
  const editionCode = options?.editionCode?.trim() || OFFICIAL_EDITION_CODE;
  let editionId = options?.editionId?.trim();

  if (!editionId) {
    const { data: edition, error: edErr } = await supabase
      .from("tournament_editions")
      .select("id")
      .eq("code", editionCode)
      .maybeSingle();
    if (edErr) return { ok: false, error: edErr.message };
    if (!edition?.id) {
      return {
        ok: false,
        error: `Unknown edition "${editionCode}". Run WC2026 seed first.`,
      };
    }
    editionId = edition.id as string;
  }

  if (WC2026_KNOCKOUT_FIXTURES.length !== WC2026_R32_MATCH_DEFS.length) {
    return {
      ok: false,
      error: `Expected ${WC2026_R32_MATCH_DEFS.length} knockout fixtures in JSON; got ${WC2026_KNOCKOUT_FIXTURES.length}.`,
    };
  }

  const fixtureByNo = new Map(
    WC2026_KNOCKOUT_FIXTURES.map((fx) => [fx.fifa_match_no, fx]),
  );

  const matchRows: Record<string, unknown>[] = [];
  for (let i = 0; i < WC2026_R32_MATCH_DEFS.length; i += 1) {
    const def = WC2026_R32_MATCH_DEFS[i]!;
    const fx = fixtureByNo.get(def.fifaMatchNo);
    if (!fx) {
      return {
        ok: false,
        error: `Missing knockout fixture JSON for FIFA match M${def.fifaMatchNo}.`,
      };
    }
    const kickoffErr = validateKickoffAtUtc(
      fx.kickoff_at,
      `M${def.fifaMatchNo} ${fx.stadium}`,
    );
    if (kickoffErr) return { ok: false, error: kickoffErr };

    matchRows.push({
      edition_id: editionId,
      match_code: wc2026R32MatchCode(def.fifaMatchNo),
      stage_code: "round_of_32",
      group_code: null,
      round_index: i,
      kickoff_at: fx.kickoff_at,
      home_team_id: null,
      away_team_id: null,
      status: "scheduled",
    });
  }

  const matchCodes = matchRows.map((r) => r.match_code as string);
  const { data: existingRows, error: existingErr } = await supabase
    .from("tournament_matches")
    .select("match_code, kickoff_at, round_index, stage_code")
    .eq("edition_id", editionId)
    .in("match_code", matchCodes);
  if (existingErr) return { ok: false, error: existingErr.message };

  const existingByCode = new Map(
    (existingRows ?? []).map((row) => [row.match_code as string, row]),
  );

  let shellRowsCreated = 0;
  let shellRowsUpdated = 0;

  const rowsToInsert: Record<string, unknown>[] = [];
  const rowsToPatch: Array<{ matchCode: string; updates: Record<string, unknown> }> = [];

  for (const row of matchRows) {
    const code = row.match_code as string;
    const existing = existingByCode.get(code);
    if (!existing) {
      rowsToInsert.push(row);
      shellRowsCreated += 1;
      continue;
    }

    const updates: Record<string, unknown> = {};
    if ((existing.kickoff_at as string | null) !== (row.kickoff_at as string)) {
      updates.kickoff_at = row.kickoff_at;
    }
    if ((existing.round_index as number) !== (row.round_index as number)) {
      updates.round_index = row.round_index;
    }
    if ((existing.stage_code as string) !== (row.stage_code as string)) {
      updates.stage_code = row.stage_code;
    }
    if (Object.keys(updates).length > 0) {
      rowsToPatch.push({ matchCode: code, updates });
      shellRowsUpdated += 1;
    }
  }

  if (rowsToInsert.length > 0) {
    const { error: insErr } = await supabase.from("tournament_matches").insert(rowsToInsert);
    if (insErr) return { ok: false, error: insErr.message };
  }

  for (const { matchCode, updates } of rowsToPatch) {
    const { error: patchErr } = await supabase
      .from("tournament_matches")
      .update(updates)
      .eq("edition_id", editionId)
      .eq("match_code", matchCode);
    if (patchErr) return { ok: false, error: patchErr.message };
  }

  return {
    ok: true,
    summary: {
      shellRowsCreated,
      shellRowsUpdated,
      r32RowCount: matchRows.length,
    },
  };
}
