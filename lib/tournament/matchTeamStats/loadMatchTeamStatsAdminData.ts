import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchTeamStatRecord, MatchTeamStatsAdminMatch, TeamStatSide } from "./types";

type StatRow = {
  id: string;
  edition_id: string;
  match_id: string;
  team_id: string;
  yellow_cards: number | null;
  red_cards: number | null;
  source: string;
};

function mapStatRow(row: StatRow): MatchTeamStatRecord {
  return {
    id: row.id,
    editionId: row.edition_id,
    matchId: row.match_id,
    teamId: row.team_id,
    yellowCards: row.yellow_cards,
    redCards: row.red_cards,
    source: row.source,
  };
}

export async function loadMatchTeamStatsForEdition(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{ teamStats: MatchTeamStatRecord[] } | { error: string }> {
  const { data, error } = await supabase
    .from("tournament_match_team_stats")
    .select("id, edition_id, match_id, team_id, yellow_cards, red_cards, source")
    .eq("edition_id", editionId)
    .eq("source", "manual");

  if (error) return { error: error.message };
  return { teamStats: ((data ?? []) as StatRow[]).map(mapStatRow) };
}

export async function loadMatchesForTeamStatsAdmin(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{ matches: MatchTeamStatsAdminMatch[] } | { error: string }> {
  const { data: rawMatches, error } = await supabase
    .from("tournament_matches")
    .select(
      "id, match_code, stage_code, group_code, kickoff_at, status, home_team_id, away_team_id, home_goals, away_goals, sync_locked",
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
      stageCode: row.stage_code as string,
      groupCode: row.group_code as string | null,
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

/** Map stats to home/away using known team IDs from the match row. */
export function statsForMatch(
  match: MatchTeamStatsAdminMatch,
  teamStats: readonly MatchTeamStatRecord[],
): { home: TeamStatSide; away: TeamStatSide } {
  const homeRow = teamStats.find(
    (s) => s.matchId === match.id && s.teamId === match.homeTeamId,
  );
  const awayRow = teamStats.find(
    (s) => s.matchId === match.id && s.teamId === match.awayTeamId,
  );
  return {
    home: {
      yellowCards: homeRow?.yellowCards ?? null,
      redCards: homeRow?.redCards ?? null,
    },
    away: {
      yellowCards: awayRow?.yellowCards ?? null,
      redCards: awayRow?.redCards ?? null,
    },
  };
}
