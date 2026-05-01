"use server";

import { isGlobalAdmin } from "@/lib/auth/permissions";
import { fetchActiveNhlEdition } from "@/lib/nhl/queries";
import { revalidateNhlPublicSurfaces } from "@/lib/nhl/revalidateNhlPublicSurfaces";
import { createClient } from "@/lib/supabase/server";
import type { NhlSeries } from "@/lib/nhl/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v: string): boolean {
  return UUID_RE.test(v.trim());
}

function clampGames(n: unknown): number {
  const x = typeof n === "number" ? n : Number(String(n));
  if (!Number.isFinite(x)) return 0;
  const f = Math.floor(x);
  if (f < 0) return 0;
  if (f > 7) return 7;
  return f;
}

/**
 * Global admin: set wins-by-seed ledger and workflow `status`.
 * Powers public “live” series lines (scores, leads, In progress/Final badges).
 */
export async function recordNhlSeriesLedgerAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isGlobalAdmin(supabase))) {
    return;
  }

  const seriesId = String(formData.get("seriesId") ?? "").trim();
  const statusRaw = String(formData.get("seriesStatus") ?? "").trim() as NhlSeries["status"];

  if (!isUuid(seriesId)) {
    return;
  }

  if (statusRaw !== "pending" && statusRaw !== "in_progress" && statusRaw !== "complete") {
    return;
  }

  const hiWins = clampGames(formData.get("gamesWonHigher"));
  const loWins = clampGames(formData.get("gamesWonLower"));

  const { edition, error: edErr } = await fetchActiveNhlEdition(supabase);
  if (edErr || !edition) {
    return;
  }

  const { data: row, error: sErr } = await supabase
    .from("nhl_series")
    .select("id, edition_id")
    .eq("id", seriesId)
    .maybeSingle();

  if (sErr || !row || row.edition_id !== edition.id) {
    return;
  }

  const { error } = await supabase
    .from("nhl_series")
    .update({
      games_won_by_higher_seed: hiWins,
      games_won_by_lower_seed: loWins,
      status: statusRaw,
    })
    .eq("id", seriesId)
    .eq("edition_id", edition.id);

  if (!error) {
    revalidateNhlPublicSurfaces();
  }
}
