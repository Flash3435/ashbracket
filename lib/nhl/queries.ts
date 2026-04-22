import type { SupabaseClient } from "@supabase/supabase-js";
import type { NhlEdition, NhlSeries, NhlSeriesRow, NhlTeam } from "./types";

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
): { name: string | null; abbr: string | null } {
  if (!id) return { name: null, abbr: null };
  const t = teamsById.get(id);
  return {
    name: t?.team_name ?? null,
    abbr: t?.abbreviation ?? null,
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
      lower_team_name: lo.name,
      lower_team_abbr: lo.abbr,
      winner_team_name: w.name,
      winner_team_abbr: w.abbr,
    };
  });

  return { rows, error: null };
}
