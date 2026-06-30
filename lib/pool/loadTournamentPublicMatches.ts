import type { SupabaseClient } from "@supabase/supabase-js";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

export async function loadTournamentPublicMatches(
  supabase: SupabaseClient,
  editionId: string,
): Promise<TournamentMatchPublicRow[]> {
  const { data, error } = await supabase
    .from("tournament_public_matches")
    .select(
      [
        "match_id",
        "edition_id",
        "edition_code",
        "match_code",
        "stage_code",
        "stage_label",
        "stage_sort_order",
        "group_code",
        "round_index",
        "kickoff_at",
        "status",
        "home_goals",
        "away_goals",
        "home_penalties",
        "away_penalties",
        "home_team_name",
        "home_country_code",
        "away_team_name",
        "away_country_code",
        "winner_team_name",
        "winner_country_code",
      ].join(", "),
    )
    .eq("edition_id", editionId)
    .order("stage_sort_order", { ascending: true })
    .order("group_code", { ascending: true, nullsFirst: false })
    .order("round_index", { ascending: true })
    .order("kickoff_at", { ascending: true, nullsFirst: true })
    .order("match_code", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TournamentMatchPublicRow[];
}
