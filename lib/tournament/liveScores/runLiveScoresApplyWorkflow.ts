import { logAdminRiskAction } from "@/lib/admin/adminRiskAuditLog";
import { fetchEditionImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import { checkProductionAdminAck } from "@/lib/admin/requireProductionAdminAck";
import { isGlobalAdmin } from "@/lib/auth/permissions";
import { OFFICIAL_EDITION_CODE } from "@/lib/config/officialTournament";
import {
  buildScoreImpactMatchResults,
  scoreImpactSignatureFromMatchResults,
} from "@/lib/poolActivity/scoreImpact/buildScoreImpactMatchResults";
import { loadTeamNameMapForEdition } from "@/lib/poolActivity/scoreImpact/loadScoreImpactContext";
import { recomputePoolLedgersWithScoreImpact } from "@/lib/poolActivity/scoreImpact/recomputeWithScoreImpact";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchOfficialLiveEdition,
  livePoolIdsForEdition,
} from "@/lib/tournament/editionScope";
import { recordLiveDailyUpdateStatus } from "@/lib/tournament/liveDailyUpdateStatus";
import type { SyncOfficialTournamentSummary } from "@/lib/tournament/syncOfficialTournament";
import {
  applyLiveScoresAndSync,
  LIVE_SCORES_REVALIDATED_PATHS,
} from "./applyLiveScores";
import { ApplyPhaseLogger } from "./applyPhaseLogger";
import { buildLiveScoresPreviewForApply } from "./buildLiveScoresPreviewWithCards";
import {
  buildLiveScoresApplyFailureMessage,
  buildLiveScoresApplySuccessMessage,
  buildLiveScoresScoresSavedMessage,
} from "./buildLiveScoresApplyMessage";
import {
  cardPatchesFromPreviewRows,
  patchesFromPreviewRows,
} from "./matchMapping";
import { getLiveScoresProviderConfig } from "./provider";
import type {
  LiveScoresApplySummary,
  LiveScoresApplyTechnicalDetails,
} from "./types";
import type { ApplyPlanMismatch, ApplyPlanOperation } from "./applyPlanSignature";

/** Bump when changing live-scores apply workflow — shown in admin debug UI. */
export const LIVE_SCORES_APPLY_BUILD = "split-apply-v3";

export type LiveScoresApplyScoresResult =
  | {
      ok: true;
      build: string;
      previewId: string;
      editionId: string;
      editionCode: string;
      editionName: string;
      matchesUpdated: number;
      summary: SyncOfficialTournamentSummary;
      applySummary: LiveScoresApplySummary;
      lastUpdatedAt: string;
      message: string;
      warnings: string[];
      technicalDetails: LiveScoresApplyTechnicalDetails;
      standingsRecalculationPending: boolean;
      pendingPoolIds: string[];
      pendingPoolCount: number;
    }
  | {
      ok: false;
      build: string;
      error: string;
      applySummary?: LiveScoresApplySummary;
      warnings?: string[];
      technicalDetails?: LiveScoresApplyTechnicalDetails;
      stalePreview?: ApplyPlanMismatch;
      httpStatus?: number;
    };

export type LiveScoresRecalculatePoolResult =
  | {
      ok: true;
      build: string;
      poolId: string;
      poolIndex: number;
      poolTotal: number;
      technicalDetails: LiveScoresApplyTechnicalDetails;
    }
  | {
      ok: false;
      build: string;
      poolId: string;
      poolIndex: number;
      poolTotal: number;
      error: string;
      technicalDetails?: LiveScoresApplyTechnicalDetails;
    };

export type LiveScoresRecalculateAllResult =
  | {
      ok: true;
      build: string;
      poolsRecalculated: number;
      message: string;
      technicalDetails: LiveScoresApplyTechnicalDetails;
    }
  | {
      ok: false;
      build: string;
      error: string;
      poolsRecalculated: number;
      failedPoolId?: string;
      technicalDetails?: LiveScoresApplyTechnicalDetails;
    };

function messageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected error.";
}

async function requireLiveScoresAdmin(
  supabase: SupabaseClient,
  productionAcknowledged: boolean | undefined,
  logger: ApplyPhaseLogger,
): Promise<
  | {
      ok: true;
      user: { id: string; email?: string | null };
      liveEdition: NonNullable<Awaited<ReturnType<typeof fetchOfficialLiveEdition>>>;
    }
  | { ok: false; result: LiveScoresApplyScoresResult | LiveScoresRecalculatePoolResult | LiveScoresRecalculateAllResult }
