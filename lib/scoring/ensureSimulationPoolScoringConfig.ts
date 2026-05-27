import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_WORLD_CUP_GROUP_ADVANCE_EXACT_POINTS,
  DEFAULT_WORLD_CUP_GROUP_ADVANCE_WRONG_SLOT_POINTS,
  DEFAULT_WORLD_CUP_SCORING_RULE_ROWS,
  simulationPoolNeedsDefaultScoringConfig,
} from "./worldcupPoolDefaults";

type EnsureSimulationPoolScoringConfigResult =
  | { ok: true; seededPoolIds: string[] }
  | { ok: false; error: string };

export async function ensureSimulationPoolScoringConfig(
  supabase: SupabaseClient,
  poolIds: string[],
): Promise<EnsureSimulationPoolScoringConfigResult> {
  const uniquePoolIds = [...new Set(poolIds.map((poolId) => poolId.trim()).filter(Boolean))];
  if (uniquePoolIds.length === 0) {
    return { ok: true, seededPoolIds: [] };
  }

  const { data: poolRows, error: poolError } = await supabase
    .from("pools")
    .select("id, is_simulation, group_advance_exact_points, group_advance_wrong_slot_points")
    .in("id", uniquePoolIds);

  if (poolError) {
    return { ok: false, error: poolError.message };
  }

  const { count: scoringRuleCount, error: scoringRuleError } = await supabase
    .from("scoring_rules")
    .select("id", { count: "exact", head: true })
    .in("pool_id", uniquePoolIds);

  if (scoringRuleError) {
    return { ok: false, error: scoringRuleError.message };
  }

  const ruleCountsByPoolId = new Map<string, number>();
  if ((scoringRuleCount ?? 0) > 0) {
    const { data: scoringRuleRows, error: scoringRuleRowsError } = await supabase
      .from("scoring_rules")
      .select("pool_id")
      .in("pool_id", uniquePoolIds);
    if (scoringRuleRowsError) {
      return { ok: false, error: scoringRuleRowsError.message };
    }
    for (const row of scoringRuleRows ?? []) {
      const poolId = row.pool_id as string;
      ruleCountsByPoolId.set(poolId, (ruleCountsByPoolId.get(poolId) ?? 0) + 1);
    }
  }

  const targetPools = (poolRows ?? []).filter((row) =>
    simulationPoolNeedsDefaultScoringConfig({
      isSimulation: row.is_simulation === true,
      groupAdvanceExactPoints: row.group_advance_exact_points,
      groupAdvanceWrongSlotPoints: row.group_advance_wrong_slot_points,
      scoringRuleCount: ruleCountsByPoolId.get(row.id as string) ?? 0,
    }),
  );

  if (targetPools.length === 0) {
    return { ok: true, seededPoolIds: [] };
  }

  const targetPoolIds = targetPools.map((row) => row.id as string);

  const { error: updatePoolError } = await supabase
    .from("pools")
    .update({
      group_advance_exact_points: DEFAULT_WORLD_CUP_GROUP_ADVANCE_EXACT_POINTS,
      group_advance_wrong_slot_points: DEFAULT_WORLD_CUP_GROUP_ADVANCE_WRONG_SLOT_POINTS,
    })
    .in("id", targetPoolIds);

  if (updatePoolError) {
    return { ok: false, error: updatePoolError.message };
  }

  const scoringRulePayload = targetPoolIds.flatMap((poolId) =>
    DEFAULT_WORLD_CUP_SCORING_RULE_ROWS.map((row) => ({
      pool_id: poolId,
      prediction_kind: row.predictionKind,
      bonus_key: row.bonusKey,
      points: row.points,
    })),
  );

  const { error: upsertError } = await supabase
    .from("scoring_rules")
    .upsert(scoringRulePayload, {
      onConflict: "pool_id,prediction_kind,bonus_key",
    });

  if (upsertError) {
    return { ok: false, error: upsertError.message };
  }

  return { ok: true, seededPoolIds: targetPoolIds };
}
