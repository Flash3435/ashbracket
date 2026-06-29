"use server";

import { logAdminRiskAction } from "@/lib/admin/adminRiskAuditLog";
import { checkProductionAdminAck } from "@/lib/admin/requireProductionAdminAck";
import { isGlobalAdmin } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  fetchOfficialLiveEdition,
} from "@/lib/tournament/editionScope";
import { LIVE_SCORES_REVALIDATED_PATHS } from "@/lib/tournament/liveScores/applyLiveScores";
import { buildLiveScoresPreviewWithCards } from "@/lib/tournament/liveScores/buildLiveScoresPreviewWithCards";
import { getLiveScoresProviderConfig } from "@/lib/tournament/liveScores/provider";
import {
  LIVE_SCORES_APPLY_BUILD,
  runLiveScoresApplyScoresOnly,
  runLiveScoresRecalculateOnePool,
  type LiveScoresApplyScoresResult,
  type LiveScoresRecalculatePoolResult,
} from "@/lib/tournament/liveScores/runLiveScoresApplyWorkflow";
import type { ScoreChangePreview } from "@/lib/tournament/liveScores/types";
import { revalidatePath } from "next/cache";

export type LiveScoresPreviewResult =
  | { ok: true; preview: ScoreChangePreview }
  | { ok: false; error: string; configWarning?: string | null };

export type LiveScoresApplyResult = LiveScoresApplyScoresResult;
export type LiveScoresRecalculatePoolActionResult = LiveScoresRecalculatePoolResult;

function revalidateLiveScoresPaths(): void {
  for (const path of LIVE_SCORES_REVALIDATED_PATHS) {
    revalidatePath(path);
  }
  revalidatePath("/pool/[poolId]", "layout");
}

/** @deprecated Prefer POST /api/admin/live-scores/apply — kept for tooling. */
export async function applyLiveScoresAction(input: {
  previewId: string;
  productionAcknowledged?: boolean;
}): Promise<LiveScoresApplyResult> {
  const supabase = await createClient();
  return runLiveScoresApplyScoresOnly(supabase, input);
}

/** @deprecated Prefer POST /api/admin/live-scores/recalculate-pools — kept for tooling. */
export async function recalculateLivePoolStandingsAction(input: {
  editionId: string;
  poolId: string;
  poolIndex: number;
  poolTotal: number;
  productionAcknowledged?: boolean;
}): Promise<LiveScoresRecalculatePoolActionResult> {
  const supabase = await createClient();
  return runLiveScoresRecalculateOnePool(supabase, input);
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
    const built = await buildLiveScoresPreviewWithCards(supabase, liveEdition.id, fetchedAt, {
      eventFetchMode: "apply_validation",
    });
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
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error." };
  }
}

export async function getLiveScoresProviderStatusAction(): Promise<{
  provider: string;
  configured: boolean;
  configWarning: string | null;
  applyBuild: string;
}> {
  const config = getLiveScoresProviderConfig();
  return {
    provider: config.provider,
    configured: config.configured,
    configWarning: config.configWarning,
    applyBuild: LIVE_SCORES_APPLY_BUILD,
  };
}

export async function revalidateLiveScoresSurfacesAction(): Promise<{ ok: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isGlobalAdmin(supabase))) {
    throw new Error("Unauthorized");
  }
  revalidateLiveScoresPaths();
  return { ok: true };
}