> {
  const ack = checkProductionAdminAck(productionAcknowledged);
  if (!ack.ok) {
    return {
      ok: false,
      result: {
        ok: false,
        build: LIVE_SCORES_APPLY_BUILD,
        error: ack.error,
        technicalDetails: logger.snapshot(),
      },
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isGlobalAdmin(supabase))) {
    return {
      ok: false,
      result: {
        ok: false,
        build: LIVE_SCORES_APPLY_BUILD,
        error: "Only global administrators can apply live scores.",
        technicalDetails: logger.snapshot(),
      },
    };
  }

  const liveEdition = await fetchOfficialLiveEdition(supabase);
  if (!liveEdition) {
    return {
      ok: false,
      result: {
        ok: false,
        build: LIVE_SCORES_APPLY_BUILD,
        error: "Official live tournament edition is not installed.",
        technicalDetails: logger.snapshot(),
      },
    };
  }
  if (liveEdition.isSimulation) {
    return {
      ok: false,
      result: {
        ok: false,
        build: LIVE_SCORES_APPLY_BUILD,
        error: "Official edition is marked simulation — refusing live score apply.",
        technicalDetails: logger.snapshot(),
      },
    };
  }

  return { ok: true, user, liveEdition };
}

/**
 * Step A — apply provider scores/cards and rebuild official derived results.
 * Does not recalculate live pool standings (Step B).
 */
