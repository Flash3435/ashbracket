"use server";

import { effectiveSeriesWinnerId, mergeRound2DisplayFromRound1 } from "@/lib/nhl/nhlPicksProgression";
import {
  fetchActiveNhlEdition,
  fetchNhlSeriesRowsWithPublicLiveOverlay,
  fetchNhlTeamsForEdition,
} from "@/lib/nhl/queries";
import { isNhlEditionLocked } from "@/lib/nhl/nhlEditionLock";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v: string): boolean {
  return UUID_RE.test(v.trim());
}

function friendlyPickError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("picks are locked")) return "Picks are closed for this edition.";
  if (m.includes("edition is not active")) return "This NHL edition is not active.";
  if (m.includes("edition not found")) return "That NHL edition was not found.";
  if (m.includes("series opponent slots")) return "This series does not have both teams set yet.";
  if (m.includes("picked team is not a participant")) return "That team is not in this series.";
  if (m.includes("picked team is not in this edition")) return "That team is not part of this edition.";
  if (m.includes("only round 1")) return "Only Round 1 picks can be saved here.";
  if (m.includes("only round 2")) return "Only Round 2 picks can be saved here.";
  if (m.includes("edition does not match series")) return "Series does not belong to that edition.";
  if (m.includes("series not found")) return "Series was not found.";
  if (m.includes("jwt") || m.includes("not authenticated")) return "You must be signed in to save picks.";
  return raw.length > 160 ? "Could not save your pick. Try again." : raw;
}

export type SaveNhlRound1SeriesPickResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Upserts the current user's Round 1 series winner for one slot.
 * NHL-only table; does not touch World Cup predictions.
 */
export async function saveNhlRound1SeriesPickAction(input: {
  editionId: string;
  seriesId: string;
  pickedTeamId: string;
}): Promise<SaveNhlRound1SeriesPickResult> {
  const editionId = input.editionId?.trim() ?? "";
  const seriesId = input.seriesId?.trim() ?? "";
  const pickedTeamId = input.pickedTeamId?.trim() ?? "";

  if (!isUuid(editionId) || !isUuid(seriesId) || !isUuid(pickedTeamId)) {
    return { ok: false, error: "Invalid pick payload." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in to save picks." };
  }

  const { edition, error: editionErr } = await fetchActiveNhlEdition(supabase);
  if (editionErr || !edition) {
    return { ok: false, error: "No active NHL edition is available right now." };
  }
  if (edition.id !== editionId) {
    return { ok: false, error: "That edition is not the active NHL edition." };
  }
  if (isNhlEditionLocked(edition.lock_at)) {
    return { ok: false, error: "Picks are closed for this edition." };
  }

  const seriesRes = await fetchNhlSeriesRowsWithPublicLiveOverlay(supabase, editionId);

  if (seriesRes.error) {
    return { ok: false, error: "Could not load series for validation." };
  }

  const series = seriesRes.rows.find((r) => r.id === seriesId);
  if (!series || series.round_code !== "R1") {
    return { ok: false, error: "That Round 1 series was not found." };
  }
  if (effectiveSeriesWinnerId(series)) {
    return { ok: false, error: "This series is already decided; Round 1 picks cannot be changed." };
  }
  const hi = series.higher_seed_team_id;
  const lo = series.lower_seed_team_id;
  if (!hi || !lo) {
    return { ok: false, error: "This series does not have both teams set yet." };
  }
  if (pickedTeamId !== hi && pickedTeamId !== lo) {
    return { ok: false, error: "Pick must be one of the two teams in this series." };
  }

  const { error } = await supabase.from("nhl_r1_series_picks").upsert(
    {
      user_id: user.id,
      edition_id: editionId,
      series_id: seriesId,
      picked_team_id: pickedTeamId,
    },
    { onConflict: "user_id,edition_id,series_id" },
  );

  if (error) {
    return { ok: false, error: friendlyPickError(error.message) };
  }

  revalidatePath("/nhl/picks");
  revalidatePath("/nhl/standings");
  return { ok: true };
}

export type SaveNhlRound2SeriesPickResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Upserts the current user's Round 2 series winner for one slot.
 */
export async function saveNhlRound2SeriesPickAction(input: {
  editionId: string;
  seriesId: string;
  pickedTeamId: string;
}): Promise<SaveNhlRound2SeriesPickResult> {
  const editionId = input.editionId?.trim() ?? "";
  const seriesId = input.seriesId?.trim() ?? "";
  const pickedTeamId = input.pickedTeamId?.trim() ?? "";

  if (!isUuid(editionId) || !isUuid(seriesId) || !isUuid(pickedTeamId)) {
    return { ok: false, error: "Invalid pick payload." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in to save picks." };
  }

  const { edition, error: editionErr } = await fetchActiveNhlEdition(supabase);
  if (editionErr || !edition) {
    return { ok: false, error: "No active NHL edition is available right now." };
  }
  if (edition.id !== editionId) {
    return { ok: false, error: "That edition is not the active NHL edition." };
  }
  if (isNhlEditionLocked(edition.lock_at)) {
    return { ok: false, error: "Picks are closed for this edition." };
  }

  await supabase.rpc("sync_nhl_r2_slots_from_r1", { p_edition_id: editionId });

  const [seriesRes, teamsRes] = await Promise.all([
    fetchNhlSeriesRowsWithPublicLiveOverlay(supabase, editionId),
    fetchNhlTeamsForEdition(supabase, editionId),
  ]);

  if (seriesRes.error || teamsRes.error) {
    return { ok: false, error: "Could not load series for validation." };
  }

  const merged = mergeRound2DisplayFromRound1(seriesRes.rows, teamsRes.teams);
  const series = merged.find((r) => r.id === seriesId);
  if (!series || series.round_code !== "R2") {
    return { ok: false, error: "That Round 2 series was not found." };
  }
  const hi = series.higher_seed_team_id;
  const lo = series.lower_seed_team_id;
  if (!hi || !lo) {
    return {
      ok: false,
      error:
        "This Round 2 matchup is not open yet—both feeding Round 1 winners must be recorded in the pool (or try again after the league sync updates).",
    };
  }
  if (pickedTeamId !== hi && pickedTeamId !== lo) {
    return { ok: false, error: "Pick must be one of the two teams in this series." };
  }

  const { error } = await supabase.from("nhl_r2_series_picks").upsert(
    {
      user_id: user.id,
      edition_id: editionId,
      series_id: seriesId,
      picked_team_id: pickedTeamId,
    },
    { onConflict: "user_id,edition_id,series_id" },
  );

  if (error) {
    return { ok: false, error: friendlyPickError(error.message) };
  }

  revalidatePath("/nhl/picks");
  revalidatePath("/nhl/standings");
  return { ok: true };
}
