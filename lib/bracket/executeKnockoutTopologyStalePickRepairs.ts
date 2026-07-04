import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertRepairPlanCanApply,
  repairPlanFingerprint,
  summarizeRepairActions,
  type TopologyStalePickRepairAction,
} from "./planKnockoutTopologyStalePickRepairs";

export type TopologyRepairExecutionMode = "dry_run" | "apply";

export type TopologyRepairExecutionResult = {
  mode: TopologyRepairExecutionMode;
  fingerprint: string;
  actions: TopologyStalePickRepairAction[];
  clearedCount: number;
  summary: ReturnType<typeof summarizeRepairActions>;
};

export async function applyTopologyStalePickClear(
  client: SupabaseClient,
  action: TopologyStalePickRepairAction,
): Promise<void> {
  let query = client
    .from("predictions")
    .delete()
    .eq("pool_id", action.poolId)
    .eq("participant_id", action.participantId)
    .eq("prediction_kind", action.predictionKind)
    .eq("tournament_stage_id", action.tournamentStageId)
    .is("group_code", null)
    .is("bonus_key", null);

  query =
    action.slotKey === null
      ? query.is("slot_key", null)
      : query.eq("slot_key", action.slotKey);

  const { error } = await query;
  if (error) {
    throw new Error(
      `Failed to clear ${action.participantName} ${action.predictionKind} slot ${action.slotKey ?? "null"}: ${error.message}`,
    );
  }
}

export async function executeTopologyStalePickRepairs(input: {
  client: SupabaseClient;
  actions: TopologyStalePickRepairAction[];
  mode: TopologyRepairExecutionMode;
  replan: () => Promise<{ fingerprint: string }>;
}): Promise<TopologyRepairExecutionResult> {
  const fingerprint = repairPlanFingerprint(input.actions);
  const gate = assertRepairPlanCanApply(input.actions);
  if (!gate.ok) {
    throw new Error(gate.reason);
  }

  if (input.mode === "dry_run" || input.actions.length === 0) {
    return {
      mode: input.mode,
      fingerprint,
      actions: input.actions,
      clearedCount: 0,
      summary: summarizeRepairActions(input.actions),
    };
  }

  const verify = await input.replan();
  if (verify.fingerprint !== fingerprint) {
    throw new Error(
      "Refusing apply: audit results changed between planning and mutation.",
    );
  }

  for (const action of input.actions) {
    await applyTopologyStalePickClear(input.client, action);
  }

  return {
    mode: input.mode,
    fingerprint,
    actions: input.actions,
    clearedCount: input.actions.length,
    summary: summarizeRepairActions(input.actions),
  };
}
