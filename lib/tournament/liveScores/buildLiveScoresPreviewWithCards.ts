import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchFixtureEventsForPreview, fixtureIdsEligibleForEventFetch } from "./fetchFixtureEventsForPreview";
import { loadMatchCardStatsForLiveScores } from "./loadMatchCardStatsForLiveScores";
import { buildScoreChangePreview } from "./matchMapping";
import { fetchLiveWorldCupScores, getLiveScoresProviderConfig } from "./provider";
import { loadTournamentMatchesForLiveScores } from "./loadTournamentMatches";
import type { ScoreChangePreview, TournamentMatchForLiveScores } from "./types";

export async function buildLiveScoresPreviewWithCards(
  supabase: SupabaseClient,
  editionId: string,
  fetchedAt: string,
): Promise<
  | { ok: true; preview: ScoreChangePreview; matches: TournamentMatchForLiveScores[] }
  | { ok: false; error: string; configWarning?: string | null }
> {
  const config = getLiveScoresProviderConfig();
  if (!config.configured) {
    return {
      ok: false,
      error: config.configWarning ?? "Live scores provider is not configured.",
      configWarning: config.configWarning,
    };
  }

  const loaded = await loadTournamentMatchesForLiveScores(supabase, editionId);
  if ("error" in loaded) {
    return { ok: false, error: loaded.error };
  }

  const fetchResult = await fetchLiveWorldCupScores(config);
  if (!fetchResult.ok) {
    return {
      ok: false,
      error: fetchResult.error,
      configWarning: fetchResult.configWarning,
    };
  }

  const basePreview = buildScoreChangePreview({
    provider: fetchResult.provider,
    providerConfigured: config.configured,
    configWarning: config.configWarning,
    fetchedAt,
    matches: loaded.matches,
    fixtures: fetchResult.fixtures,
  });

  const fixtureIds = fixtureIdsEligibleForEventFetch(basePreview.rows);
  const { eventsByFixtureId, fetchFailures } = await fetchFixtureEventsForPreview({
    provider: fetchResult.provider,
    config,
    fixtures: fetchResult.fixtures,
    fixtureIds,
  });

  const cardStats = await loadMatchCardStatsForLiveScores(
    supabase,
    editionId,
    loaded.matches.map((m) => m.id),
  );
  if ("error" in cardStats) {
    return { ok: false, error: cardStats.error };
  }

  const preview = buildScoreChangePreview({
    provider: fetchResult.provider,
    providerConfigured: config.configured,
    configWarning: config.configWarning,
    fetchedAt,
    matches: loaded.matches,
    fixtures: fetchResult.fixtures,
    cardStatsByMatchId: cardStats.statsByMatchId,
    eventsByFixtureId,
    eventFetchFailures: fetchFailures,
  });

  return { ok: true, preview, matches: loaded.matches };
}
