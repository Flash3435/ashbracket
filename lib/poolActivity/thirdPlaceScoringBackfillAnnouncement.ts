import type { SupabaseClient } from "@supabase/supabase-js";
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

/**
 * Idempotent pool activity note when best-third advancer picks are first scored.
 */
export async function postThirdPlaceScoringBackfillNoticeForPool(
  supabase: SupabaseClient,
  poolId: string,
): Promise<"inserted" | "skipped"> {
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
  supabase: SupabaseClient,
  poolIds: readonly string[],
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const poolId of poolIds) {
    const result = await postThirdPlaceScoringBackfillNoticeForPool(supabase, poolId);
    if (result === "inserted") inserted += 1;
    else skipped += 1;
  }

  return { inserted, skipped };
}
