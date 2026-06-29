import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type ApplyPlanMismatch,
  type ApplyPlanOperation,
  buildApplyPlanStaleErrorMessage,
  computeApplyPlanSignature,
  computeApplyPlanSignatureFromOperations,
  diffApplyPlanOperations,
  extractApplyPlanOperations,
} from "./applyPlanSignature";
import {
  fetchFixtureEventsForPreview,
  fixtureIdsEligibleForEventFetch,
  fixtureIdsForApplyEventFetch,
  fixtureIdsForApplyPlanValidation,
  fixtureIdsForCardApplyEventFetch,
} from "./fetchFixtureEventsForPreview";
import { loadMatchCardStatsForLiveScores } from "./loadMatchCardStatsForLiveScores";
import { buildScoreChangePreview } from "./matchMapping";
import { fetchLiveWorldCupScores, getLiveScoresProviderConfig } from "./provider";
import { loadTournamentMatchesForLiveScores } from "./loadTournamentMatches";
import type { ScoreChangePreview, TournamentMatchForLiveScores } from "./types";

export type BuildLiveScoresPreviewOptions = {
  /** Preview UI fetches card events for every finished fixture; apply uses narrower sets. */
  eventFetchMode?: "all_finished" | "apply_scores" | "apply_cards" | "apply_validation" | "none";
};

export type BuildLiveScoresPreviewForApplyResult =
  | { ok: true; preview: ScoreChangePreview; matches: TournamentMatchForLiveScores[] }
  | {
      ok: false;
      error: string;
      configWarning?: string | null;
      stalePreview?: ApplyPlanMismatch;
      httpStatus?: 409;
    };

async function buildLiveScoresPreviewWithCardsInternal(
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
  } else if (eventFetchMode === "apply_validation") {
    fixtureIds = fixtureIdsForApplyPlanValidation(basePreview.rows);
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

export async function buildLiveScoresPreviewWithCards(
  supabase: SupabaseClient,
  editionId: string,
  fetchedAt: string,
  options?: BuildLiveScoresPreviewOptions,
): Promise<
  | { ok: true; preview: ScoreChangePreview; matches: TournamentMatchForLiveScores[] }
  | { ok: false; error: string; configWarning?: string | null }
> {
  return buildLiveScoresPreviewWithCardsInternal(supabase, editionId, fetchedAt, options);
}

/**
 * Rebuild provider preview for apply validation with card events for every planned row.
 * Compares a stable apply-plan signature, not full provider preview state.
 */
export async function buildLiveScoresPreviewForApply(
  supabase: SupabaseClient,
  editionId: string,
  fetchedAt: string,
  expectedApplyPlanSignature: string,
  submittedOperations?: ApplyPlanOperation[],
): Promise<BuildLiveScoresPreviewForApplyResult> {
  const built = await buildLiveScoresPreviewWithCardsInternal(supabase, editionId, fetchedAt, {
    eventFetchMode: "apply_validation",
  });
  if (!built.ok) return built;

  const rebuiltSignature = computeApplyPlanSignature(built.preview.rows);
  const rebuiltOperations = extractApplyPlanOperations(built.preview.rows);

  console.info("[ashbracket:liveScoresApply] apply_plan_signature.compare", {
    submittedSignature: expectedApplyPlanSignature,
    rebuiltSignature,
    submittedOperationCount: submittedOperations?.length ?? null,
    rebuiltOperationCount: rebuiltOperations.length,
    match: rebuiltSignature === expectedApplyPlanSignature,
  });

  if (rebuiltSignature === expectedApplyPlanSignature) {
    if (submittedOperations) {
      const submittedSignature = computeApplyPlanSignatureFromOperations(submittedOperations);
      if (submittedSignature !== expectedApplyPlanSignature) {
        console.warn("[ashbracket:liveScoresApply] apply_plan_snapshot.signature_mismatch", {
          expectedApplyPlanSignature,
          submittedSnapshotSignature: submittedSignature,
        });
      }
    }
    return built;
  }

  const mismatch = diffApplyPlanOperations(submittedOperations ?? [], rebuiltOperations);

  console.warn("[ashbracket:liveScoresApply] apply_plan_signature.mismatch", {
    submittedSignature: expectedApplyPlanSignature,
    rebuiltSignature,
    changedMatchCodes: mismatch.changedMatchCodes,
    submittedOperations: submittedOperations ?? [],
    rebuiltOperations,
  });

  return {
    ok: false,
    error: buildApplyPlanStaleErrorMessage({
      ...mismatch,
      submittedSignature: expectedApplyPlanSignature,
      rebuiltSignature,
    }),
    stalePreview: {
      ...mismatch,
      submittedSignature: expectedApplyPlanSignature,
      rebuiltSignature,
      submittedOperations: submittedOperations ?? [],
      rebuiltOperations,
    },
    httpStatus: 409,
  };
}
