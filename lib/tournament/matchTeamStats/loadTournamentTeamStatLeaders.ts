import type { SupabaseClient } from "@supabase/supabase-js";
import { OFFICIAL_EDITION_CODE } from "@/lib/config/officialTournament";
import { fetchEditionByCode } from "@/lib/tournament/editionScope";
import {
  buildTournamentBonusStandings,
  type TournamentBonusStandings,
} from "./buildTournamentBonusStandings";
import {
  buildTournamentStatLeadersView,
  type TeamDisplayInfo,
  type TournamentStatCategoryKey,
  type TournamentStatLeadersView,
} from "./buildTournamentStatLeadersView";
import {
  loadMatchesForTeamStatsAdmin,
  loadMatchTeamStatsForAggregation,
} from "./loadMatchTeamStatsAdminData";

export type LoadTournamentTeamStatLeadersResult =
  | {
      ok: true;
      view: TournamentStatLeadersView;
      /** Same deriveTeamStatTotals source as Bonus Watch — load once, reuse everywhere. */
      standings: TournamentBonusStandings;
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

async function countBonusPicksForTeam(
  supabase: SupabaseClient,
  poolId: string,
  bonusKey: TournamentStatCategoryKey,
  teamId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("predictions")
    .select("id", { count: "exact", head: true })
    .eq("pool_id", poolId)
    .eq("prediction_kind", "bonus_pick")
    .eq("bonus_key", bonusKey)
    .eq("team_id", teamId);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function loadPoolBonusPickCounts(
  supabase: SupabaseClient,
  poolId: string,
  view: TournamentStatLeadersView,
): Promise<Partial<Record<TournamentStatCategoryKey, number | null>>> {
  const { data: rules, error } = await supabase
    .from("scoring_rules")
    .select("bonus_key")
    .eq("pool_id", poolId)
    .eq("prediction_kind", "bonus_pick");

  if (error) throw new Error(error.message);

  const poolBonusKeys = new Set(
    (rules ?? [])
      .map((r) => (r.bonus_key as string | null)?.trim())
      .filter(Boolean),
  );

  const categories: TournamentStatCategoryKey[] = [
    "most_goals",
    "most_yellow_cards",
    "most_red_cards",
  ];

  const out: Partial<Record<TournamentStatCategoryKey, number | null>> = {};

  for (const key of categories) {
    if (!poolBonusKeys.has(key)) {
      out[key] = null;
      continue;
    }
    const category =
      key === "most_goals"
        ? view.goals
        : key === "most_yellow_cards"
          ? view.yellowCards
          : view.redCards;
    if (category.leaders.length !== 1) {
      out[key] = null;
      continue;
    }
    out[key] = await countBonusPicksForTeam(
      supabase,
      poolId,
      key,
      category.leaders[0]!.teamId,
    );
  }

  return out;
}

/**
 * Live official `fifa_wc_2026` stat leaders only — simulation editions are excluded.
 */
export async function loadTournamentTeamStatLeaders(
  supabase: SupabaseClient,
  options?: { poolId?: string | null },
): Promise<LoadTournamentTeamStatLeadersResult> {
  const edition = await fetchEditionByCode(supabase, OFFICIAL_EDITION_CODE);
  if (!edition) {
    return { ok: false, error: "Official tournament edition is not installed." };
  }
  if (edition.isSimulation) {
    return {
      ok: false,
      error: "Official edition is marked as simulation — stat leaders are unavailable.",
    };
  }

  const editionId = edition.id;
  const [matchRes, statRes, teamInfoRes] = await Promise.all([
    loadMatchesForTeamStatsAdmin(supabase, editionId),
    loadMatchTeamStatsForAggregation(supabase, editionId),
    loadTeamDisplayInfo(supabase, editionId),
  ]);

  if ("error" in matchRes) return { ok: false, error: matchRes.error };
  if ("error" in statRes) return { ok: false, error: statRes.error };
  if ("error" in teamInfoRes) return { ok: false, error: teamInfoRes.error };

  let view = buildTournamentStatLeadersView({
    matches: matchRes.matches,
    teamStats: statRes.teamStats,
    teamInfoById: teamInfoRes,
  });
  const standings = buildTournamentBonusStandings({
    matches: matchRes.matches,
    teamStats: statRes.teamStats,
    teamInfoById: teamInfoRes,
  });

  const poolId = options?.poolId?.trim();
  if (poolId) {
    try {
      const pickCounts = await loadPoolBonusPickCounts(supabase, poolId, view);
      view = buildTournamentStatLeadersView({
        matches: matchRes.matches,
        teamStats: statRes.teamStats,
        teamInfoById: teamInfoRes,
        pickCountsByBonusKey: pickCounts,
      });
    } catch (e) {
      console.error("[loadTournamentTeamStatLeaders] bonus pick counts failed", e);
    }
  }

  return { ok: true, view, standings };
}
