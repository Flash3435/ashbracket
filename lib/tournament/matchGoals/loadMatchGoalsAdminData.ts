import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchGoalRecord } from "./types";

type GoalRow = {
  id: string;
  edition_id: string;
  match_id: string;
  team_id: string | null;
  player_name: string;
  minute: number | null;
  stoppage_minute: number | null;
  is_own_goal: boolean;
};

function mapGoalRow(row: GoalRow): MatchGoalRecord {
  return {
    id: row.id,
    editionId: row.edition_id,
    matchId: row.match_id,
    teamId: row.team_id,
    playerName: row.player_name,
    minute: row.minute,
    stoppageMinute: row.stoppage_minute,
    isOwnGoal: row.is_own_goal,
  };
}

export async function loadMatchGoalsForEdition(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{ goals: MatchGoalRecord[] } | { error: string }> {
  const { data, error } = await supabase
    .from("tournament_match_goals")
    .select(
      "id, edition_id, match_id, team_id, player_name, minute, stoppage_minute, is_own_goal",
    )
    .eq("edition_id", editionId)
    .order("minute", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) return { error: error.message };
  return { goals: ((data ?? []) as GoalRow[]).map(mapGoalRow) };
}

export type MatchGoalsAdminMatch = {
  id: string;
  matchCode: string;
  kickoffAt: string | null;
  status: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeGoals: number | null;
  awayGoals: number | null;
  syncLocked: boolean;
};

export async function loadMatchesForGoalsAdmin(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{ matches: MatchGoalsAdminMatch[] } | { error: string }> {
  const { data: rawMatches, error } = await supabase
    .from("tournament_matches")
    .select(
      "id, match_code, kickoff_at, status, home_team_id, away_team_id, home_goals, away_goals, sync_locked",
    )
    .eq("edition_id", editionId)
    .order("kickoff_at", { ascending: true });

  if (error) return { error: error.message };

  const matches = rawMatches ?? [];
  const teamIds = [
    ...new Set(
      matches.flatMap((m) =>
        [m.home_team_id, m.away_team_id].filter(Boolean),
      ) as string[],
    ),
  ];

  const teamNameById = new Map<string, string>();
  if (teamIds.length > 0) {
    const { data: teams, error: teamErr } = await supabase
      .from("teams")
      .select("id, name")
      .in("id", teamIds);
    if (teamErr) return { error: teamErr.message };
    for (const t of teams ?? []) {
      teamNameById.set(t.id as string, t.name as string);
    }
  }

  return {
    matches: matches.map((row) => ({
      id: row.id as string,
      matchCode: row.match_code as string,
      kickoffAt: row.kickoff_at as string | null,
      status: row.status as string,
      homeTeamId: row.home_team_id as string | null,
      awayTeamId: row.away_team_id as string | null,
      homeTeamName: row.home_team_id
        ? (teamNameById.get(row.home_team_id as string) ?? "TBD")
        : "TBD",
      awayTeamName: row.away_team_id
        ? (teamNameById.get(row.away_team_id as string) ?? "TBD")
        : "TBD",
      homeGoals: row.home_goals as number | null,
      awayGoals: row.away_goals as number | null,
      syncLocked: Boolean(row.sync_locked),
    })),
  };
}
