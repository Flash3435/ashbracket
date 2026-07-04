import type { SupabaseClient } from "@supabase/supabase-js";
import {
  WC2026_LATER_KNOCKOUT_MATCH_DEFS,
  wc2026FifaMatchCode,
  wc2026LaterKnockoutAdvanceFrom,
  type Wc2026LaterKnockoutMatchDef,
} from "../bracket/wc2026LaterKnockout";
import { OFFICIAL_EDITION_CODE } from "../config/officialTournament";
import { propagateBracketAdvance, recomputeWinners } from "./syncOfficialTournament";
import { seedOfficialWc2026KnockoutFixtures } from "./seedOfficialWc2026KnockoutFixtures";
import { validateKickoffAtUtc } from "./validateWc2026KickoffAt";
import laterKnockoutFixtures from "./wc2026LaterKnockoutFixtures.json";

export type Wc2026LaterKnockoutFixtureRow = {
  fifa_match_no: number;
  kickoff_at: string;
  stadium: string;
  city: string;
};

export const WC2026_LATER_KNOCKOUT_FIXTURES =
  laterKnockoutFixtures as Wc2026LaterKnockoutFixtureRow[];

export type SeedOfficialWc2026LaterKnockoutFixturesSummary = {
  shellRowsCreated: number;
  shellRowsUpdated: number;
  laterKnockoutRowCount: number;
  advanceLinksPatched: number;
  teamsPropagated: number;
};

type DbMatchRow = {
  id: string;
  match_code: string;
  group_code: string | null;
  kickoff_at: string | null;
  round_index: number;
  stage_code: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_goals: number | null;
  away_goals: number | null;
  home_penalties: number | null;
  away_penalties: number | null;
  winner_team_id: string | null;
  status: string;
  home_advance_from_match_id: string | null;
  away_advance_from_match_id: string | null;
  scoring_result_kind: string | null;
  scoring_slot_key: string | null;
  scoring_stage_code: string | null;
  sync_locked: boolean;
};

function buildShellInsertRow(
  editionId: string,
  def: Wc2026LaterKnockoutMatchDef,
  kickoffAt: string,
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    edition_id: editionId,
    match_code: wc2026FifaMatchCode(def.fifaMatchNo),
    stage_code: def.stageCode,
    group_code: null,
    round_index: def.roundIndex,
    kickoff_at: kickoffAt,
    home_team_id: null,
    away_team_id: null,
    status: "scheduled",
  };
  if (def.scoringResultKind) {
    row.scoring_result_kind = def.scoringResultKind;
    row.scoring_slot_key = def.scoringSlotKey;
    row.scoring_stage_code = def.scoringStageCode;
  }
  return row;
}

/**
 * Idempotent upsert of official knockout shell rows M89–M104 for WC 2026.
 * Requires M73–M88 shells from {@link seedOfficialWc2026KnockoutFixtures}.
 */
