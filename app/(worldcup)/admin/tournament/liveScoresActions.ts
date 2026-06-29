"use server";

import { logAdminRiskAction } from "@/lib/admin/adminRiskAuditLog";
import { fetchEditionImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import { checkProductionAdminAck } from "@/lib/admin/requireProductionAdminAck";
import { isGlobalAdmin } from "@/lib/auth/permissions";
import { OFFICIAL_EDITION_CODE } from "@/lib/config/officialTournament";
import { createClient } from "@/lib/supabase/server";
import {
  fetchOfficialLiveEdition,
  livePoolIdsForEdition,
} from "@/lib/tournament/editionScope";
import {
  applyLiveScoresAndSync,
  LIVE_SCORES_REVALIDATED_PATHS,
} from "@/lib/tournament/liveScores/applyLiveScores";
import { ApplyPhaseLogger } from "@/lib/tournament/liveScores/applyPhaseLogger";
import { buildLiveScoresPreviewForApply, buildLiveScoresPreviewWithCards } from "@/lib/tournament/liveScores/buildLiveScoresPreviewWithCards";
import {
  buildLiveScoresApplyFailureMessage,
  buildLiveScoresApplySuccessMessage,
} from "@/lib/tournament/liveScores/buildLiveScoresApplyMessage";
import {
  cardPatchesFromPreviewRows,
  patchesFromPreviewRows,
} from "@/lib/tournament/liveScores/matchMapping";
import { getLiveScoresProviderConfig } from "@/lib/tournament/liveScores/provider";
import type {
  LiveScoresApplySummary,
  LiveScoresApplyTechnicalDetails,
  ScoreChangePreview,
} from "@/lib/tournament/liveScores/types";
import { recordLiveDailyUpdateStatus } from "@/lib/tournament/liveDailyUpdateStatus";
import type { SyncOfficialTournamentSummary } from "@/lib/tournament/syncOfficialTournament";
import { revalidatePath } from "next/cache";

export type LiveScoresPreviewResult =
  | { ok: true; preview: ScoreChangePreview }
  | { ok: false; error: string; configWarning?: string | null };

export type LiveScoresApplyResult =
  | {
      ok: true;
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
    }
  | {
      ok: false;
      error: string;
      applySummary?: LiveScoresApplySummary;
      warnings?: string[];
      technicalDetails?: LiveScoresApplyTechnicalDetails;
    };

function messageFromUnknown(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Unexpected error.";
}

function isLikelyServerActionTimeout(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("aborted") ||
    msg.includes("failed to fetch")
  );
}

function buildActionErrorMessage(e: unknown): string {
  if (isLikelyServerActionTimeout(e)) {
    return "Apply timed out before finishing. Check Vercel function logs for phase timings, then retry or split score apply from pool recalculation.";
  }
  return messageFromUnknown(e);
}

function revalidateLiveScoresPaths(): void {
  for (const path of LIVE_SCORES_REVALIDATED_PATHS) {
    revalidatePath(path);
  }
  revalidatePath("/pool/[poolId]", "layout");
}

export async function fetchLiveScoresPreviewAction(): Promise<LiveScoresPreviewResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !(await isGlobalAdmin(supabase))) {
      return {
        ok: false,
        error: "Only global administrators can fetch live scores.",
      };
    }

    const config = getLiveScoresProviderConfig();
    if (!config.configured) {
      return {
        ok: false,
        error: config.configWarning ?? "Live scores provider is not configured.",
        configWarning: config.configWarning,
      };
    }

    const liveEdition = await fetchOfficialLiveEdition(supabase);
    if (!liveEdition) {
      return { ok: false, error: "Official live tournament edition is not installed." };
    }
    if (liveEdition.isSimulation) {
      return {
        ok: false,
        error: "Official edition is marked simulation — refusing live score fetch.",
      };
    }

    const fetchedAt = new Date().toISOString();
    const built = await buildLiveScoresPreviewWithCards(supabase, liveEdition.id, fetchedAt);
    if (!built.ok) {
      logAdminRiskAction({
        action: "live_scores_preview",
        userId: user.id,
        userEmail: user.email,
        editionId: liveEdition.id,
        editionCode: liveEdition.code,
        isSimulation: false,
        previewOnly: true,
        detail: built.error,
      });
      return {
        ok: false,
        error: built.error,
        configWarning: built.configWarning,
      };
    }

    const preview = built.preview;

    logAdminRiskAction({
      action: "live_scores_preview",
      userId: user.id,
      userEmail: user.email,
      editionId: liveEdition.id,
      editionCode: liveEdition.code,
      isSimulation: false,
      previewOnly: true,
      affectedMatchCount: preview.summary.willUpdate + preview.summary.cardsWillUpdate,
      detail: `provider=${preview.provider} willUpdate=${preview.summary.willUpdate} cardsWillUpdate=${preview.summary.cardsWillUpdate}`,
    });

    return { ok: true, preview };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

export async function applyLiveScoresAction(input: {
  previewId: string;
  productionAcknowledged?: boolean;
}): Promise<LiveScoresApplyResult> {
  const logger = new ApplyPhaseLogger("liveScoresAction");
  try {
    const ack = checkProductionAdminAck(input.productionAcknowledged);
    if (!ack.ok) return ack;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !(await isGlobalAdmin(supabase))) {
      return {
        ok: false,
        error: "Only global administrators can apply live scores.",
        technicalDetails: logger.snapshot(),
      };
    }

    const liveEdition = await fetchOfficialLiveEdition(supabase);
    if (!liveEdition) {
      return {
        ok: false,
        error: "Official live tournament edition is not installed.",
        technicalDetails: logger.snapshot(),
      };
    }
    if (liveEdition.isSimulation) {
      return {
        ok: false,
        error: "Official edition is marked simulation — refusing live score apply.",
        technicalDetails: logger.snapshot(),
      };
    }

    const config = getLiveScoresProviderConfig();
    if (!config.configured) {
      return {
        ok: false,
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
      ),
    );
    if (!loaded.ok) {
      return {
        ok: false,
        error: loaded.error,
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
    });

    if (patches.length === 0 && cardPatches.length === 0) {
      return {
        ok: false,
        error: preview.message ?? "No final score or card changes to apply.",
        technicalDetails: logger.snapshot(),
      };
    }

    const poolIds = await livePoolIdsForEdition(supabase, liveEdition.id);
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
      poolIds,
      previewRows: preview.rows,
      patches,
      cardPatches,
      providerFixtureIdUpdates,
      logger,
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
        affectedPoolCount: poolIds.length,
        detail: failureMessage,
      });
      return {
        ok: false,
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
          error: `Scores applied but could not save last-update time: ${recorded.error}`,
          warnings: applied.warnings,
          technicalDetails: logger.snapshot(),
        };
      }
      lastUpdatedAt = recorded.lastUpdatedAt;
    }

    const message = buildLiveScoresApplySuccessMessage({
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
      affectedPoolCount: poolIds.length,
      affectedParticipantCount: impact?.participantCount,
      detail: message,
    });

    revalidateLiveScoresPaths();

    return {
      ok: true,
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
    };
  } catch (e) {
    logger.log("action.failed", { error: messageFromUnknown(e) });
    return {
      ok: false,
      error: buildActionErrorMessage(e),
      technicalDetails: logger.snapshot(),
    };
  }
}

export async function getLiveScoresProviderStatusAction(): Promise<{
  provider: string;
  configured: boolean;
  configWarning: string | null;
}> {
  const config = getLiveScoresProviderConfig();
  return {
    provider: config.provider,
    configured: config.configured,
    configWarning: config.configWarning,
  };
}
