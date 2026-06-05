import { createServiceRoleClient } from "../../src/lib/supabase/service";
import {
  buildAllPoolInsightCandidates,
  type PoolInsightCandidate,
} from "./buildPoolInsightCandidates";
import { loadPoolInsightFacts } from "./loadPoolInsightFacts";

async function insertInsightCandidate(
  poolId: string,
  candidate: PoolInsightCandidate,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const metadataJson: Record<string, unknown> = {
    source_key: candidate.sourceKey,
    insight_label: candidate.label,
    icon: candidate.icon,
    ...candidate.metadata,
  };

  const { error } = await supabase.from("pool_activity").insert({
    pool_id: poolId,
    participant_id: null,
    actor_user_id: null,
    type: "pool_insight",
    body_text: candidate.body,
    metadata_json: metadataJson,
    related_path: null,
    is_ai_generated: false,
    ...(candidate.createdAt ? { created_at: candidate.createdAt } : {}),
  });

  if (error) {
    if (error.code === "23505") return;
    throw new Error(error.message);
  }
}

/**
 * Idempotent: inserts pool insight rows when thresholds are met.
 * Duplicate source_key values are ignored via partial unique index.
 */
export async function ensurePoolInsightsForPool(
  poolId: string,
  nowMs = Date.now(),
): Promise<void> {
  const facts = await loadPoolInsightFacts(createServiceRoleClient(), poolId, nowMs);
  const candidates = buildAllPoolInsightCandidates(facts, nowMs);

  for (const candidate of candidates) {
    await insertInsightCandidate(poolId, candidate);
  }
}
