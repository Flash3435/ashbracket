import type { SupabaseClient } from "@supabase/supabase-js";
import { OFFICIAL_EDITION_CODE } from "@/lib/config/officialTournament";

export type TournamentEditionRow = {
  id: string;
  code: string;
  name: string;
  isSimulation: boolean;
};

export async function fetchEditionByCode(
  supabase: SupabaseClient,
  code: string,
): Promise<TournamentEditionRow | null> {
  const { data, error } = await supabase
    .from("tournament_editions")
    .select("id, code, name, is_simulation")
    .eq("code", code)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id as string,
    code: data.code as string,
    name: data.name as string,
    isSimulation: Boolean(data.is_simulation),
  };
}

export async function fetchOfficialLiveEdition(
  supabase: SupabaseClient,
): Promise<TournamentEditionRow | null> {
  return fetchEditionByCode(supabase, OFFICIAL_EDITION_CODE);
}

export async function fetchPoolEditionScope(
  supabase: SupabaseClient,
  poolId: string,
): Promise<
  | { ok: true; poolId: string; isSimulation: boolean; edition: TournamentEditionRow }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from("pools")
    .select("id, is_simulation, tournament_edition_id")
    .eq("id", poolId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data?.tournament_edition_id) {
    return { ok: false, error: "Pool has no tournament edition assigned." };
  }

  const editionId = data.tournament_edition_id as string;
  const { data: edRow, error: edErr } = await supabase
    .from("tournament_editions")
    .select("id, code, name, is_simulation")
    .eq("id", editionId)
    .maybeSingle();

  if (edErr) return { ok: false, error: edErr.message };
  if (!edRow) {
    return { ok: false, error: "Tournament edition not found for this pool." };
  }

  return {
    ok: true,
    poolId: data.id as string,
    isSimulation: Boolean(data.is_simulation),
    edition: {
      id: edRow.id as string,
      code: edRow.code as string,
      name: edRow.name as string,
      isSimulation: Boolean(edRow.is_simulation),
    },
  };
}

export async function poolIdsForEdition(
  supabase: SupabaseClient,
  editionId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("pools")
    .select("id")
    .eq("tournament_edition_id", editionId);

  if (error) {
    console.error("[editionScope] poolIdsForEdition failed", error.message);
    return [];
  }
  return (data ?? []).map((r) => r.id as string);
}

/** Live (non-simulation) pools for one tournament edition — used by the daily score update. */
export async function livePoolIdsForEdition(
  supabase: SupabaseClient,
  editionId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("pools")
    .select("id")
    .eq("tournament_edition_id", editionId)
    .eq("is_simulation", false);

  if (error) {
    console.error("[editionScope] livePoolIdsForEdition failed", error.message);
    return [];
  }
  return (data ?? []).map((r) => r.id as string);
}

/** @deprecated Prefer {@link livePoolIdsForEdition} so recompute stays edition-scoped. */
export async function livePoolIds(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from("pools")
    .select("id")
    .eq("is_simulation", false);

  if (error) {
    console.error("[editionScope] livePoolIds failed", error.message);
    return [];
  }
  return (data ?? []).map((r) => r.id as string);
}
