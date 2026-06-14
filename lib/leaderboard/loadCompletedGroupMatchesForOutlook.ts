import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompletedGroupMatchForOutlook } from "./buildBracketOutlook";

type MatchRow = {
  match_code: string;
  winner_team_id: string | null;
  home_goals: number | null;
  away_goals: number | null;
  status: string | null;
  stage_code: string | null;
};

/**
 * Finished group-stage matches with a decisive winner (draws omitted in v1).
 */
export async function loadCompletedGroupMatchesForOutlook(
  supabase: SupabaseClient,
  editionId: string,
): Promise<CompletedGroupMatchForOutlook[]> {
  const trimmedEditionId = editionId.trim();
  if (!trimmedEditionId) return [];

  const { data, error } = await supabase
    .from("tournament_matches")
    .select(
      "match_code, winner_team_id, home_goals, away_goals, status, stage_code",
    )
    .eq("edition_id", trimmedEditionId)
    .eq("stage_code", "group");

  if (error) throw new Error(error.message);

  const out: CompletedGroupMatchForOutlook[] = [];
  for (const row of (data ?? []) as MatchRow[]) {
    const winnerTeamId = row.winner_team_id?.trim() || null;
    if (!winnerTeamId) continue;

    const status = String(row.status ?? "").toLowerCase();
    if (status !== "finished") continue;

    const homeGoals = row.home_goals;
    const awayGoals = row.away_goals;
    if (homeGoals == null || awayGoals == null) continue;
    if (homeGoals === awayGoals) continue;

    const matchCode = String(row.match_code ?? "").trim();
    if (!matchCode) continue;

    out.push({ matchCode, winnerTeamId });
  }

  return out;
}
