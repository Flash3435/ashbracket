import type { SupabaseClient } from "@supabase/supabase-js";
import type { Result, Team } from "../../src/types/domain";
import { mapResultRow } from "../../src/lib/scoring/mapSupabaseRows";
import { fetchGroupTeamCountryCodesForEdition } from "../tournament/fetchGroupTeamCountryCodesForEdition";
import {
  buildDerivedThirdPlaceQualifierResultRows,
  resolveOfficialThirdPlaceAdvancers,
  r32FixturesFromTournamentMatches,
  type GroupStageMatchForThirdPlace,
  type OfficialThirdPlaceResolution,
} from "./resolveOfficialThirdPlaceAdvancers";

export type EnsureThirdPlaceQualifierOutcome = {
  resolution: OfficialThirdPlaceResolution;
  /** Rows written when explicit results were missing but advancers were derivable. */
  upsertedCount: number;
};

function explicitThirdPlaceCount(results: Result[], roundOf32StageId: string): number {
  const seen = new Set<string>();
  for (const r of results) {
    if (
      r.tournamentStageId !== roundOf32StageId ||
      r.kind !== "third_place_qualifier" ||
      !r.teamId?.trim()
    ) {
      continue;
    }
    seen.add(r.teamId.trim());
  }
  return seen.size;
}

/**
 * Ensures `third_place_qualifier` result rows exist when advancers can be derived
 * from R32 fixtures or completed group standings. Idempotent — skips when eight
 * explicit rows already exist.
 */
export async function ensureThirdPlaceQualifierResults(
  supabase: SupabaseClient,
  editionId: string,
): Promise<EnsureThirdPlaceQualifierOutcome> {
  const [stageRes, resultRes, matchRes, teamRes, groupTeamCountryCodesByLetter] =
    await Promise.all([
      supabase.from("tournament_stages").select("id, code"),
      supabase
        .from("results")
        .select(
          "id, tournament_stage_id, kind, team_id, group_code, slot_key, value_text, resolved_at, created_at, edition_id",
        )
        .eq("edition_id", editionId),
      supabase
        .from("tournament_matches")
        .select("match_code, home_team_id, away_team_id, stage_code, group_code, home_goals, away_goals")
        .eq("edition_id", editionId),
      supabase.from("teams").select("id, country_code, name"),
      fetchGroupTeamCountryCodesForEdition(supabase, editionId),
    ]);

  if (stageRes.error) throw new Error(stageRes.error.message);
  if (resultRes.error) throw new Error(resultRes.error.message);
  if (matchRes.error) throw new Error(matchRes.error.message);
  if (teamRes.error) throw new Error(teamRes.error.message);

  const stageByCode = new Map(
    (stageRes.data ?? []).map((s) => [s.code as string, s.id as string]),
  );
  const roundOf32StageId = stageByCode.get("round_of_32");
  if (!roundOf32StageId) {
    return {
      resolution: { settled: false, advancers: [], source: "none" },
      upsertedCount: 0,
    };
  }

  const results = (resultRes.data ?? []).map(mapResultRow);
  if (explicitThirdPlaceCount(results, roundOf32StageId) === 8) {
    return {
      resolution: resolveOfficialThirdPlaceAdvancers({
        results,
        roundOf32StageId,
      }),
      upsertedCount: 0,
    };
  }

  const r32Fixtures = r32FixturesFromTournamentMatches(matchRes.data ?? []);
  const groupMatches: GroupStageMatchForThirdPlace[] = [];
  for (const m of matchRes.data ?? []) {
    if (m.stage_code !== "group" || !m.group_code) continue;
    if (
      !m.home_team_id ||
      !m.away_team_id ||
      m.home_goals == null ||
      m.away_goals == null
    ) {
      continue;
    }
    groupMatches.push({
      groupCode: m.group_code as string,
      homeTeamId: m.home_team_id as string,
      awayTeamId: m.away_team_id as string,
      homeGoals: m.home_goals as number,
      awayGoals: m.away_goals as number,
    });
  }

  const teams = (teamRes.data ?? []).map(
    (t) =>
      ({
        id: t.id as string,
        countryCode: t.country_code as string,
        name: t.name as string,
      }) satisfies Team,
  );

  const resolution = resolveOfficialThirdPlaceAdvancers({
    results,
    roundOf32StageId,
    r32Fixtures,
    groupMatches,
    teams,
    groupTeamCountryCodesByLetter,
  });

  if (!resolution.settled || resolution.advancers.length !== 8) {
    return { resolution, upsertedCount: 0 };
  }

  const resolvedAt = new Date().toISOString();
  const rows = buildDerivedThirdPlaceQualifierResultRows({
    editionId,
    roundOf32StageId,
    advancers: resolution.advancers,
    resolvedAtIso: resolvedAt,
    source: "sync",
  });

  const { error } = await supabase.from("results").upsert(rows, {
    onConflict: "edition_id,tournament_stage_id,kind,group_code,slot_key",
  });
  if (error) throw new Error(error.message);

  return { resolution, upsertedCount: rows.length };
}

/** Loads whether third-place qualifiers are settled for an edition (no DB writes). */
export async function loadThirdPlaceQualifierSettlement(
  supabase: SupabaseClient,
  editionId: string,
): Promise<OfficialThirdPlaceResolution> {
  const [stageRes, resultRes, matchRes, teamRes, groupTeamCountryCodesByLetter] =
    await Promise.all([
      supabase.from("tournament_stages").select("id, code"),
      supabase
        .from("results")
        .select(
          "id, tournament_stage_id, kind, team_id, group_code, slot_key, value_text, resolved_at, created_at, edition_id",
        )
        .eq("edition_id", editionId),
      supabase
        .from("tournament_matches")
        .select("match_code, home_team_id, away_team_id, stage_code, group_code, home_goals, away_goals")
        .eq("edition_id", editionId),
      supabase.from("teams").select("id, country_code, name"),
      fetchGroupTeamCountryCodesForEdition(supabase, editionId),
    ]);

  if (stageRes.error) throw new Error(stageRes.error.message);
  if (resultRes.error) throw new Error(resultRes.error.message);
  if (matchRes.error) throw new Error(matchRes.error.message);
  if (teamRes.error) throw new Error(teamRes.error.message);

  const roundOf32StageId = (stageRes.data ?? []).find((s) => s.code === "round_of_32")
    ?.id as string | undefined;
  if (!roundOf32StageId) {
    return { settled: false, advancers: [], source: "none" };
  }

  const results = (resultRes.data ?? []).map(mapResultRow);
  const groupMatches: GroupStageMatchForThirdPlace[] = [];
  for (const m of matchRes.data ?? []) {
    if (m.stage_code !== "group" || !m.group_code) continue;
    if (
      !m.home_team_id ||
      !m.away_team_id ||
      m.home_goals == null ||
      m.away_goals == null
    ) {
      continue;
    }
    groupMatches.push({
      groupCode: m.group_code as string,
      homeTeamId: m.home_team_id as string,
      awayTeamId: m.away_team_id as string,
      homeGoals: m.home_goals as number,
      awayGoals: m.away_goals as number,
    });
  }

  const teams = (teamRes.data ?? []).map(
    (t) =>
      ({
        id: t.id as string,
        countryCode: t.country_code as string,
        name: t.name as string,
      }) satisfies Team,
  );

  return resolveOfficialThirdPlaceAdvancers({
    results,
    roundOf32StageId,
    r32Fixtures: r32FixturesFromTournamentMatches(matchRes.data ?? []),
    groupMatches,
    teams,
    groupTeamCountryCodesByLetter,
  });
}
