import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildScoreImpactMatchResultsFromMatchCodes,
} from "@/lib/poolActivity/scoreImpact/buildScoreImpactMatchResults";
import { inferRecentAppliedMatchCodes } from "@/lib/poolActivity/scoreImpact/inferRecentAppliedMatchCodes";
import { loadTeamNameMapForEdition } from "@/lib/poolActivity/scoreImpact/loadScoreImpactContext";
import { parseMatchupFromScoreLabel } from "./parseLatestScoreEventContext";

function readMatchCodes(metadata: Record<string, unknown>): string[] {
  if (!Array.isArray(metadata.match_codes)) return [];
  return metadata.match_codes.filter(
    (code): code is string => typeof code === "string" && code.trim().length > 0,
  );
}

/**
 * Backfill missing match attribution on score-impact rows created without Step B
 * appliedMatchCodes (generic pool recalc). Uses last_sync_at on tournament_matches.
 */
export async function enrichScoreImpactEventMetadata(
  supabase: SupabaseClient,
  poolId: string,
  metadata: Record<string, unknown>,
  options?: { eventCreatedAt?: string | null },
): Promise<Record<string, unknown>> {
  if (readMatchCodes(metadata).length > 0) return metadata;

  const { data: poolRow, error: poolErr } = await supabase
    .from("pools")
    .select("tournament_edition_id")
    .eq("id", poolId)
    .maybeSingle();
  if (poolErr || !poolRow?.tournament_edition_id) return metadata;

  const editionId = poolRow.tournament_edition_id as string;
  const referenceTime = options?.eventCreatedAt
    ? new Date(options.eventCreatedAt)
    : new Date();

  let inferredCodes: string[] = [];
  try {
    inferredCodes = await inferRecentAppliedMatchCodes(supabase, editionId, {
      referenceTime,
    });
  } catch {
    return metadata;
  }
  if (inferredCodes.length === 0) return metadata;

  const { data: rawMatches, error: matchErr } = await supabase
    .from("tournament_matches")
    .select(
      "match_code, group_code, stage_code, home_team_id, away_team_id, home_goals, away_goals, winner_team_id",
    )
    .eq("edition_id", editionId)
    .in("match_code", inferredCodes);
  if (matchErr || !rawMatches?.length) return metadata;

  const teamNameById = await loadTeamNameMapForEdition(supabase, editionId);
  const matchResults = buildScoreImpactMatchResultsFromMatchCodes({
    matches: rawMatches,
    matchCodes: inferredCodes,
    teamNameById,
  });
  if (matchResults.length === 0) return metadata;

  const primary = matchResults[0]!;
  const parsed = parseMatchupFromScoreLabel(primary.label);
  const enriched: Record<string, unknown> = {
    ...metadata,
    match_codes: matchResults.map((m) => m.matchCode),
    match_id: primary.matchCode,
    match_label: primary.label,
    scoreline: primary.label,
    match_attribution_inferred: true,
  };

  if (parsed.winnerTeamName && parsed.loserTeamName) {
    enriched.bracket_impact = {
      ...(metadata.bracket_impact != null && typeof metadata.bracket_impact === "object"
        ? (metadata.bracket_impact as Record<string, unknown>)
        : {}),
      winner_team_name: parsed.winnerTeamName,
      loser_team_name: parsed.loserTeamName,
    };
  }

  return enriched;
}