export async function runLiveScoresApplyScoresOnly(
  supabase: SupabaseClient,
  input: {
    previewId: string;
    applyPlanSnapshot?: ApplyPlanOperation[];
    productionAcknowledged?: boolean;
    logger?: ApplyPhaseLogger;
  },
): Promise<LiveScoresApplyScoresResult> {
  const logger = input.logger ?? new ApplyPhaseLogger("liveScoresAction");
  logger.log("action.started", {
    build: LIVE_SCORES_APPLY_BUILD,
    previewId: input.previewId,
    applyPlanSnapshotCount: input.applyPlanSnapshot?.length ?? 0,
    at: new Date().toISOString(),
  });

  try {
    const gate = await requireLiveScoresAdmin(supabase, input.productionAcknowledged, logger);
    if (!gate.ok) return gate.result as LiveScoresApplyScoresResult;

    const { user, liveEdition } = gate;

    const config = getLiveScoresProviderConfig();
    if (!config.configured) {
      return {
        ok: false,
        build: LIVE_SCORES_APPLY_BUILD,
        error: config.configWarning ?? "Live scores provider is not configured.",
        technicalDetails: logger.snapshot(),
      };
    }

    const loaded = await logger.time("action.rebuild_preview_for_apply", () =>
      buildLiveScoresPreviewForApply(
        supabase,
        liveEdition.id,
        new Date().toISOString(),
        input.previewId,
        input.applyPlanSnapshot,
      ),
    );
    if (!loaded.ok) {
      logger.log("action.apply_plan_mismatch", {
        submittedSignature: input.previewId,
        rebuiltSignature: loaded.stalePreview?.rebuiltSignature ?? null,
        changedMatchCodes: loaded.stalePreview?.changedMatchCodes ?? [],
        submittedOperations: loaded.stalePreview?.submittedOperations ?? input.applyPlanSnapshot ?? [],
        rebuiltOperations: loaded.stalePreview?.rebuiltOperations ?? [],
      });
      return {
        ok: false,
        build: LIVE_SCORES_APPLY_BUILD,
        error: loaded.error,
        stalePreview: loaded.stalePreview,
        httpStatus: loaded.httpStatus ?? 500,
        technicalDetails: logger.snapshot(),
      };
    }

    const preview = loaded.preview;
    const patches = patchesFromPreviewRows(preview.rows);
    const cardPatches = cardPatchesFromPreviewRows(
      preview.rows,
      liveEdition.id,
      loaded.matches,
    );
    logger.log("action.patches_planned", {
      scorePatchCount: patches.length,
      cardPatchCount: cardPatches.length,
      previewId: preview.previewId,
      applyPlanSignature: preview.previewId,
      submittedPreviewId: input.previewId,
    });

    if (patches.length === 0 && cardPatches.length === 0) {
      return {
        ok: false,
        build: LIVE_SCORES_APPLY_BUILD,
        error: preview.message ?? "No final score or card changes to apply.",
        technicalDetails: logger.snapshot(),
      };
    }

    const pendingPoolIds = await livePoolIdsForEdition(supabase, liveEdition.id);
    const impact = await fetchEditionImpactSummary(supabase, liveEdition.id);

    const providerFixtureIdUpdates = preview.rows
      .filter((r) => r.willUpdate && r.providerFixtureId)
      .map((r) => ({
        matchId: r.matchId,
        providerFixtureId: r.providerFixtureId!,
      }));

    const applied = await applyLiveScoresAndSync(supabase, {
      editionId: liveEdition.id,
      editionCode: OFFICIAL_EDITION_CODE,
      poolIds: pendingPoolIds,
      previewRows: preview.rows,
      patches,
      cardPatches,
      providerFixtureIdUpdates,
      logger,
      skipPoolRecalculation: true,
    });

    if (!applied.ok) {
      const failureMessage = buildLiveScoresApplyFailureMessage({
        error: applied.error,
        applySummary: applied.applySummary,
      });
      logAdminRiskAction({
        action: "live_scores_apply",
        userId: user.id,
        userEmail: user.email,
        editionId: liveEdition.id,
        editionCode: liveEdition.code,
        isSimulation: false,
        affectedMatchCount: patches.length,
        affectedPoolCount: pendingPoolIds.length,
        detail: failureMessage,
      });
      return {
        ok: false,
        build: LIVE_SCORES_APPLY_BUILD,
        error: failureMessage,
        applySummary: applied.applySummary,
        warnings: applied.warnings,
        technicalDetails: logger.snapshot(),
      };
    }

    const scoresWereApplied = applied.applySummary.planned > 0;
    let lastUpdatedAt = new Date().toISOString();

    if (scoresWereApplied) {
      const recorded = await recordLiveDailyUpdateStatus(
        supabase,
        liveEdition.id,
        applied.summary,
      );
      if (!recorded.ok) {
        return {
          ok: false,
          build: LIVE_SCORES_APPLY_BUILD,
          error: `Scores applied but could not save last-update time: ${recorded.error}`,
          warnings: applied.warnings,
          technicalDetails: logger.snapshot(),
        };
      }
      lastUpdatedAt = recorded.lastUpdatedAt;
    }

    const standingsRecalculationPending =
      scoresWereApplied && pendingPoolIds.length > 0;

    const message = standingsRecalculationPending
      ? buildLiveScoresScoresSavedMessage({
          editionName: liveEdition.name,
          editionCode: liveEdition.code,
          lastUpdatedAt,
          matchesUpdated: applied.matchesUpdated,
          summary: applied.summary,
          applySummary: applied.applySummary,
          warnings: applied.warnings,
          pendingPoolCount: pendingPoolIds.length,
        })
      : buildLiveScoresApplySuccessMessage({
          editionName: liveEdition.name,
          editionCode: liveEdition.code,
          lastUpdatedAt,
          matchesUpdated: applied.matchesUpdated,
          summary: applied.summary,
          applySummary: applied.applySummary,
          warnings: applied.warnings,
        });

    logAdminRiskAction({
      action: "live_scores_apply",
      userId: user.id,
      userEmail: user.email,
      editionId: liveEdition.id,
      editionCode: liveEdition.code,
      isSimulation: false,
      affectedMatchCount: applied.matchesUpdated + applied.applySummary.cardsWritten,
      affectedPoolCount: pendingPoolIds.length,
      affectedParticipantCount: impact?.participantCount,
      detail: message,
    });

    logger.log("action.completed", {
      ok: true,
      standingsRecalculationPending,
      pendingPoolCount: pendingPoolIds.length,
    });

    return {
      ok: true,
      build: LIVE_SCORES_APPLY_BUILD,
      previewId: preview.previewId,
      editionId: liveEdition.id,
      editionCode: liveEdition.code,
      editionName: liveEdition.name,
      matchesUpdated: applied.matchesUpdated,
      summary: applied.summary,
      applySummary: applied.applySummary,
      lastUpdatedAt,
      message,
      warnings: applied.warnings,
      technicalDetails: logger.snapshot(),
      standingsRecalculationPending,
      pendingPoolIds,
      pendingPoolCount: pendingPoolIds.length,
    };
  } catch (e) {
    logger.log("action.failed", { error: messageFromUnknown(e) });
    return {
      ok: false,
      build: LIVE_SCORES_APPLY_BUILD,
      error: messageFromUnknown(e),
      technicalDetails: logger.snapshot(),
    };
  }
}

