"use server";

import { logAdminRiskAction } from "@/lib/admin/adminRiskAuditLog";
import { checkProductionAdminAck } from "@/lib/admin/requireProductionAdminAck";
import { createClient } from "@/lib/supabase/server";
import { isGlobalAdmin } from "../../../../lib/auth/permissions";
import { OFFICIAL_EDITION_CODE } from "../../../../lib/config/officialTournament";
import { fetchEditionImpactSummary } from "../../../../lib/admin/fetchAdminImpactSummary";
import { fetchOfficialLiveEdition, livePoolIds } from "../../../../lib/tournament/editionScope";
import {
  buildLiveDailyUpdateSuccessMessage,
  recordLiveDailyUpdateStatus,
} from "@/lib/tournament/liveDailyUpdateStatus";
import type { SyncOfficialTournamentSummary } from "@/lib/tournament/syncOfficialTournament";
import { syncOfficialTournament } from "../../../../lib/tournament/syncOfficialTournament";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type LiveDailyUpdateResult =
  | {
      ok: true;
      editionId: string;
      editionCode: string;
      editionName: string;
      summary: SyncOfficialTournamentSummary;
      lastUpdatedAt: string;
      message: string;
    }
  | { ok: false; error: string };

export type TournamentSyncAckResult = LiveDailyUpdateResult;

function messageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected error.";
}

/**
 * One-step live daily update: sync match scores → rebuild derived results → recompute live pools.
 * Live edition and live pools only; simulation is never touched.
 */
export async function runLiveDailyUpdateAction(input: {
  productionAcknowledged?: boolean;
}): Promise<LiveDailyUpdateResult> {
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
        error: "Only global administrators can update live scores and standings.",
      };
    }

    const liveEdition = await fetchOfficialLiveEdition(supabase);
    if (!liveEdition) {
      return { ok: false, error: "Official live tournament edition is not installed." };
    }
    if (liveEdition.isSimulation) {
      return {
        ok: false,
        error:
          "Official edition is marked simulation — refusing to run the live daily update.",
      };
    }

    const poolIds = await livePoolIds(supabase);
    const impact = await fetchEditionImpactSummary(supabase, liveEdition.id);

    const out = await syncOfficialTournament(supabase, {
      editionCode: OFFICIAL_EDITION_CODE,
      poolIds,
    });

    if (!out.ok) {
      logAdminRiskAction({
        action: "live_daily_update",
        userId: user.id,
        userEmail: user.email,
        editionId: liveEdition.id,
        editionCode: liveEdition.code,
        isSimulation: false,
        affectedPoolCount: poolIds.length,
        affectedParticipantCount: impact?.participantCount,
        detail: out.error,
      });
      return { ok: false, error: out.error };
    }

    const recorded = await recordLiveDailyUpdateStatus(
      supabase,
      liveEdition.id,
      out.summary,
    );
    if (!recorded.ok) {
      return {
        ok: false,
        error: `Standings updated but could not save last-update time: ${recorded.error}`,
      };
    }

    const message = buildLiveDailyUpdateSuccessMessage({
      summary: out.summary,
      editionName: liveEdition.name,
      editionCode: liveEdition.code,
      lastUpdatedAt: recorded.lastUpdatedAt,
    });

    logAdminRiskAction({
      action: "live_daily_update",
      userId: user.id,
      userEmail: user.email,
      editionId: liveEdition.id,
      editionCode: liveEdition.code,
      isSimulation: false,
      affectedPoolCount: poolIds.length,
      affectedParticipantCount: impact?.participantCount,
      detail: message,
    });

    revalidatePath("/admin/tournament");
    revalidatePath("/admin/tournament/status");
    revalidatePath("/admin/results");
    revalidatePath("/rules");
    revalidatePath("/pool/[poolId]", "layout");

    return {
      ok: true,
      editionId: liveEdition.id,
      editionCode: liveEdition.code,
      editionName: liveEdition.name,
      summary: out.summary,
      lastUpdatedAt: recorded.lastUpdatedAt,
      message,
    };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

/** @deprecated Prefer `runLiveDailyUpdateAction`. Kept for existing callers. */
export async function runTournamentSyncWithAckAction(input: {
  productionAcknowledged?: boolean;
}): Promise<TournamentSyncAckResult> {
  return runLiveDailyUpdateAction(input);
}

/**
 * Legacy form action — redirects after sync. Global admins only.
 */
export async function runTournamentSyncAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isGlobalAdmin(supabase))) {
    redirect("/admin");
  }

  const liveEdition = await fetchOfficialLiveEdition(supabase);
  if (!liveEdition) {
    redirect(
      `/admin/tournament/status?err=${encodeURIComponent("Official live tournament edition is not installed.")}`,
    );
  }
  if (liveEdition.isSimulation) {
    redirect(
      `/admin/tournament/status?err=${encodeURIComponent("Official edition is marked simulation — cannot sync live data.")}`,
    );
  }

  const res = await runLiveDailyUpdateAction({
    productionAcknowledged: true,
  });
  if (!res.ok) {
    redirect(`/admin/tournament/status?err=${encodeURIComponent(res.error)}`);
  }
  redirect("/admin/tournament/status?ok=1");
}
