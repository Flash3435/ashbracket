import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { PoolActivityFeedRow } from "./poolActivityTypes";
import { THIRD_PLACE_SCORING_BACKFILL_NOTICE } from "@/lib/leaderboard/scoringCorrectionDisplay";

/** Stable dedupe key for the one-time third-place scoring backfill notice. */
export const THIRD_PLACE_SCORING_BACKFILL_2026_SOURCE_KEY =
  "third_place_scoring_backfill_2026";

export function isThirdPlaceScoringBackfillActivity(
  item: Pick<PoolActivityFeedRow, "type" | "metadata_json">,
): boolean {
  if (item.type !== "pool_milestone") return false;
  return item.metadata_json.source_key === THIRD_PLACE_SCORING_BACKFILL_2026_SOURCE_KEY;
}

export function thirdPlaceScoringBackfillActivityTypeLabel(
  item: Pick<PoolActivityFeedRow, "type" | "metadata_json">,
): string | null {
  return isThirdPlaceScoringBackfillActivity(item)
    ? "AshBot · Scoring correction"
    : null;
}

/** Optional test hook — production callers must omit this. */
export type ThirdPlaceBackfillNoticeClientFactory = () => SupabaseClient;

/**
 * Idempotent pool activity note when best-third advancer picks are first scored.
 * Uses the service role so SELECT/INSERT succeed despite SELECT-only authenticated RLS.
 */
export async function postThirdPlaceScoringBackfillNoticeForPool(
  poolId: string,
  createClient: ThirdPlaceBackfillNoticeClientFactory = createServiceRoleClient,
): Promise<"inserted" | "skipped"> {
  const supabase = createClient();

  const { data: existing, error: findErr } = await supabase
    .from("pool_activity")
    .select("id")
    .eq("pool_id", poolId)
    .eq("type", "pool_milestone")
    .eq("metadata_json->>source_key", THIRD_PLACE_SCORING_BACKFILL_2026_SOURCE_KEY)
    .maybeSingle();

  if (findErr) throw new Error(findErr.message);
  if (existing?.id) return "skipped";

  const { error } = await supabase.from("pool_activity").insert({
    pool_id: poolId,
    participant_id: null,
    actor_user_id: null,
    type: "pool_milestone",
    body_text: THIRD_PLACE_SCORING_BACKFILL_NOTICE,
    metadata_json: {
      source_key: THIRD_PLACE_SCORING_BACKFILL_2026_SOURCE_KEY,
      milestone_label: "POOL UPDATE",
      ashbot_system_note: true,
      scoring_correction_kind: "third_place_qualifier",
    },
    related_path: "/rules",
    is_ai_generated: true,
  });

  if (error) {
    if (error.code === "23505") return "skipped";
    throw new Error(error.message);
  }

  return "inserted";
}

export async function postThirdPlaceScoringBackfillNoticesForPools(
  poolIds: readonly string[],
  createClient: ThirdPlaceBackfillNoticeClientFactory = createServiceRoleClient,
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const poolId of poolIds) {
    const result = await postThirdPlaceScoringBackfillNoticeForPool(
      poolId,
      createClient,
    );
    if (result === "inserted") inserted += 1;
    else skipped += 1;
  }

  return { inserted, skipped };
}

/**
 * Best-effort activity feed notice after a successful ledger recompute.
 * Logs failures; never throws — standings success must not be reported as failure.
 */
export async function tryPostThirdPlaceScoringBackfillNoticesForPools(
  poolIds: readonly string[],
  createClient: ThirdPlaceBackfillNoticeClientFactory = createServiceRoleClient,
): Promise<{ inserted: number; skipped: number; error?: string }> {
  try {
    return await postThirdPlaceScoringBackfillNoticesForPools(poolIds, createClient);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[ashbracket:sync] third-place backfill notices failed", {
      poolCount: poolIds.length,
      error: message,
    });
    return { inserted: 0, skipped: 0, error: message };
  }
}
