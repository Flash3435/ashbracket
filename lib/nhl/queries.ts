import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_noStore as noStore } from "next/cache";
import {
  fetchNhleBracketJsonForOverlay,
  overlayRound1SeriesRowsFromBracket,
} from "./nhleBracketOverlay";
import { syncWinnerDisplayFieldsFromSeeds } from "./nhlSeriesRowLabels";
import type { NhlEdition, NhlSeries, NhlSeriesRow, NhlStandingsRow, NhlTeam } from "./types";

export async function fetchActiveNhlEdition(
  supabase: SupabaseClient,
): Promise<{ edition: NhlEdition | null; error: string | null }> {
  const { data, error } = await supabase
    .from("nhl_editions")
    .select(
      "id, slug, name, season_label, is_active, lock_at, created_at, updated_at",
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { edition: null, error: error.message };
  }
  return { edition: data as NhlEdition | null, error: null };
}

export async function fetchAllNhlEditions(
  supabase: SupabaseClient,
): Promise<{ editions: NhlEdition[]; error: string | null }> {
  const { data, error } = await supabase
    .from("nhl_editions")
    .select(
      "id, slug, name, season_label, is_active, lock_at, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return { editions: [], error: error.message };
  }
  return { editions: (data ?? []) as NhlEdition[], error: null };
}

