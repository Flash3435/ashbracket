"use server";

import { logAdminRiskAction } from "@/lib/admin/adminRiskAuditLog";
import { checkProductionAdminAck } from "@/lib/admin/requireProductionAdminAck";
import { createClient } from "@/lib/supabase/server";
import { isGlobalAdmin } from "../../../../lib/auth/permissions";
import { OFFICIAL_EDITION_CODE } from "../../../../lib/config/officialTournament";
import { fetchEditionImpactSummary } from "../../../../lib/admin/fetchAdminImpactSummary";
import { fetchOfficialLiveEdition, livePoolIds } from "../../../../lib/tournament/editionScope";
import { syncOfficialTournament } from "../../../../lib/tournament/syncOfficialTournament";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type TournamentSyncAckResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Live tournament sync with production confirmation (preferred).
 */
export async function runTournamentSyncWithAckAction(input: {
  productionAcknowledged?: boolean;
}): Promise<TournamentSyncAckResult> {
  const ack = checkProductionAdminAck(input.productionAcknowledged);
  if (!ack.ok) return ack;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isGlobalAdmin(supabase))) {
    return { ok: false, error: "Only global administrators can sync the live tournament." };
  }

  const liveEdition = await fetchOfficialLiveEdition(supabase);
  if (!liveEdition) {
    return { ok: false, error: "Official live tournament edition is not installed." };
  }
  if (liveEdition.isSimulation) {
    return {
      ok: false,
      error: "Official edition is marked simulation — cannot sync live data.",
    };
  }

  const poolIds = await livePoolIds(supabase);
  const impact = await fetchEditionImpactSummary(supabase, liveEdition.id);

  const out = await syncOfficialTournament(supabase, {
    editionCode: OFFICIAL_EDITION_CODE,
    poolIds,
  });

  logAdminRiskAction({
    action: "live_tournament_sync",
    userId: user.id,
    userEmail: user.email,
    editionId: liveEdition.id,
    editionCode: liveEdition.code,
    isSimulation: false,
    affectedPoolCount: poolIds.length,
    affectedParticipantCount: impact?.participantCount,
    detail: out.ok ? "completed" : out.error,
  });

  revalidatePath("/admin/tournament");
  revalidatePath("/admin/tournament/status");
  if (!out.ok) {
    return { ok: false, error: out.error };
  }
  return { ok: true };
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

  const res = await runTournamentSyncWithAckAction({
    productionAcknowledged: true,
  });
  if (!res.ok) {
    redirect(
      `/admin/tournament/status?err=${encodeURIComponent(res.error)}`,
    );
  }
  redirect("/admin/tournament/status?ok=1");
}
