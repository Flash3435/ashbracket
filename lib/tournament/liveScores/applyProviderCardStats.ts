import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderCardPatchInput } from "./types";

export const PROVIDER_TEAM_STAT_SOURCE = "provider" as const;

export function buildProviderCardUpsertRows(patch: ProviderCardPatchInput) {
  return [
    {
      edition_id: patch.editionId,
      match_id: patch.matchId,
      team_id: patch.homeTeamId,
      yellow_cards: patch.homeYellowCards,
      red_cards: patch.homeRedCards,
      source: PROVIDER_TEAM_STAT_SOURCE,
    },
    {
      edition_id: patch.editionId,
      match_id: patch.matchId,
      team_id: patch.awayTeamId,
      yellow_cards: patch.awayYellowCards,
      red_cards: patch.awayRedCards,
      source: PROVIDER_TEAM_STAT_SOURCE,
    },
  ];
}

export async function applyProviderCardStats(
  supabase: SupabaseClient,
  patches: ProviderCardPatchInput[],
): Promise<{ written: number; error?: string }> {
  let written = 0;
  for (const patch of patches) {
    const rows = buildProviderCardUpsertRows(patch);
    const { error } = await supabase
      .from("tournament_match_team_stats")
      .upsert(rows, { onConflict: "match_id,team_id,source" });
    if (error) return { written, error: error.message };
    written += 1;
  }
  return { written };
}
