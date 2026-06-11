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
import { applyLiveScoresAndSync } from "@/lib/tournament/liveScores/applyLiveScores";
import { buildLiveScoresApplySuccessMessage } from "@/lib/tournament/liveScores/buildLiveScoresApplyMessage";
import { loadTournamentMatchesForLiveScores } from "@/lib/tournament/liveScores/loadTournamentMatches";
import {
  buildScoreChangePreview,
  patchesFromPreviewRows,
} from "@/lib/tournament/liveScores/matchMapping";
import {
  fetchLiveWorldCupScores,
  getLiveScoresProviderConfig,
} from "@/lib/tournament/liveScores/provider";
import type { ScoreChangePreview } from "@/lib/tournament/liveScores/types";
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
      lastUpdatedAt: string;
      message: string;
      warnings: string[];
    }
  | { ok: false; error: string; warnings?: string[] };

function messageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected error.";
}

function revalidateLiveScoresPaths(): void {
  revalidatePath("/admin/tournament");
  revalidatePath("/admin/tournament/live-scores");
  revalidatePath("/admin/tournament/status");
  revalidatePath("/admin/results");
  revalidatePath("/admin/activity");
  revalidatePath("/rules");
  revalidatePath("/account/activity");
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

    const loaded = await loadTournamentMatchesForLiveScores(supabase, liveEdition.id);
    if ("error" in loaded) {
      return { ok: false, error: loaded.error };
    }

    const fetchedAt = new Date().toISOString();
    const fetchResult = await fetchLiveWorldCupScores(config);
    if (!fetchResult.ok) {
      logAdminRiskAction({
        action: "live_scores_preview",
        userId: user.id,
        userEmail: user.email,
        editionId: liveEdition.id,
        editionCode: liveEdition.code,
        isSimulation: false,
        previewOnly: true,
        detail: fetchResult.error,
      });
      return {
        ok: false,
        error: fetchResult.error,
        configWarning: fetchResult.configWarning,
      };
    }

    const preview = buildScoreChangePreview({
      provider: fetchResult.provider,
      providerConfigured: config.configured,
      configWarning: config.configWarning,
      fetchedAt,
      matches: loaded.matches,
      fixtures: fetchResult.fixtures,
    });

    logAdminRiskAction({
      action: "live_scores_preview",
      userId: user.id,
      userEmail: user.email,
      editionId: liveEdition.id,
      editionCode: liveEdition.code,
      isSimulation: false,
      previewOnly: true,
      affectedMatchCount: preview.summary.willUpdate,
      detail: `provider=${preview.provider} willUpdate=${preview.summary.willUpdate}`,
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

    const loaded = await loadTournamentMatchesForLiveScores(supabase, liveEdition.id);
    if ("error" in loaded) {
      return { ok: false, error: loaded.error };
    }

    const fetchResult = await fetchLiveWorldCupScores(config);
    if (!fetchResult.ok) {
      return { ok: false, error: fetchResult.error };
    }

    const fetchedAt = new Date().toISOString();
    const preview = buildScoreChangePreview({
      provider: fetchResult.provider,
      providerConfigured: config.configured,
      configWarning: config.configWarning,
      fetchedAt,
      matches: loaded.matches,
      fixtures: fetchResult.fixtures,
    });

    if (preview.previewId !== input.previewId) {
      return {
        ok: false,
        error:
          "Provider data changed since preview — fetch latest scores again and confirm the new plan.",
      };
    }

    const patches = patchesFromPreviewRows(preview.rows);
    if (patches.length === 0) {
      return {
        ok: false,
        error: preview.message ?? "No final score changes to apply.",
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
      editionCode: OFFICIAL_EDITION_CODE,
      poolIds,
      patches,
      providerFixtureIdUpdates,
    });

    if (!applied.ok) {
      logAdminRiskAction({
        action: "live_scores_apply",
        userId: user.id,
        userEmail: user.email,
        editionId: liveEdition.id,
        editionCode: liveEdition.code,
        isSimulation: false,
        affectedMatchCount: patches.length,
        affectedPoolCount: poolIds.length,
        detail: applied.error,
      });
      return { ok: false, error: applied.error, warnings: applied.warnings };
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
