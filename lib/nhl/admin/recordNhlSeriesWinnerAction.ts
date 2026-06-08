"use server";

import { isGlobalAdmin } from "@/lib/auth/permissions";
import { fetchActiveNhlEdition } from "@/lib/nhl/queries";
import { revalidateNhlPublicSurfaces } from "@/lib/nhl/revalidateNhlPublicSurfaces";
import { createClient } from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v: string): boolean {
  return UUID_RE.test(v.trim());
}

/**
 * Global admin: set or clear `nhl_series.winner_team_id` for scoring. Marks series `complete` when a winner is set, `pending` when cleared.
 */
export async function recordNhlSeriesWinnerAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isGlobalAdmin(supabase))) {
    return;
  }

  const seriesId = String(formData.get("seriesId") ?? "").trim();
  const winnerRaw = String(formData.get("winnerTeamId") ?? "").trim();

  if (!isUuid(seriesId)) {
    return;
  }

  const { edition, error: edErr } = await fetchActiveNhlEdition(supabase);
  if (edErr || !edition) {
    return;
  }

  const { data: series, error: sErr } = await supabase
    .from("nhl_series")
    .select("id, edition_id, higher_seed_team_id, lower_seed_team_id")
    .eq("id", seriesId)
    .maybeSingle();

  if (sErr || !series || series.edition_id !== edition.id) {
    return;
  }

  const hi = series.higher_seed_team_id as string | null;
  const lo = series.lower_seed_team_id as string | null;

  if (!winnerRaw) {
    const { error } = await supabase
      .from("nhl_series")
      .update({
        winner_team_id: null,
        status: "pending",
      })
      .eq("id", seriesId)
      .eq("edition_id", edition.id);

    if (!error) {
      revalidateNhlPublicSurfaces();
    }
    return;
  }

  if (!isUuid(winnerRaw)) {
    return;
  }

  if (!hi || !lo || (winnerRaw !== hi && winnerRaw !== lo)) {
    return;
  }

  const { error } = await supabase
    .from("nhl_series")
    .update({
      winner_team_id: winnerRaw,
      status: "complete",
    })
    .eq("id", seriesId)
    .eq("edition_id", edition.id);

  if (!error) {
    revalidateNhlPublicSurfaces();
  }
}
