import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolvePoolScoringConfig,
  type ResolvedPoolScoringConfig,
} from "../scoring/poolScoringConfig";

export type PoolScoringDebugSummary = {
  poolId: string;
  poolName: string;
  isSimulation: boolean;
  showPublicRules: boolean;
  resolved: ResolvedPoolScoringConfig;
  scoringRuleCount: number;
  pointsLedgerRowCount: number;
  distinctLedgerDeltas: number[];
  sources: {
    groupAdvance: "pools.columns" | "missing";
    thirdPlace: "scoring_rules.third_place_qualifier" | "missing";
    knockout: "scoring_rules" | "missing";
    bonus: "scoring_rules" | "missing";
  };
};

export async function fetchPoolScoringDebugSummary(
  supabase: SupabaseClient,
  poolId: string,
): Promise<{ summary: PoolScoringDebugSummary | null; error: string | null }> {
  const { data: poolRow, error: poolError } = await supabase
    .from("pools")
    .select(
      "id, name, is_simulation, show_public_rules, group_advance_exact_points, group_advance_wrong_slot_points",
    )
    .eq("id", poolId)
    .maybeSingle();

  if (poolError) return { summary: null, error: poolError.message };
  if (!poolRow) return { summary: null, error: "Pool not found." };

  const [rulesRes, ledgerRes] = await Promise.all([
    supabase
      .from("scoring_rules")
      .select("prediction_kind, bonus_key, points")
      .eq("pool_id", poolId),
    supabase.from("points_ledger").select("points_delta").eq("pool_id", poolId),
  ]);

  if (rulesRes.error) return { summary: null, error: rulesRes.error.message };
  if (ledgerRes.error) return { summary: null, error: ledgerRes.error.message };

  const scoringRules = (rulesRes.data ?? []).map((row) => ({
    predictionKind: row.prediction_kind as string,
    bonusKey: (row.bonus_key as string | null) ?? null,
    points: Number(row.points),
  }));

  const resolved = resolvePoolScoringConfig({
    poolId,
    groupAdvanceExactPoints: poolRow.group_advance_exact_points,
    groupAdvanceWrongSlotPoints: poolRow.group_advance_wrong_slot_points,
    scoringRules,
  });

  const distinctLedgerDeltas = [
    ...new Set(
      (ledgerRes.data ?? [])
        .map((row) => Number(row.points_delta))
        .filter((n) => Number.isFinite(n)),
    ),
  ].sort((a, b) => b - a);

  return {
    summary: {
      poolId,
      poolName: poolRow.name as string,
      isSimulation: poolRow.is_simulation === true,
      showPublicRules: poolRow.show_public_rules === true,
      resolved,
      scoringRuleCount: scoringRules.length,
      pointsLedgerRowCount: ledgerRes.data?.length ?? 0,
      distinctLedgerDeltas,
      sources: {
        groupAdvance: resolved.groupAdvance ? "pools.columns" : "missing",
        thirdPlace: resolved.thirdPlaceQualifierPoints != null
          ? "scoring_rules.third_place_qualifier"
          : "missing",
        knockout:
          Object.keys(resolved.knockoutPointsByKind).length > 0
            ? "scoring_rules"
            : "missing",
        bonus:
          Object.keys(resolved.bonusPointsByKey).length > 0
            ? "scoring_rules"
            : "missing",
      },
    },
    error: null,
  };
}
