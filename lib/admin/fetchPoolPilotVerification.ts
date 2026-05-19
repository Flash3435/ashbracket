import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchWcLedgerRecomputeDiagnosticsForPools,
  labelWcLedgerRecomputeTrigger,
  wcLedgerRecomputeFreshnessBadge,
  type WcPoolLedgerRecomputeRow,
} from "./wcLedgerRecomputeDiagnostics";

export type PoolPilotVerificationRow = WcPoolLedgerRecomputeRow & {
  isSimulation: boolean;
  editionCode: string | null;
  editionName: string | null;
  participantCount: number;
  freshness: "never" | "fresh" | "stale";
  lastTriggerLabel: string;
};

export type PoolPilotVerificationSnapshot = {
  livePools: PoolPilotVerificationRow[];
  simulationPools: PoolPilotVerificationRow[];
  loadError: string | null;
};

export async function fetchPoolPilotVerification(
  supabase: SupabaseClient,
): Promise<PoolPilotVerificationSnapshot> {
  const { data: pools, error: pErr } = await supabase
    .from("pools")
    .select("id, name, is_simulation, tournament_edition_id")
    .order("name", { ascending: true });

  if (pErr) {
    return { livePools: [], simulationPools: [], loadError: pErr.message };
  }

  const poolList = pools ?? [];
  const editionIds = [
    ...new Set(
      poolList
        .map((p) => p.tournament_edition_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const editionById = new Map<string, { code: string; name: string }>();
  if (editionIds.length > 0) {
    const { data: editions } = await supabase
      .from("tournament_editions")
      .select("id, code, name")
      .in("id", editionIds);
    for (const e of editions ?? []) {
      editionById.set(e.id as string, {
        code: e.code as string,
        name: e.name as string,
      });
    }
  }

  const ids = poolList.map((p) => p.id as string);
  const { rows: diagRows, error: dErr } =
    await fetchWcLedgerRecomputeDiagnosticsForPools(supabase, ids.length ? ids : null);

  if (dErr) {
    return { livePools: [], simulationPools: [], loadError: dErr };
  }

  const diagById = new Map(diagRows.map((r) => [r.poolId, r]));

  const participantCounts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: parts } = await supabase
      .from("participants")
      .select("pool_id")
      .in("pool_id", ids);
    for (const id of ids) participantCounts.set(id, 0);
    for (const row of parts ?? []) {
      const pid = row.pool_id as string;
      participantCounts.set(pid, (participantCounts.get(pid) ?? 0) + 1);
    }
  }

  const enriched: PoolPilotVerificationRow[] = poolList.map((p) => {
    const id = p.id as string;
    const diag = diagById.get(id);
    const ed = editionById.get(p.tournament_edition_id as string);
    const lastSuccessAt = diag?.lastSuccessAt ?? null;
    return {
      poolId: id,
      poolName: (p.name as string) ?? id,
      lastSuccessAt,
      lastTrigger: diag?.lastTrigger ?? null,
      lastStatus: diag?.lastStatus ?? null,
      isSimulation: Boolean(p.is_simulation),
      editionCode: ed?.code ?? null,
      editionName: ed?.name ?? null,
      participantCount: participantCounts.get(id) ?? 0,
      freshness: wcLedgerRecomputeFreshnessBadge(lastSuccessAt),
      lastTriggerLabel: labelWcLedgerRecomputeTrigger(diag?.lastTrigger),
    };
  });

  return {
    livePools: enriched.filter((r) => !r.isSimulation),
    simulationPools: enriched.filter((r) => r.isSimulation),
    loadError: null,
  };
}
