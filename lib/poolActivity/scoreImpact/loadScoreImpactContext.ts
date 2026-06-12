import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveTeamStatTotals, topTeamStatLeaders } from "@/lib/tournament/matchTeamStats/deriveTeamStatTotals";
import type { MatchForTeamStatAggregation } from "@/lib/tournament/matchTeamStats/types";
import type { BonusLeaderSnapshot } from "./types";

type EditionTeamStatRow = {
  team_id: string;
  yellow_cards: number | null;
  red_cards: number | null;
};

export async function loadTeamNameMapForEdition(
  supabase: SupabaseClient,
  editionId: string,
): Promise<Map<string, string>> {
  const { data: matches, error: mErr } = await supabase
    .from("tournament_matches")
    .select("home_team_id, away_team_id")
    .eq("edition_id", editionId);

  if (mErr) throw new Error(mErr.message);

  const teamIds = new Set<string>();
  for (const row of matches ?? []) {
    if (row.home_team_id) teamIds.add(row.home_team_id as string);
    if (row.away_team_id) teamIds.add(row.away_team_id as string);
  }

  if (teamIds.size === 0) return new Map();

  const { data: teams, error: tErr } = await supabase
    .from("teams")
    .select("id, name")
    .in("id", [...teamIds]);

  if (tErr) throw new Error(tErr.message);

  const out = new Map<string, string>();
  for (const team of teams ?? []) {
    out.set(team.id as string, String(team.name ?? "").trim() || "Team");
  }
  return out;
}

export async function captureEditionBonusLeaders(
  supabase: SupabaseClient,
  editionId: string,
): Promise<BonusLeaderSnapshot> {
  const [{ data: matches, error: mErr }, { data: stats, error: sErr }] =
    await Promise.all([
      supabase
        .from("tournament_matches")
        .select("id, home_team_id, away_team_id, home_goals, away_goals")
        .eq("edition_id", editionId),
      supabase
        .from("tournament_match_team_stats")
        .select("match_id, team_id, yellow_cards, red_cards, source")
        .eq("edition_id", editionId),
    ]);

  if (mErr) throw new Error(mErr.message);
  if (sErr) throw new Error(sErr.message);

  const totals = deriveTeamStatTotals({
    matches: (matches ?? []).map(
      (row, index): MatchForTeamStatAggregation => ({
        id: String(row.id ?? index),
        homeTeamId: row.home_team_id as string | null,
        awayTeamId: row.away_team_id as string | null,
        homeGoals: row.home_goals as number | null,
        awayGoals: row.away_goals as number | null,
      }),
    ),
    teamStats: (stats ?? []).map((row) => ({
      id: "",
      editionId,
      matchId: String(row.match_id ?? ""),
      teamId: row.team_id as string,
      yellowCards: row.yellow_cards as number | null,
      redCards: row.red_cards as number | null,
      source: String(row.source ?? "manual"),
    })),
  });

  return {
    mostGoalsTeamId: topTeamStatLeaders(totals.goalsByTeamId, 1)[0]?.teamId ?? null,
    mostYellowCardsTeamId:
      topTeamStatLeaders(totals.yellowCardsByTeamId, 1)[0]?.teamId ?? null,
    mostRedCardsTeamId:
      topTeamStatLeaders(totals.redCardsByTeamId, 1)[0]?.teamId ?? null,
  };
}

export async function countGroupAdvancePicksForTeam(
  supabase: SupabaseClient,
  poolId: string,
  groupCode: string,
  teamId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("predictions")
    .select("id", { count: "exact", head: true })
    .eq("pool_id", poolId)
    .eq("group_code", groupCode)
    .eq("team_id", teamId)
    .in("prediction_kind", ["group_winner", "group_runner_up"]);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function loadParticipantNamesById(
  supabase: SupabaseClient,
  poolId: string,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("participants")
    .select("id, display_name")
    .eq("pool_id", poolId);

  if (error) throw new Error(error.message);

  const out = new Map<string, string>();
  for (const row of data ?? []) {
    out.set(
      row.id as string,
      String(row.display_name ?? "").trim() || "Participant",
    );
  }
  return out;
}
