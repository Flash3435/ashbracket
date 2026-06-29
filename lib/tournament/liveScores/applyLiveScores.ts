import type { SupabaseClient } from "@supabase/supabase-js";
import type { OfficialMatchScorePatch } from "../syncOfficialTournament";
import {
  syncOfficialTournament,
  type PatchApplyOutcome,
  type SyncOfficialTournamentSummary,
} from "../syncOfficialTournament";
import type {
  LiveScoresApplySummary,
  OfficialMatchScorePatchInput,
  ProviderCardPatchInput,
  ScoreChangePreviewRow,
} from "./types";
import { applyProviderCardStats } from "./applyProviderCardStats";
import { verifyAppliedLiveScorePatches } from "./verifyAppliedPatches";
import { verifyAppliedProviderCardPatches } from "./verifyAppliedCardStats";
import { ApplyPhaseLogger } from "./applyPhaseLogger";

export type SyncOfficialTournamentFn = (
  supabase: SupabaseClient,
  options: {
    editionCode: string;
    poolIds: string[];
    patches?: OfficialMatchScorePatch[];
    logger?: ApplyPhaseLogger;
  },
) => ReturnType<typeof syncOfficialTournament>;

export const LIVE_SCORES_REVALIDATED_PATHS = [
  "/tournament",
  "/admin/tournament",
  "/admin/tournament/live-scores",
  "/admin/tournament/match-stats",
  "/admin/tournament/status",
  "/admin/results",
  "/admin/activity",
  "/rules",
  "/account",
  "/account/reveal",
  "/account/activity",
] as const;

export function toOfficialMatchScorePatches(
  patches: OfficialMatchScorePatchInput[],
): OfficialMatchScorePatch[] {
  return patches.map((p) => ({
    matchCode: p.matchCode,
    homeGoals: p.homeGoals,
    awayGoals: p.awayGoals,
    homePenalties: p.homePenalties,
    awayPenalties: p.awayPenalties,
    status: p.status,
  }));
}

export async function persistProviderFixtureIds(
  supabase: SupabaseClient,
  updates: Array<{ matchId: string; providerFixtureId: string }>,
): Promise<{ saved: number; error?: string }> {
  let saved = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from("tournament_matches")
      .update({ provider_fixture_id: u.providerFixtureId })
      .eq("id", u.matchId)
      .is("provider_fixture_id", null);
    if (error) return { saved, error: error.message };
    saved += 1;
  }
  return { saved };
}

export type ApplyLiveScoresResult =
  | {
      ok: true;
      matchesUpdated: number;
      summary: SyncOfficialTournamentSummary;
      applySummary: LiveScoresApplySummary;
      warnings: string[];
    }
  | {
      ok: false;
      error: string;
      applySummary?: LiveScoresApplySummary;
      warnings?: string[];
    };

function buildApplySummary(input: {
  previewRows: ScoreChangePreviewRow[];
  patchOutcome: PatchApplyOutcome;
  verificationDetails: LiveScoresApplySummary["details"];
  cardDetails: LiveScoresApplySummary["cardDetails"];
  providerFixtureIdsSaved: number;
  ledgersRecomputed: number;
  cardsWritten: number;
}): LiveScoresApplySummary {
  const planned = input.previewRows.filter((r) => r.willUpdate).length;
  const written = input.patchOutcome.applied.length;
  const skipped = input.patchOutcome.skipped.length;
  const failedVerification = input.verificationDetails.filter((d) => d.planned && !d.verified).length;
  const cardsPlanned = input.previewRows.filter((r) => r.cardWillUpdate).length;
  const cardsManualConflict = input.previewRows.filter((r) => r.cardReason === "manual_conflict").length;
  const cardsFailedVerification = input.cardDetails.filter((d) => d.planned && !d.verified).length;

  return {
    planned,
    written,
    skipped,
    failedVerification,
    providerFixtureIdsSaved: input.providerFixtureIdsSaved,
    ledgersRecomputed: input.ledgersRecomputed,
    cardsPlanned,
    cardsWritten: input.cardsWritten,
    cardsSkipped: cardsPlanned - input.cardsWritten,
    cardsManualConflict,
    cardsFailedVerification,
    revalidatedPaths: [...LIVE_SCORES_REVALIDATED_PATHS],
    details: input.verificationDetails,
    cardDetails: input.cardDetails,
  };
}

/**
 * Apply score patches via the existing official tournament sync path.
 * Does not change scoring rules — delegates to syncOfficialTournament.
 */
