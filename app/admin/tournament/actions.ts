"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { OFFICIAL_EDITION_CODE } from "../../../lib/config/officialTournament";
import { SAMPLE_POOL_ID } from "../../../lib/config/sample-pool";
import { syncOfficialTournament } from "../../../lib/tournament/syncOfficialTournament";

/**
 * Re-runs official match propagation, rebuilds auto `results` rows (`source = sync`),
 * then recomputes pool standings. Manual locked results are preserved.
 */
export async function runTournamentSyncAction() {
  const supabase = await createClient();
  const out = await syncOfficialTournament(supabase, {
    editionCode: OFFICIAL_EDITION_CODE,
    poolIds: [SAMPLE_POOL_ID],
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