/** Step B — recalculate one live pool's standings (simulation pools are never passed in). */
export async function runLiveScoresRecalculateOnePool(
  supabase: SupabaseClient,
  input: {
    editionId: string;
    poolId: string;
    poolIndex: number;
    poolTotal: number;
    productionAcknowledged?: boolean;
    logger?: ApplyPhaseLogger;
  },
): Promise<LiveScoresRecalculatePoolResult> {
  const logger = input.logger ?? new ApplyPhaseLogger("liveScoresRecalcPool");
  logger.log("recalc.pool.started", {
    build: LIVE_SCORES_APPLY_BUILD,
    poolId: input.poolId,
    poolIndex: input.poolIndex,
    poolTotal: input.poolTotal,
  });

  try {
    const gate = await requireLiveScoresAdmin(supabase, input.productionAcknowledged, logger);
    if (!gate.ok) {
      const failed = gate.result as LiveScoresRecalculatePoolResult;
      return {
        ...failed,
        poolId: input.poolId,
        poolIndex: input.poolIndex,
        poolTotal: input.poolTotal,
      };
    }

    const { data: poolRow, error: poolErr } = await supabase
      .from("pools")
      .select("id, is_simulation, tournament_edition_id")
      .eq("id", input.poolId)
      .maybeSingle();
    if (poolErr) {
      return {
        ok: false,
        build: LIVE_SCORES_APPLY_BUILD,
        poolId: input.poolId,
        poolIndex: input.poolIndex,
        poolTotal: input.poolTotal,
        error: poolErr.message,
        technicalDetails: logger.snapshot(),
      };
    }
    if (!poolRow || poolRow.is_simulation) {
      return {
        ok: false,
        build: LIVE_SCORES_APPLY_BUILD,
        poolId: input.poolId,
        poolIndex: input.poolIndex,
        poolTotal: input.poolTotal,
        error: "Refusing to recalculate a simulation pool from the live-scores workflow.",
        technicalDetails: logger.snapshot(),
      };
    }
    if (poolRow.tournament_edition_id !== input.editionId) {
      return {
        ok: false,
        build: LIVE_SCORES_APPLY_BUILD,
        poolId: input.poolId,
        poolIndex: input.poolIndex,
        poolTotal: input.poolTotal,
        error: "Pool is not attached to the official live tournament edition.",
        technicalDetails: logger.snapshot(),
      };
    }

    const { data: rawMatches, error: mErr } = await supabase
      .from("tournament_matches")
      .select(
        "id, match_code, stage_code, group_code, home_team_id, away_team_id, home_goals, away_goals, home_penalties, away_penalties, winner_team_id, status, home_advance_from_match_id, away_advance_from_match_id, scoring_result_kind, scoring_slot_key, scoring_stage_code, sync_locked",
      )
      .eq("edition_id", input.editionId);
    if (mErr) {
      return {
        ok: false,
        build: LIVE_SCORES_APPLY_BUILD,
        poolId: input.poolId,
        poolIndex: input.poolIndex,
        poolTotal: input.poolTotal,
        error: mErr.message,
        technicalDetails: logger.snapshot(),
      };
    }

    const teamNameById = await loadTeamNameMapForEdition(supabase, input.editionId);
    const matchResults = buildScoreImpactMatchResults({
      matches: rawMatches ?? [],
      patches: [],
      teamNameById,
    });
    const scoreSignature = scoreImpactSignatureFromMatchResults(matchResults);

    const ledgerOut = await logger.time(
      "recalc.pool.ledger",
      () =>
        recomputePoolLedgersWithScoreImpact(
          supabase,
          [input.poolId],
          "tournament_sync",
          {
            editionId: input.editionId,
            matchResults,
            scoreSignature,
          },
          { editionIsSimulation: false },
        ),
      { poolId: input.poolId },
    );

    if (!ledgerOut.ok) {
      return {
        ok: false,
        build: LIVE_SCORES_APPLY_BUILD,
        poolId: input.poolId,
        poolIndex: input.poolIndex,
        poolTotal: input.poolTotal,
        error: ledgerOut.error,
        technicalDetails: logger.snapshot(),
      };
    }

    logger.log("recalc.pool.completed", { poolId: input.poolId });
    return {
      ok: true,
      build: LIVE_SCORES_APPLY_BUILD,
      poolId: input.poolId,
      poolIndex: input.poolIndex,
      poolTotal: input.poolTotal,
      technicalDetails: logger.snapshot(),
    };
  } catch (e) {
    return {
      ok: false,
      build: LIVE_SCORES_APPLY_BUILD,
      poolId: input.poolId,
      poolIndex: input.poolIndex,
      poolTotal: input.poolTotal,
      error: messageFromUnknown(e),
      technicalDetails: logger.snapshot(),
    };
  }
}

export function liveScoresRevalidatedPaths(): readonly string[] {
  return LIVE_SCORES_REVALIDATED_PATHS;
}
