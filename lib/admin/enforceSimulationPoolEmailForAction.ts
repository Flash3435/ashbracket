import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminRiskAction } from "./adminRiskAuditLog";
import {
  enforceSimulationPoolEmailPolicy,
  logSimulationPoolEmailAttempt,
} from "./simulationPoolEmailPolicy";

/** Gate outbound email for a pool; logs blocked attempts. */
export async function gateSimulationPoolOutboundEmail(input: {
  supabase: SupabaseClient;
  poolId: string;
  poolName?: string | null;
  action: AdminRiskAction;
  userId: string | null;
  userEmail?: string | null;
  recipientCount?: number;
  productionAcknowledged?: boolean;
  simulationEmailAcknowledged?: boolean;
  typedConfirmationPhrase?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await enforceSimulationPoolEmailPolicy(input);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true };
}

export function logSimulationPoolEmailSuccess(input: {
  action: AdminRiskAction;
  userId: string | null;
  userEmail?: string | null;
  poolId: string;
  poolName?: string | null;
  isSimulationPool: boolean;
  overrideEnabled: boolean;
  recipientCount?: number;
  detail?: string;
}): void {
  logSimulationPoolEmailAttempt({
    action: input.action,
    userId: input.userId,
    userEmail: input.userEmail,
    poolId: input.poolId,
    poolName: input.poolName,
    isSimulationPool: input.isSimulationPool,
    overrideEnabled: input.overrideEnabled,
    blocked: false,
    recipientCount: input.recipientCount,
    detail: input.detail,
  });
}
