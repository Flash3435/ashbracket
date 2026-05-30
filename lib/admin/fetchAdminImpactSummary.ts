import type { SupabaseClient } from "@supabase/supabase-js";

/** Serializable impact summary for admin UI (server → client). */
export type AdminImpactSummary = {
  modeLabel: "Live" | "Simulation";
  isSimulation: boolean;
  editionId: string | null;
  editionCode: string | null;
  editionName: string | null;
  poolId: string | null;
  poolName: string | null;
  poolCount: number;
  poolNames: string[];
  participantCount: number;
  /** Plain-language bullets shown before the admin confirms. */
  effectLines: string[];
};

async function countParticipantsForPools(
  supabase: SupabaseClient,
  poolIds: string[],
): Promise<number> {
  if (poolIds.length === 0) return 0;
  const { count, error } = await supabase
    .from("participants")
    .select("id", { count: "exact", head: true })
    .in("pool_id", poolIds);
  if (error) {
    console.error("[impactSummary] participant count failed", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function fetchEditionImpactSummary(
  supabase: SupabaseClient,
  editionId: string,
): Promise<AdminImpactSummary | null> {
  const { data: edition, error: edErr } = await supabase
    .from("tournament_editions")
    .select("id, code, name, is_simulation")
    .eq("id", editionId)
    .maybeSingle();

  if (edErr || !edition) return null;

  const isSimulation = Boolean(edition.is_simulation);
  const { data: pools } = await supabase
    .from("pools")
    .select("id, name")
    .eq("tournament_edition_id", editionId)
    .order("name", { ascending: true });

  const poolRows = pools ?? [];
  const poolIds = poolRows.map((p) => p.id as string);
  const poolNames = poolRows.map((p) => (p.name as string) ?? "Pool");
  const participantCount = await countParticipantsForPools(supabase, poolIds);

  const modeLabel = isSimulation ? "Simulation" : "Live";
  const effectLines = isSimulation
    ? [
        `Updates the simulation edition “${edition.name}” only.`,
        `Recalculates scores for ${poolRows.length} simulation pool(s) on this edition — not live pools.`,
        `Live tournament results and live pool standings stay unchanged.`,
      ]
    : [
        `Updates the live official edition “${edition.name}” only.`,
        `Recalculates scores for ${poolRows.length} live pool(s) on this edition.`,
        `Simulation pools and simulation test data are not affected.`,
      ];

  return {
    modeLabel,
    isSimulation,
    editionId: edition.id as string,
    editionCode: edition.code as string,
    editionName: edition.name as string,
    poolId: null,
    poolName: null,
    poolCount: poolRows.length,
    poolNames,
    participantCount,
    effectLines,
  };
}

export async function fetchPoolImpactSummary(
  supabase: SupabaseClient,
  poolId: string,
): Promise<AdminImpactSummary | null> {
  const { data: pool, error } = await supabase
    .from("pools")
    .select("id, name, is_simulation, tournament_edition_id")
    .eq("id", poolId)
    .maybeSingle();

  if (error || !pool?.tournament_edition_id) return null;

  const editionSummary = await fetchEditionImpactSummary(
    supabase,
    pool.tournament_edition_id as string,
  );
  if (!editionSummary) return null;

  const { count } = await supabase
    .from("participants")
    .select("id", { count: "exact", head: true })
    .eq("pool_id", poolId);

  const isSimulation = Boolean(pool.is_simulation);
  const poolName = (pool.name as string) ?? "Pool";

  const effectLines = isSimulation
    ? [
        `Recalculates the leaderboard for simulation pool “${poolName}” only.`,
        `Uses test results from simulation edition “${editionSummary.editionName}”.`,
        `Does not change any live pool standings.`,
      ]
    : [
        `Recalculates the leaderboard for live pool “${poolName}” only.`,
        `Uses live official results from edition “${editionSummary.editionName}”.`,
        `Does not change simulation test pools.`,
      ];

  return {
    ...editionSummary,
    poolId: pool.id as string,
    poolName,
    poolCount: 1,
    poolNames: [poolName],
    participantCount: count ?? 0,
    effectLines,
  };
}

export async function fetchLiveTournamentSyncImpactSummary(
  supabase: SupabaseClient,
): Promise<AdminImpactSummary | null> {
  const { fetchOfficialLiveEdition } = await import("@/lib/tournament/editionScope");
  const edition = await fetchOfficialLiveEdition(supabase);
  if (!edition) return null;

  const base = await fetchEditionImpactSummary(supabase, edition.id);
  if (!base) return null;

  return {
    ...base,
    effectLines: [
      `Reads completed match scores on live edition “${edition.name}” (${edition.code}).`,
      `Rebuilds official derived results and recalculates ${base.poolCount} live pool(s).`,
      `Simulation editions and simulation pools are not touched.`,
    ],
  };
}

export async function fetchBootstrapSimulationImpactSummary(
  supabase: SupabaseClient,
): Promise<AdminImpactSummary> {
  const { data: livePools } = await supabase
    .from("pools")
    .select("id")
    .eq("is_simulation", false);

  const livePoolCount = livePools?.length ?? 0;

  return {
    modeLabel: "Simulation",
    isSimulation: true,
    editionId: null,
    editionCode: null,
    editionName: "(new simulation edition)",
    poolId: null,
    poolName: "(new simulation pool)",
    poolCount: 1,
    poolNames: [],
    participantCount: 0,
    effectLines: [
      "Creates a new simulation edition by copying the live World Cup schedule (teams and matches, no scores).",
      "Creates one new simulation pool tied to that edition.",
      `Does not modify any of the ${livePoolCount} existing live pool(s) or live results.`,
      "Safe for a production pilot when you use test accounts in the new pool only.",
    ],
  };
}
