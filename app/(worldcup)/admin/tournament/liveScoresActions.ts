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
import { buildLiveScoresPreviewWithCards } from "@/lib/tournament/liveScores/buildLiveScoresPreviewWithCards";
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
    }
  | { ok: false; error: string; applySummary?: LiveScoresApplySummary; warnings?: string[] };

function messageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected error.";
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
      };
    }

    const liveEdition = await fetchOfficialLiveEdition(supabase);
    if (!liveEdition) {
      return { ok: false, error: "Official live tournament edition is not installed." };
    }
    if (liveEdition.isSimulation) {
      return {
        ok: false,
        error: "Official edition is marked simulation — refusing live score apply.",
      };
    }

    const config = getLiveScoresProviderConfig();
    if (!config.configured) {
      return {
        ok: false,
        error: config.configWarning ?? "Live scores provider is not configured.",
      };
    }

    const loaded = await buildLiveScoresPreviewWithCards(supabase, liveEdition.id, new Date().toISOString());
    if (!loaded.ok) {
      return { ok: false, error: loaded.error };
    }

    const preview = loaded.preview;

    if (preview.previewId !== input.previewId) {
      return {
        ok: false,
        error:
          "Provider data changed since preview — fetch latest scores and cards again and confirm the new plan.",
      };
    }

    const patches = patchesFromPreviewRows(preview.rows);
    const cardPatches = cardPatchesFromPreviewRows(
      preview.rows,
      liveEdition.id,
      loaded.matches,
    );
    if (patches.length === 0 && cardPatches.length === 0) {
      return {
        ok: false,
        error: preview.message ?? "No final score or card changes to apply.",
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
      };
    }

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
      };
    }

    const message = buildLiveScoresApplySuccessMessage({
      editionName: liveEdition.name,
      editionCode: liveEdition.code,
      lastUpdatedAt: recorded.lastUpdatedAt,
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
      affectedMatchCount: applied.matchesUpdated,
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
      lastUpdatedAt: recorded.lastUpdatedAt,
      message,
      warnings: applied.warnings,
    };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
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
