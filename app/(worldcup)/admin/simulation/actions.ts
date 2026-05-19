"use server";

import { logAdminRiskAction } from "@/lib/admin/adminRiskAuditLog";
import { logPilotVerificationEvent } from "@/lib/admin/pilotVerificationLog";
import { fetchEditionImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import { checkProductionAdminAck } from "@/lib/admin/requireProductionAdminAck";
import { isGlobalAdmin } from "@/lib/auth/permissions";
import { OFFICIAL_EDITION_CODE } from "@/lib/config/officialTournament";
import { poolIdsForEdition } from "@/lib/tournament/editionScope";
import { syncOfficialTournament } from "@/lib/tournament/syncOfficialTournament";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type BootstrapSimulationPoolResult =
  | { ok: true; poolId: string; editionId: string; editionCode: string }
  | { ok: false; error: string };

/**
 * Clone the live WC schedule into a simulation edition and create a simulation pool.
 */
export async function bootstrapSimulationPoolAction(input: {
  poolName: string;
  joinCode?: string | null;
  isPublic?: boolean;
  productionAcknowledged?: boolean;
}): Promise<BootstrapSimulationPoolResult> {
  const ack = checkProductionAdminAck(input.productionAcknowledged);
  if (!ack.ok) return ack;
  const name = input.poolName.trim();
  if (!name) {
    return { ok: false, error: "Pool name is required." };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !(await isGlobalAdmin(supabase))) {
      return {
        ok: false,
        error: "Only global administrators can create simulation pools.",
      };
    }

    const { data: rows, error } = await supabase.rpc("bootstrap_simulation_pool", {
      p_pool_name: name,
      p_source_edition_code: OFFICIAL_EDITION_CODE,
      p_join_code: input.joinCode?.trim() || null,
      p_is_public: Boolean(input.isPublic),
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    const row = (rows as { pool_id: string; edition_id: string; edition_code: string }[] | null)?.[0];
    if (!row?.pool_id || !row?.edition_id) {
      return { ok: false, error: "Simulation pool was not created." };
    }

    revalidatePath("/admin");
    revalidatePath("/admin/simulation");
    revalidatePath(`/admin/pools/${row.pool_id}`);
    revalidatePath(`/admin/simulation/editions/${row.edition_id}/results`);

    logAdminRiskAction({
      action: "bootstrap_simulation_pool",
      userId: user.id,
      userEmail: user.email,
      editionId: row.edition_id,
      editionCode: row.edition_code,
      isSimulation: true,
      poolId: row.pool_id,
      poolName: name,
      affectedPoolCount: 1,
      detail: "bootstrap_simulation_pool RPC",
    });

    await logPilotVerificationEvent(supabase, {
      eventType: "simulation_pool_created",
      poolId: row.pool_id,
      userId: user.id,
      message: `Created simulation pool “${name}” (edition ${row.edition_code}).`,
      payload: { editionId: row.edition_id, editionCode: row.edition_code },
    });

    revalidatePath("/admin/pilot");

    return {
      ok: true,
      poolId: row.pool_id,
      editionId: row.edition_id,
      editionCode: row.edition_code,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not create simulation pool.",
    };
  }
}

/**
 * Sync match scores → results for a simulation edition; recompute simulation pools only.
 */
export type SimulationSyncAckResult =
  | { ok: true }
  | { ok: false; error: string };

export async function runSimulationEditionSyncWithAckAction(input: {
  editionCode: string;
  productionAcknowledged?: boolean;
}): Promise<SimulationSyncAckResult> {
  const ack = checkProductionAdminAck(input.productionAcknowledged);
  if (!ack.ok) return ack;

  const editionCode = input.editionCode.trim();
  if (!editionCode) {
    return { ok: false, error: "Edition code is required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isGlobalAdmin(supabase))) {
    return { ok: false, error: "Only global administrators can run simulation sync." };
  }

  const { data: edition, error: edErr } = await supabase
    .from("tournament_editions")
    .select("id, code, name, is_simulation")
    .eq("code", editionCode)
    .maybeSingle();

  if (edErr || !edition) {
    return { ok: false, error: edErr?.message ?? "Edition not found." };
  }

  if (!edition.is_simulation) {
    return {
      ok: false,
      error: "Refusing to sync a live edition from the simulation workflow.",
    };
  }

  const editionId = edition.id as string;
  const poolIds = await poolIdsForEdition(supabase, editionId);
  const impact = await fetchEditionImpactSummary(supabase, editionId);

  const out = await syncOfficialTournament(supabase, {
    editionCode,
    poolIds,
  });

  logAdminRiskAction({
    action: "simulation_edition_sync",
    userId: user.id,
    userEmail: user.email,
    editionId,
    editionCode: edition.code as string,
    isSimulation: true,
    affectedPoolCount: poolIds.length,
    affectedParticipantCount: impact?.participantCount,
    detail: out.ok ? "completed" : out.error,
  });

  revalidatePath("/admin/simulation");
  revalidatePath(`/admin/simulation/editions/${editionId}/results`);

  if (!out.ok) {
    return { ok: false, error: out.error };
  }
  return { ok: true };
}

export async function runSimulationEditionSyncFormAction(formData: FormData) {
  const editionCode = String(formData.get("editionCode") ?? "").trim();
  if (!editionCode) {
    redirect("/admin/simulation?err=Missing%20edition%20code");
  }
  const res = await runSimulationEditionSyncWithAckAction({
    editionCode,
    productionAcknowledged: true,
  });
  if (!res.ok) {
    redirect(`/admin/simulation?err=${encodeURIComponent(res.error)}`);
  }
  redirect("/admin/simulation?ok=1");
}

/** @deprecated Prefer runSimulationEditionSyncWithAckAction from the admin UI. */
export async function runSimulationEditionSyncAction(editionCode: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isGlobalAdmin(supabase))) {
    redirect("/admin");
  }

  const { data: edition, error: edErr } = await supabase
    .from("tournament_editions")
    .select("id, is_simulation")
    .eq("code", editionCode.trim())
    .maybeSingle();

  if (edErr || !edition) {
    redirect(
      `/admin/simulation?err=${encodeURIComponent(edErr?.message ?? "Edition not found.")}`,
    );
  }

  if (!edition.is_simulation) {
    redirect(
      `/admin/simulation?err=${encodeURIComponent("Refusing to sync a live edition from the simulation workflow.")}`,
    );
  }

  const res = await runSimulationEditionSyncWithAckAction({
    editionCode: editionCode.trim(),
    productionAcknowledged: true,
  });
  if (!res.ok) {
    redirect(`/admin/simulation?err=${encodeURIComponent(res.error)}`);
  }
  redirect("/admin/simulation?ok=1");
}
