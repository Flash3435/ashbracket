"use server";

import { createClient } from "@/lib/supabase/server";
import { isGlobalAdmin } from "../../../lib/auth/permissions";
import { OFFICIAL_EDITION_CODE } from "../../../lib/config/officialTournament";
import { syncOfficialTournament } from "../../../lib/tournament/syncOfficialTournament";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * Re-runs official match propagation for **all** pools. Global admins only.
 */
export async function runTournamentSyncAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isGlobalAdmin(supabase))) {
    redirect("/admin");
  }

  const { data: poolRows, error: poolErr } = await supabase
    .from("pools")
    .select("id");

  if (poolErr) {
    redirect(
      `/admin/tournament/status?err=${encodeURIComponent(poolErr.message)}`,
    );
  }

  const poolIds = (poolRows ?? []).map((r) => r.id as string);

  const out = await syncOfficialTournament(supabase, {
    editionCode: OFFICIAL_EDITION_CODE,
    poolIds: poolIds.length > 0 ? poolIds : [],
  });
  revalidatePath("/admin/tournament");
  revalidatePath("/admin/tournament/status");
  if (!out.ok) {
    redirect(
      `/admin/tournament/status?err=${encodeURIComponent(out.error)}`,
    );
  }
  redirect("/admin/tournament/status?ok=1");
}