export async function fetchNhlTeamSlugsForEdition(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{ slugs: string[]; error: string | null }> {
  const { data, error } = await supabase
    .from("nhl_teams")
    .select("team_slug")
    .eq("edition_id", editionId);

  if (error) {
    return { slugs: [], error: error.message };
  }
  return { slugs: (data ?? []).map((r) => (r as { team_slug: string }).team_slug), error: null };
}

export async function countNhlTeamsForEdition(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{ count: number; error: string | null }> {
  const { count, error } = await supabase
    .from("nhl_teams")
    .select("id", { count: "exact", head: true })
    .eq("edition_id", editionId);

  if (error) {
    return { count: 0, error: error.message };
  }
  return { count: count ?? 0, error: null };
}

export async function countNhlSeriesForEdition(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{ count: number; error: string | null }> {
  const { count, error } = await supabase
    .from("nhl_series")
    .select("id", { count: "exact", head: true })
    .eq("edition_id", editionId);

  if (error) {
    return { count: 0, error: error.message };
  }
  return { count: count ?? 0, error: null };
}

export async function fetchNhlTeamsForEdition(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{ teams: NhlTeam[]; error: string | null }> {
  const { data, error } = await supabase
    .from("nhl_teams")
    .select(
      "id, edition_id, team_name, team_slug, abbreviation, conference, division, seed, logo_path, is_active, created_at",
    )
    .eq("edition_id", editionId)
    .order("conference", { ascending: true })
    .order("seed", { ascending: true, nullsFirst: false })
    .order("abbreviation", { ascending: true });

  if (error) {
    return { teams: [], error: error.message };
  }
  return { teams: (data ?? []) as NhlTeam[], error: null };
}

function teamLabel(
  teamsById: Map<string, NhlTeam>,
  id: string | null,
): {
  name: string | null;
  abbr: string | null;
  slug: string | null;
  logo_path: string | null;
} {
  if (!id) return { name: null, abbr: null, slug: null, logo_path: null };
  const t = teamsById.get(id);
  return {
    name: t?.team_name ?? null,
    abbr: t?.abbreviation ?? null,
    slug: t?.team_slug ?? null,
    logo_path: t?.logo_path ?? null,
  };
}

export async function fetchNhlSeriesRowsForEdition(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{ rows: NhlSeriesRow[]; error: string | null }> {
  const [{ data: seriesData, error: seriesErr }, { data: teamData, error: teamErr }] =
    await Promise.all([
      supabase
        .from("nhl_series")
        .select(
          "id, edition_id, round_code, round_order, side_or_conference, slot_index, higher_seed_team_id, lower_seed_team_id, winner_team_id, games_won_by_higher_seed, games_won_by_lower_seed, best_of, status, starts_at, ends_at, created_at, updated_at",
        )
        .eq("edition_id", editionId)
        .order("round_order", { ascending: true })
        .order("side_or_conference", { ascending: true, nullsFirst: true })
        .order("slot_index", { ascending: true }),
      supabase
        .from("nhl_teams")
        .select("id, edition_id, team_name, team_slug, abbreviation, conference, division, seed, logo_path, is_active, created_at")
        .eq("edition_id", editionId),
    ]);

  if (seriesErr) {
    return { rows: [], error: seriesErr.message };
  }
  if (teamErr) {
    return { rows: [], error: teamErr.message };
  }

  const teams = (teamData ?? []) as NhlTeam[];
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const series = (seriesData ?? []) as NhlSeries[];

  const rows: NhlSeriesRow[] = series.map((s) => {
    const hi = teamLabel(teamsById, s.higher_seed_team_id);
    const lo = teamLabel(teamsById, s.lower_seed_team_id);
    const w = teamLabel(teamsById, s.winner_team_id);
    return {
      ...s,
      higher_team_name: hi.name,
      higher_team_abbr: hi.abbr,
      higher_team_slug: hi.slug,
      higher_team_logo_path: hi.logo_path,
      lower_team_name: lo.name,
      lower_team_abbr: lo.abbr,
      lower_team_slug: lo.slug,
      lower_team_logo_path: lo.logo_path,
      winner_team_name: w.name,
      winner_team_abbr: w.abbr,
      winner_team_slug: w.slug,
      winner_team_logo_path: w.logo_path,
    };
  });

  return { rows, error: null };
}

/**
 * Same as {@link fetchNhlSeriesRowsForEdition}, but merges **Round 1** wins / status /
 * `winner_team_id` from the public NHLE playoff-bracket API when available (no DB write).
 * Use on public `/nhl` and `/nhl/picks` for SSR. Client may still call `/api/nhl/round1-live-overlay` when present.
 */
export async function fetchNhlSeriesRowsWithPublicLiveOverlay(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{ rows: NhlSeriesRow[]; error: string | null }> {
  noStore();
  const res = await fetchNhlSeriesRowsForEdition(supabase, editionId);
  if (res.error || res.rows.length === 0) {
    return res;
  }
  const bracket = await fetchNhleBracketJsonForOverlay();
  if (!bracket) {
    return res;
  }
  try {
    const merged = overlayRound1SeriesRowsFromBracket(res.rows, bracket);
    return { rows: merged.map(syncWinnerDisplayFieldsFromSeeds), error: null };
  } catch {
    return res;
  }
}

/** Current user's Round 1 picks for an edition (RLS: own rows only). */
export async function fetchNhlR1PicksForEdition(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{
  pickBySeriesId: Record<string, string>;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("nhl_r1_series_picks")
    .select("series_id, picked_team_id")
    .eq("edition_id", editionId);

  if (error) {
    return { pickBySeriesId: {}, error: error.message };
  }
  const pickBySeriesId: Record<string, string> = {};
  for (const row of data ?? []) {
    const r = row as { series_id: string; picked_team_id: string };
    pickBySeriesId[r.series_id] = r.picked_team_id;
  }
  return { pickBySeriesId, error: null };
}

export async function fetchNhlMembershipForUserEdition(
  supabase: SupabaseClient,
  userId: string,
  editionId: string,
): Promise<{ membershipId: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from("nhl_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("edition_id", editionId)
    .maybeSingle();

  if (error) {
    return { membershipId: null, error: error.message };
  }
  const id = data?.id as string | undefined;
  return { membershipId: id ?? null, error: null };
}

/** Series with a recorded winner (any round) — used for standings messaging. */
export async function countNhlSeriesWithWinnerForEdition(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{ count: number; error: string | null }> {
  const { count, error } = await supabase
    .from("nhl_series")
    .select("id", { count: "exact", head: true })
    .eq("edition_id", editionId)
    .not("winner_team_id", "is", null);

  if (error) {
    return { count: 0, error: error.message };
  }
  return { count: count ?? 0, error: null };
}

function mapRpcStandingsRow(raw: Record<string, unknown>): NhlStandingsRow | null {
  const rank = raw.rank;
  const user_id = raw.user_id;
  const entry_name = raw.entry_name;
  const total_points = raw.total_points;
  const correct_picks = raw.correct_picks;
  const pending_decisions = raw.pending_decisions;
  const pick_count = raw.pick_count;
  const status = raw.status;

  if (
    typeof user_id !== "string" ||
    typeof entry_name !== "string" ||
    typeof status !== "string"
  ) {
    return null;
  }

  const rankNum = typeof rank === "number" ? rank : Number(rank);
  const pointsNum = typeof total_points === "number" ? total_points : Number(total_points);
  const correctNum = typeof correct_picks === "number" ? correct_picks : Number(correct_picks);
  const pendingNum =
    typeof pending_decisions === "number" ? pending_decisions : Number(pending_decisions);
  const pickCountNum = typeof pick_count === "number" ? pick_count : Number(pick_count);

  if (
    !Number.isFinite(rankNum) ||
    !Number.isFinite(pointsNum) ||
    !Number.isFinite(correctNum) ||
    !Number.isFinite(pendingNum) ||
    !Number.isFinite(pickCountNum)
  ) {
    return null;
  }

  if (status !== "no_picks" && status !== "in_progress" && status !== "complete") {
    return null;
  }

  return {
    rank: rankNum,
    user_id,
    entry_name,
    total_points: pointsNum,
    correct_picks: correctNum,
    pending_decisions: pendingNum,
    pick_count: pickCountNum,
    status,
  };
}

/**
 * NHL-only leaderboard for an edition. Uses SECURITY DEFINER RPC (see migration
 * `20260422180000_nhl_standings_rpc.sql`); safe for anon/authenticated without exposing raw picks.
 */
export async function fetchNhlEditionStandings(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{ rows: NhlStandingsRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("fetch_nhl_edition_standings", {
    p_edition_id: editionId,
  });

  if (error) {
    return { rows: [], error: error.message };
  }

  const rows: NhlStandingsRow[] = [];
  for (const raw of data ?? []) {
    const mapped = mapRpcStandingsRow(raw as Record<string, unknown>);
    if (mapped) {
      rows.push(mapped);
    }
  }
  return { rows, error: null };
}