export async function seedOfficialWc2026LaterKnockoutFixtures(
  supabase: SupabaseClient,
  options?: { editionId?: string; editionCode?: string },
): Promise<
  | { ok: true; summary: SeedOfficialWc2026LaterKnockoutFixturesSummary }
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

  const r32Seed = await seedOfficialWc2026KnockoutFixtures(supabase, { editionId });
  if (!r32Seed.ok) return r32Seed;

  if (WC2026_LATER_KNOCKOUT_FIXTURES.length !== WC2026_LATER_KNOCKOUT_MATCH_DEFS.length) {
    return {
      ok: false,
      error: `Expected ${WC2026_LATER_KNOCKOUT_MATCH_DEFS.length} later knockout fixtures in JSON; got ${WC2026_LATER_KNOCKOUT_FIXTURES.length}.`,
    };
  }

  const fixtureByNo = new Map(
    WC2026_LATER_KNOCKOUT_FIXTURES.map((fx) => [fx.fifa_match_no, fx]),
  );

  const matchRows: Record<string, unknown>[] = [];
  for (const def of WC2026_LATER_KNOCKOUT_MATCH_DEFS) {
    const fx = fixtureByNo.get(def.fifaMatchNo);
    if (!fx) {
      return {
        ok: false,
        error: `Missing later knockout fixture JSON for FIFA match M${def.fifaMatchNo}.`,
      };
    }
    const kickoffErr = validateKickoffAtUtc(
      fx.kickoff_at,
      `M${def.fifaMatchNo} ${fx.stadium}`,
    );
    if (kickoffErr) return { ok: false, error: kickoffErr };

    matchRows.push(buildShellInsertRow(editionId, def, fx.kickoff_at));
  }

  const matchCodes = matchRows.map((r) => r.match_code as string);
  const { data: existingRows, error: existingErr } = await supabase
    .from("tournament_matches")
    .select(
      "match_code, kickoff_at, round_index, stage_code, scoring_result_kind, scoring_slot_key, scoring_stage_code",
    )
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
    if (
      row.scoring_result_kind &&
      (existing.scoring_result_kind as string | null) !== row.scoring_result_kind
    ) {
      updates.scoring_result_kind = row.scoring_result_kind;
      updates.scoring_slot_key = row.scoring_slot_key;
      updates.scoring_stage_code = row.scoring_stage_code;
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

  const feederCodes = [
    ...new Set(
      WC2026_LATER_KNOCKOUT_MATCH_DEFS.flatMap((def) => {
        const adv = wc2026LaterKnockoutAdvanceFrom(def);
        return [adv.homeFifaMatchNo, adv.awayFifaMatchNo].filter(
          (n): n is number => n != null,
        ).map(wc2026FifaMatchCode);
      }),
    ),
  ];
  const allCodes = [...new Set([...matchCodes, ...feederCodes])];

  const { data: bracketRows, error: bracketErr } = await supabase
    .from("tournament_matches")
    .select(
      "id, match_code, group_code, kickoff_at, round_index, stage_code, home_team_id, away_team_id, home_goals, away_goals, home_penalties, away_penalties, winner_team_id, status, home_advance_from_match_id, away_advance_from_match_id, scoring_result_kind, scoring_slot_key, scoring_stage_code, sync_locked",
    )
    .eq("edition_id", editionId)
    .in("match_code", allCodes);
  if (bracketErr) return { ok: false, error: bracketErr.message };

  const idByCode = new Map(
    (bracketRows ?? []).map((row) => [row.match_code as string, row.id as string]),
  );

  let advanceLinksPatched = 0;
  for (const def of WC2026_LATER_KNOCKOUT_MATCH_DEFS) {
    const matchCode = wc2026FifaMatchCode(def.fifaMatchNo);
    const rowId = idByCode.get(matchCode);
    if (!rowId) continue;

    const adv = wc2026LaterKnockoutAdvanceFrom(def);
    const homeAdvanceId = adv.homeFifaMatchNo
      ? idByCode.get(wc2026FifaMatchCode(adv.homeFifaMatchNo)) ?? null
      : null;
    const awayAdvanceId = adv.awayFifaMatchNo
      ? idByCode.get(wc2026FifaMatchCode(adv.awayFifaMatchNo)) ?? null
      : null;

    const existing = (bracketRows ?? []).find((r) => r.match_code === matchCode) as
      | DbMatchRow
      | undefined;
    if (!existing || existing.sync_locked) continue;

    const needsHome = homeAdvanceId && existing.home_advance_from_match_id !== homeAdvanceId;
    const needsAway = awayAdvanceId && existing.away_advance_from_match_id !== awayAdvanceId;
    if (!needsHome && !needsAway) continue;

    const updates: Record<string, unknown> = {};
    if (needsHome) updates.home_advance_from_match_id = homeAdvanceId;
    if (needsAway) updates.away_advance_from_match_id = awayAdvanceId;

    const { error: advErr } = await supabase
      .from("tournament_matches")
      .update(updates)
      .eq("id", rowId);
    if (advErr) return { ok: false, error: advErr.message };
    advanceLinksPatched += 1;

    if (needsHome) existing.home_advance_from_match_id = homeAdvanceId;
    if (needsAway) existing.away_advance_from_match_id = awayAdvanceId;
  }

  const dbMatches = (bracketRows ?? []).map((row) => ({
    ...row,
    group_code: (row.group_code as string | null) ?? null,
  })) as DbMatchRow[];
  const teamsBefore = new Map(
    dbMatches.map((m) => [
      m.match_code,
      `${m.home_team_id ?? ""}|${m.away_team_id ?? ""}`,
    ]),
  );

  recomputeWinners(dbMatches);
  propagateBracketAdvance(dbMatches);

  let teamsPropagated = 0;
  for (const m of dbMatches) {
    if (m.sync_locked) continue;
    const before = teamsBefore.get(m.match_code);
    const after = `${m.home_team_id ?? ""}|${m.away_team_id ?? ""}`;
    if (before === after) continue;

    const { error: teamErr } = await supabase
      .from("tournament_matches")
      .update({
        home_team_id: m.home_team_id,
        away_team_id: m.away_team_id,
      })
      .eq("id", m.id);
    if (teamErr) return { ok: false, error: teamErr.message };
    teamsPropagated += 1;
  }

  return {
    ok: true,
    summary: {
      shellRowsCreated,
      shellRowsUpdated,
      laterKnockoutRowCount: WC2026_LATER_KNOCKOUT_MATCH_DEFS.length,
      advanceLinksPatched,
      teamsPropagated,
    },
  };
}

/** Ensures M89–M104 exist before live-score sync or preview. */
export async function ensureOfficialWc2026LaterKnockoutFixtures(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const out = await seedOfficialWc2026LaterKnockoutFixtures(supabase, { editionId });
  if (!out.ok) return out;
  return { ok: true };
}
