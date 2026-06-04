import { createServiceRoleClient } from "../../src/lib/supabase/service";
import {
  buildAllPoolMilestoneCandidates,
  type PoolMilestoneCandidate,
} from "./buildPoolMilestoneCandidates";
import { loadRecapFacts } from "./loadRecapFacts";

async function insertMilestoneCandidate(
  poolId: string,
  candidate: PoolMilestoneCandidate,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const metadataJson: Record<string, unknown> = {
    source_key: candidate.sourceKey,
    milestone_label: candidate.milestoneLabel,
    ...candidate.metadata,
  };

  const { error } = await supabase.from("pool_activity").insert({
    pool_id: poolId,
    participant_id: null,
    actor_user_id: null,
    type: "pool_milestone",
    body_text: candidate.bodyText,
    metadata_json: metadataJson,
    related_path: null,
    is_ai_generated: false,
  });

  if (error) {
    if (error.code === "23505") return;
    throw new Error(error.message);
  }
}

/**
 * Idempotent: inserts pool milestone rows when thresholds are met.
 * Duplicate source_key values are ignored via partial unique index.
 */
export async function ensurePoolMilestonesForPool(
  poolId: string,
  nowMs = Date.now(),
): Promise<void> {
  const supabase = createServiceRoleClient();
  const [{ facts }, poolRow] = await Promise.all([
    loadRecapFacts(supabase, poolId),
    supabase.from("pools").select("lock_at").eq("id", poolId).maybeSingle(),
  ]);

  if (poolRow.error) {
    throw new Error(poolRow.error.message);
  }

  const lockAt = (poolRow.data?.lock_at as string | null) ?? null;
  const candidates = buildAllPoolMilestoneCandidates(facts, lockAt, nowMs);

  for (const candidate of candidates) {
    await insertMilestoneCandidate(poolId, candidate);
  }
}
