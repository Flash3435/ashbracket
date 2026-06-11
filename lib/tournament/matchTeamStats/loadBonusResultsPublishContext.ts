import type { SupabaseClient } from "@supabase/supabase-js";
import { OFFICIAL_EDITION_CODE } from "@/lib/config/officialTournament";
import { fetchEditionByCode } from "@/lib/tournament/editionScope";
import {
  buildBonusResultsFromTeamStatsPreview,
  existingBonusResultsMap,
  type BonusResultsFromTeamStatsPreview,
  STAT_DERIVED_BONUS_KEYS,
} from "./bonusResultsFromTeamStats";
import {
  buildTournamentStatLeadersView,
  type TeamDisplayInfo,
} from "./buildTournamentStatLeadersView";
import {
  loadMatchesForTeamStatsAdmin,
  loadMatchTeamStatsForEdition,
} from "./loadMatchTeamStatsAdminData";

export type BonusResultsPublishContext =
  | {
      ok: true;
      editionId: string;
      groupStageId: string;
      preview: BonusResultsFromTeamStatsPreview;
    }
  | { ok: false; error: string };

async function loadTeamDisplayInfo(
  supabase: SupabaseClient,
  editionId: string,
): Promise<Map<string, TeamDisplayInfo> | { error: string }> {
  const { data: matches, error: mErr } = await supabase
    .from("tournament_matches")
    .select("home_team_id, away_team_id")
    .eq("edition_id", editionId);

  if (mErr) return { error: mErr.message };

  const teamIds = new Set<string>();
  for (const row of matches ?? []) {
    if (row.home_team_id) teamIds.add(row.home_team_id as string);
    if (row.away_team_id) teamIds.add(row.away_team_id as string);
  }

  if (teamIds.size === 0) return new Map();

  const { data: teams, error: tErr } = await supabase
    .from("teams")
    .select("id, name, country_code")
    .in("id", [...teamIds]);

  if (tErr) return { error: tErr.message };

  const out = new Map<string, TeamDisplayInfo>();
  for (const team of teams ?? []) {
    out.set(team.id as string, {
      name: String(team.name ?? "").trim() || "Unknown team",
      countryCode: String(team.country_code ?? "").trim(),
    });
  }
  return out;
}

async function loadGroupStageId(
  supabase: SupabaseClient,
): Promise<string | { error: string }> {
  const { data, error } = await supabase
    .from("tournament_stages")
    .select("id")
    .eq("code", "group")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data?.id) {
    return { error: "Missing tournament_stages row for code \"group\"." };
  }
  return data.id as string;
}

async function loadEnabledStatBonusKeys(
  supabase: SupabaseClient,
  editionId: string,
): Promise<Set<string> | { error: string }> {
  const { data: pools, error: pErr } = await supabase
    .from("pools")
    .select("id")
    .eq("tournament_edition_id", editionId);

  if (pErr) return { error: pErr.message };

  const poolIds = (pools ?? []).map((p) => p.id as string);
  if (poolIds.length === 0) return new Set();

  const { data: rules, error: rErr } = await supabase
    .from("scoring_rules")
    .select("bonus_key")
    .in("pool_id", poolIds)
    .eq("prediction_kind", "bonus_pick")
    .in("bonus_key", [...STAT_DERIVED_BONUS_KEYS]);

  if (rErr) return { error: rErr.message };

  const keys = new Set<string>();
  for (const row of rules ?? []) {
    const key = (row.bonus_key as string | null)?.trim();
    if (key) keys.add(key);
  }
  return keys;
}

async function loadExistingBonusResults(
  supabase: SupabaseClient,
  editionId: string,
): Promise<
  Array<{
    team_id: string;
    slot_key: string | null;
    source?: string | null;
    locked?: boolean | null;
  }> | { error: string }
> {
  const { data, error } = await supabase
    .from("results")
    .select("team_id, slot_key, source, locked")
    .eq("edition_id", editionId)
    .eq("kind", "bonus_pick")
    .in("slot_key", [...STAT_DERIVED_BONUS_KEYS]);

  if (error) return { error: error.message };
  return data ?? [];
}

/**
 * Loads live official edition stat leaders and builds a bonus-result publish preview.
 */
export async function loadBonusResultsPublishContext(
  supabase: SupabaseClient,
): Promise<BonusResultsPublishContext> {
  const edition = await fetchEditionByCode(supabase, OFFICIAL_EDITION_CODE);
  if (!edition) {
    return { ok: false, error: "Official tournament edition is not installed." };
  }
  if (edition.isSimulation) {
    return {
      ok: false,
      error: "Official edition is marked as simulation — bonus publish is unavailable.",
    };
  }

  const editionId = edition.id;

  const [matchRes, statRes, teamInfoRes, groupStageRes, enabledKeysRes, existingRes] =
    await Promise.all([
      loadMatchesForTeamStatsAdmin(supabase, editionId),
      loadMatchTeamStatsForEdition(supabase, editionId),
      loadTeamDisplayInfo(supabase, editionId),
      loadGroupStageId(supabase),
      loadEnabledStatBonusKeys(supabase, editionId),
      loadExistingBonusResults(supabase, editionId),
    ]);

  if ("error" in matchRes) return { ok: false, error: matchRes.error };
  if ("error" in statRes) return { ok: false, error: statRes.error };
  if ("error" in teamInfoRes) return { ok: false, error: teamInfoRes.error };
  if (typeof groupStageRes === "object" && "error" in groupStageRes) {
    return { ok: false, error: groupStageRes.error };
  }
  if ("error" in enabledKeysRes) return { ok: false, error: enabledKeysRes.error };
  if ("error" in existingRes) return { ok: false, error: existingRes.error };

  const leadersView = buildTournamentStatLeadersView({
    matches: matchRes.matches,
    teamStats: statRes.teamStats,
    teamInfoById: teamInfoRes,
  });

  const existingByBonusKey = existingBonusResultsMap(existingRes, teamInfoRes);

  const preview = buildBonusResultsFromTeamStatsPreview({
    leadersView,
    existingByBonusKey,
    enabledBonusKeys: enabledKeysRes,
    teamInfoById: teamInfoRes,
  });

  return {
    ok: true,
    editionId,
    groupStageId: groupStageRes,
    preview,
  };
}