export async function applyLiveScoresAndSync(
  supabase: SupabaseClient,
  options: {
    editionId: string;
    editionCode: string;
    poolIds: string[];
    previewRows: ScoreChangePreviewRow[];
    patches: OfficialMatchScorePatchInput[];
    cardPatches?: ProviderCardPatchInput[];
    providerFixtureIdUpdates?: Array<{ matchId: string; providerFixtureId: string }>;
    syncFn?: SyncOfficialTournamentFn;
    logger?: ApplyPhaseLogger;
  },
): Promise<ApplyLiveScoresResult> {
  const warnings: string[] = [];
  const syncFn = options.syncFn ?? syncOfficialTournament;
  const cardPatches = options.cardPatches ?? [];
  const logger = options.logger ?? new ApplyPhaseLogger("liveScoresApply");

  logger.log("apply.provider_rows_selected", {
    previewRowCount: options.previewRows.length,
    scorePatchesPlanned: options.patches.length,
    cardPatchesPlanned: cardPatches.length,
    providerFixtureIdUpdates: options.providerFixtureIdUpdates?.length ?? 0,
    poolCount: options.poolIds.length,
  });

  if (options.patches.length === 0 && cardPatches.length === 0) {
    return { ok: false, error: "No score or card changes to apply.", warnings };
  }

  let providerFixtureIdsSaved = 0;
  if (options.providerFixtureIdUpdates?.length) {
    const saved = await logger.time("apply.persist_provider_fixture_ids", () =>
      persistProviderFixtureIds(supabase, options.providerFixtureIdUpdates!),
    );
    providerFixtureIdsSaved = saved.saved;
    if (saved.error) {
      warnings.push(`Could not save provider fixture ids: ${saved.error}`);
    }
  }

  let patchOutcome: PatchApplyOutcome = { applied: [], skipped: [] };
  let syncSummary: SyncOfficialTournamentSummary = {
    matchCount: 0,
    matchesWithScoresCount: 0,
    finishedMatchCount: 0,
    derivedResultsInserted: 0,
    poolsRecalculated: 0,
    syncLockedMatchCount: 0,
    patchesApplied: 0,
    patchesSkipped: 0,
    roundOf32Publish: null,
  };

  if (options.patches.length > 0) {
    logger.log("apply.official_tournament_sync_start", {
      patchMatchCodes: options.patches.map((p) => p.matchCode),
    });
    const out = await logger.time("apply.official_tournament_sync", () =>
      syncFn(supabase, {
        editionCode: options.editionCode,
        poolIds: options.poolIds,
        patches: toOfficialMatchScorePatches(options.patches),
        logger,
      }),
    );
    logger.log("apply.official_tournament_sync_end", { ok: out.ok });

    if (!out.ok) {
      return { ok: false, error: out.error, warnings };
    }

    patchOutcome = out.patchOutcome;
    syncSummary = out.summary;
  }

  logger.log("apply.score_card_writes_complete", {
    scoresWritten: patchOutcome.applied.length,
    cardsPlanned: cardPatches.length,
  });

  const skipped = patchOutcome.skipped.map((s) => ({
    matchCode: s.matchCode,
    reason: s.reason,
  }));

  let verificationDetails: LiveScoresApplySummary["details"] = [];
  if (options.patches.length > 0) {
    const verified = await verifyAppliedLiveScorePatches(
      supabase,
      options.editionId,
      options.previewRows,
      options.patches,
      patchOutcome.applied,
      skipped,
    );
    verificationDetails = verified.details;

    if (!verified.ok) {
      const applySummary = buildApplySummary({
        previewRows: options.previewRows,
        patchOutcome,
        verificationDetails,
        cardDetails: [],
        providerFixtureIdsSaved,
        ledgersRecomputed: syncSummary.poolsRecalculated,
        cardsWritten: 0,
      });
      return {
        ok: false,
        error: verified.error,
        applySummary,
        warnings,
      };
    }
  }

  let cardsWritten = 0;
  let cardDetails: LiveScoresApplySummary["cardDetails"] = [];
  if (cardPatches.length > 0) {
    const cardApply = await logger.time("apply.card_stats_write", () =>
      applyProviderCardStats(supabase, cardPatches),
    );
    cardsWritten = cardApply.written;
    if (cardApply.error) {
      return {
        ok: false,
        error: `Could not apply provider card totals: ${cardApply.error}`,
        warnings,
      };
    }

    const cardVerified = await logger.time("apply.card_stats_verify", () =>
      verifyAppliedProviderCardPatches(
        supabase,
        options.editionId,
        options.previewRows,
        cardPatches,
        cardPatches.map((p) => p.matchCode),
      ),
    );
    cardDetails = cardVerified.details;

    if (!cardVerified.ok) {
      const applySummary = buildApplySummary({
        previewRows: options.previewRows,
        patchOutcome,
        verificationDetails,
        cardDetails,
        providerFixtureIdsSaved,
        ledgersRecomputed: syncSummary.poolsRecalculated,
        cardsWritten,
      });
      return {
        ok: false,
        error: cardVerified.error,
        applySummary,
        warnings,
      };
    }
  }

  const applySummary = buildApplySummary({
    previewRows: options.previewRows,
    patchOutcome,
    verificationDetails,
    cardDetails,
    providerFixtureIdsSaved,
    ledgersRecomputed: syncSummary.poolsRecalculated,
    cardsWritten,
  });

  if (patchOutcome.skipped.length > 0) {
    const skippedCodes = patchOutcome.skipped
      .map((s) => `${s.matchCode} (${s.reason})`)
      .join(", ");
    warnings.push(`Skipped ${patchOutcome.skipped.length} score patch(es): ${skippedCodes}`);
  }

  const manualConflicts = options.previewRows.filter((r) => r.cardReason === "manual_conflict");
  if (manualConflicts.length > 0) {
    warnings.push(
      `Skipped ${manualConflicts.length} match(es) with manual card totals that differ from provider.`,
    );
  }

  logger.log("apply.final_response", {
    ok: true,
    matchesUpdated: patchOutcome.applied.length,
    cardsWritten,
    poolsRecalculated: syncSummary.poolsRecalculated,
    totalDurationMs: logger.snapshot().totalDurationMs,
  });

  return {
    ok: true,
    matchesUpdated: patchOutcome.applied.length,
    summary: syncSummary,
    applySummary,
    warnings,
  };
}
