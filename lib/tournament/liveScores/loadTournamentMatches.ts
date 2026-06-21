import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeNullableText } from "./normalizeTeamName";
import type { TournamentMatchForLiveScores } from "./types";

type MatchRow = {
  id: string;
  match_code: string;
  kickoff_at: string;
  provider_fixture_id: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_goals: number | null;
  away_goals: number | null;
  home_penalties: number | null;
  away_penalties: number | null;
  status: string;
  sync_locked: boolean;
};

type TeamRow = {
  id: string;
  name: string;
  fifa_code: string | null;
  country_code: string | null;
};

export async function loadTournamentMatchesForLiveScores(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{ matches: TournamentMatchForLiveScores[] } | { error: string }> {
  const { data: rawMatches, error } = await supabase
    .from("tournament_matches")
    .select(
      "id, match_code, kickoff_at, provider_fixture_id, home_team_id, away_team_id, home_goals, away_goals, home_penalties, away_penalties, status, sync_locked",
    )
    .eq("edition_id", editionId)
    .order("kickoff_at", { ascending: true });

  if (error) return { error: error.message };

  const matches = (rawMatches ?? []) as MatchRow[];
  const teamIds = [
    ...new Set(
      matches.flatMap((m) => [m.home_team_id, m.away_team_id].filter(Boolean) as string[]),
    ),
  ];

  const teamById = new Map<string, TeamRow>();
  if (teamIds.length > 0) {
    const { data: teams, error: teamErr } = await supabase
      .from("teams")
      .select("id, name, fifa_code, country_code")
      .in("id", teamIds);
    if (teamErr) return { error: teamErr.message };
    for (const t of (teams ?? []) as TeamRow[]) {
      teamById.set(t.id, t);
    }
  }

  return {
    matches: matches.map((row) => {
      const home = row.home_team_id ? teamById.get(row.home_team_id) : undefined;
      const away = row.away_team_id ? teamById.get(row.away_team_id) : undefined;
      return {
        id: row.id,
        matchCode: row.match_code,
        kickoffAt: row.kickoff_at,
        providerFixtureId: row.provider_fixture_id,
        homeTeamId: row.home_team_id,
        awayTeamId: row.away_team_id,
        homeTeamName: normalizeNullableText(home?.name) || "TBD",
        awayTeamName: normalizeNullableText(away?.name) || "TBD",
        homeFifaCode: normalizeNullableText(home?.fifa_code) || normalizeNullableText(home?.country_code) || null,
        awayFifaCode: normalizeNullableText(away?.fifa_code) || normalizeNullableText(away?.country_code) || null,
        homeGoals: row.home_goals,
        awayGoals: row.away_goals,
        homePenalties: row.home_penalties,
        awayPenalties: row.away_penalties,
        status: row.status,
        syncLocked: row.sync_locked,
      };
    }),
  };
}
