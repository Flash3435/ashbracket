import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchFixtureEventsForPreview,
  fixtureIdsEligibleForEventFetch,
  fixtureIdsForApplyEventFetch,
  fixtureIdsForCardApplyEventFetch,
} from "./fetchFixtureEventsForPreview";
import { loadMatchCardStatsForLiveScores } from "./loadMatchCardStatsForLiveScores";
import { buildScoreChangePreview } from "./matchMapping";
import { fetchLiveWorldCupScores, getLiveScoresProviderConfig } from "./provider";
import { loadTournamentMatchesForLiveScores } from "./loadTournamentMatches";
import type { ScoreChangePreview, TournamentMatchForLiveScores } from "./types";

export type BuildLiveScoresPreviewOptions = {
  /** Preview UI fetches card events for every finished fixture; apply uses narrower sets. */
  eventFetchMode?: "all_finished" | "apply_scores" | "apply_cards" | "none";
};

export async function buildLiveScoresPreviewWithCards(
  supabase: SupabaseClient,
  editionId: string,
  fetchedAt: string,
  options?: BuildLiveScoresPreviewOptions,
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

  const eventFetchMode = options?.eventFetchMode ?? "all_finished";
  let fixtureIds: string[] = [];
  if (eventFetchMode === "all_finished") {
    fixtureIds = fixtureIdsEligibleForEventFetch(basePreview.rows);
  } else if (eventFetchMode === "apply_scores") {
    fixtureIds = fixtureIdsForApplyEventFetch(basePreview.rows);
  } else if (eventFetchMode === "apply_cards") {
    fixtureIds = fixtureIdsForCardApplyEventFetch(basePreview.rows);
  }

  let eventsByFixtureId = new Map<string, import("./apiFootballEvents").NormalizedFixtureEvents | null>();
  let fetchFailures = new Set<string>();
  if (fixtureIds.length > 0) {
    const fetchedEvents = await fetchFixtureEventsForPreview({
      provider: fetchResult.provider,
      config,
      fixtures: fetchResult.fixtures,
      fixtureIds,
    });
    eventsByFixtureId = fetchedEvents.eventsByFixtureId;
    fetchFailures = fetchedEvents.fetchFailures;
  }

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

/**
 * Rebuild provider preview for apply validation with minimal event fetching.
 * Score-only preview first; card events fetched only when previewId still differs.
 */
export async function buildLiveScoresPreviewForApply(
  supabase: SupabaseClient,
  editionId: string,
  fetchedAt: string,
  expectedPreviewId: string,
): Promise<
  | { ok: true; preview: ScoreChangePreview; matches: TournamentMatchForLiveScores[] }
  | { ok: false; error: string; configWarning?: string | null }
> {
  const scoreOnly = await buildLiveScoresPreviewWithCards(supabase, editionId, fetchedAt, {
    eventFetchMode: "none",
  });
  if (!scoreOnly.ok) return scoreOnly;

  if (scoreOnly.preview.previewId === expectedPreviewId) {
    return scoreOnly;
  }

  const withCards = await buildLiveScoresPreviewWithCards(supabase, editionId, fetchedAt, {
    eventFetchMode: "apply_cards",
  });
  if (!withCards.ok) return withCards;

  if (withCards.preview.previewId !== expectedPreviewId) {
    return {
      ok: false,
      error:
        "Provider data changed since preview — fetch latest scores and cards again and confirm the new plan.",
    };
  }

  return withCards;
}
