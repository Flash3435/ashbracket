import type { SupabaseClient } from "@supabase/supabase-js";

type PoolDebugRow = {
  poolId: string;
  poolName: string;
  scoringRuleCount: number;
  groupAdvanceExactPoints: number | null;
  groupAdvanceWrongSlotPoints: number | null;
  pointsLedgerRowCount: number;
};

export type SimulationEditionDebugSummary = {
  groupsResolvedCount: number;
  thirdPlaceAdvancersCount: number;
  roundOf32RowsCount: number;
  knockoutResultRowsCount: number;
  bonusResultRowsCount: number;
  poolDebugRows: PoolDebugRow[];
};

const KNOCKOUT_RESULT_KINDS = [
  "round_of_16",
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "champion",
] as const;

export async function fetchSimulationEditionDebugSummary(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{ summary: SimulationEditionDebugSummary | null; error: string | null }> {
  const [resultsRes, poolsRes] = await Promise.all([
    supabase
      .from("results")
      .select("kind, group_code")
      .eq("edition_id", editionId),
    supabase
      .from("pools")
      .select(
        "id, name, group_advance_exact_points, group_advance_wrong_slot_points, is_simulation",
      )
      .eq("tournament_edition_id", editionId)
      .eq("is_simulation", true)
      .order("name", { ascending: true }),
  ]);

  if (resultsRes.error) return { summary: null, error: resultsRes.error.message };
  if (poolsRes.error) return { summary: null, error: poolsRes.error.message };

  const poolIds = (poolsRes.data ?? []).map((row) => row.id as string);

  let scoringRuleRows: { pool_id: string }[] = [];
  let ledgerRows: { pool_id: string }[] = [];

  if (poolIds.length > 0) {
    const [scoringRulesForPoolsRes, ledgerForPoolsRes] = await Promise.all([
      supabase.from("scoring_rules").select("pool_id").in("pool_id", poolIds),
      supabase.from("points_ledger").select("pool_id").in("pool_id", poolIds),
    ]);

    if (scoringRulesForPoolsRes.error) {
      return { summary: null, error: scoringRulesForPoolsRes.error.message };
    }
    if (ledgerForPoolsRes.error) {
      return { summary: null, error: ledgerForPoolsRes.error.message };
    }

    scoringRuleRows = (scoringRulesForPoolsRes.data ?? []).map((row) => ({
      pool_id: row.pool_id as string,
    }));
    ledgerRows = (ledgerForPoolsRes.data ?? []).map((row) => ({
      pool_id: row.pool_id as string,
    }));
  }

  const scoringRuleCountByPoolId = new Map<string, number>();
  for (const row of scoringRuleRows) {
    scoringRuleCountByPoolId.set(
      row.pool_id,
      (scoringRuleCountByPoolId.get(row.pool_id) ?? 0) + 1,
    );
  }

  const ledgerCountByPoolId = new Map<string, number>();
  for (const row of ledgerRows) {
    ledgerCountByPoolId.set(row.pool_id, (ledgerCountByPoolId.get(row.pool_id) ?? 0) + 1);
  }

  const groupWinnerGroups = new Set<string>();
  const groupRunnerUpGroups = new Set<string>();
  let thirdPlaceAdvancersCount = 0;
  let roundOf32RowsCount = 0;
  let knockoutResultRowsCount = 0;
  let bonusResultRowsCount = 0;

  for (const row of resultsRes.data ?? []) {
    const kind = row.kind as string;
    const groupCode = (row.group_code as string | null) ?? null;
    if (kind === "group_winner" && groupCode) groupWinnerGroups.add(groupCode);
    if (kind === "group_runner_up" && groupCode) groupRunnerUpGroups.add(groupCode);
    if (kind === "third_place_qualifier") thirdPlaceAdvancersCount += 1;
    if (kind === "round_of_32") roundOf32RowsCount += 1;
    if (KNOCKOUT_RESULT_KINDS.includes(kind as (typeof KNOCKOUT_RESULT_KINDS)[number])) {
      knockoutResultRowsCount += 1;
    }
    if (kind === "bonus_pick") bonusResultRowsCount += 1;
  }

  const groupsResolvedCount = [...groupWinnerGroups].filter((groupCode) =>
    groupRunnerUpGroups.has(groupCode),
  ).length;

  return {
    summary: {
      groupsResolvedCount,
      thirdPlaceAdvancersCount,
      roundOf32RowsCount,
      knockoutResultRowsCount,
      bonusResultRowsCount,
      poolDebugRows: (poolsRes.data ?? []).map((row) => ({
        poolId: row.id as string,
        poolName: row.name as string,
        scoringRuleCount: scoringRuleCountByPoolId.get(row.id as string) ?? 0,
        groupAdvanceExactPoints:
          row.group_advance_exact_points == null
            ? null
            : Number(row.group_advance_exact_points),
        groupAdvanceWrongSlotPoints:
          row.group_advance_wrong_slot_points == null
            ? null
            : Number(row.group_advance_wrong_slot_points),
        pointsLedgerRowCount: ledgerCountByPoolId.get(row.id as string) ?? 0,
      })),
    },
    error: null,
  };
}
