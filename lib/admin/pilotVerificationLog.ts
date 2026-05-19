import type { SupabaseClient } from "@supabase/supabase-js";
import { getDeploymentEnvironment } from "./deploymentEnvironment";

export type PilotVerificationEventType =
  | "standings_snapshot_saved"
  | "live_standings_unchanged_check"
  | "simulation_pool_created"
  | "simulation_results_recomputed";

export async function logPilotVerificationEvent(
  supabase: SupabaseClient,
  input: {
    eventType: PilotVerificationEventType;
    message: string;
    poolId?: string | null;
    payload?: Record<string, unknown>;
    userId?: string | null;
  },
): Promise<void> {
  const payload = {
    env: getDeploymentEnvironment(),
    ...input.payload,
  };
  const { error } = await supabase.from("admin_pilot_verification_events").insert({
    event_type: input.eventType,
    pool_id: input.poolId ?? null,
    message: input.message,
    payload,
    created_by_user_id: input.userId ?? null,
  });
  if (error) {
    console.error("[pilot-verification-event]", error.message, input);
  }
}

export type PilotVerificationEventRow = {
  id: string;
  eventType: string;
  poolId: string | null;
  message: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

export async function fetchRecentPilotVerificationEvents(
  supabase: SupabaseClient,
  limit = 12,
): Promise<{ rows: PilotVerificationEventRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("admin_pilot_verification_events")
    .select("id, event_type, pool_id, message, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { rows: [], error: error.message };

  return {
    rows: (data ?? []).map((r) => ({
      id: r.id as string,
      eventType: r.event_type as string,
      poolId: (r.pool_id as string | null) ?? null,
      message: r.message as string,
      payload: (r.payload as Record<string, unknown> | null) ?? null,
      createdAt: r.created_at as string,
    })),
    error: null,
  };
}
