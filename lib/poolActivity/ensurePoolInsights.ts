import { createServiceRoleClient } from "../../src/lib/supabase/service";
import {
  buildAllPoolInsightCandidates,
  type PoolInsightCandidate,
} from "./buildPoolInsightCandidates";
import { loadPoolInsightFacts } from "./loadPoolInsightFacts";

async function upsertInsightCandidate(
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

  const { data: existing, error: findErr } = await supabase
    .from("pool_activity")
    .select("id")
    .eq("pool_id", poolId)
    .eq("type", "pool_insight")
    .eq("metadata_json->>source_key", candidate.sourceKey)
    .maybeSingle();

  if (findErr) throw new Error(findErr.message);

  if (existing?.id) {
    const { error: updateErr } = await supabase
      .from("pool_activity")
      .update({
        body_text: candidate.body,
        metadata_json: metadataJson,
      })
      .eq("id", existing.id);

    if (updateErr) throw new Error(updateErr.message);
    return;
  }

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
 * Idempotent: inserts or updates pool insight rows when thresholds are met.
 * Rolling daily insights reuse a stable source_key; body and counts refresh in place.
 */
export async function ensurePoolInsightsForPool(
  poolId: string,
  nowMs = Date.now(),
): Promise<void> {
  const facts = await loadPoolInsightFacts(createServiceRoleClient(), poolId, nowMs);
  const candidates = buildAllPoolInsightCandidates(facts, nowMs);

  for (const candidate of candidates) {
    await upsertInsightCandidate(poolId, candidate);
  }
}
