import type { SupabaseClient } from "@supabase/supabase-js";
import type { PoolActivityFeedRow } from "./poolActivityTypes";

/** Stable dedupe key for the June 2026 live scoring rule adjustment. */
export const SCORING_RULES_UPDATE_2026_SOURCE_KEY =
  "rules_update_2026_third_place_4_most_goals_25";

export const SCORING_RULES_UPDATE_2026_BODY =
  "Scoring update: third-place qualifier picks are now worth 4 points each, and the team-with-most-goals bonus is now worth 25 points. The update keeps the pool balance better now that picks are locked.";

export function isScoringRulesUpdate2026Activity(
  item: Pick<PoolActivityFeedRow, "type" | "metadata_json">,
): boolean {
  if (item.type !== "pool_milestone") return false;
  return item.metadata_json.source_key === SCORING_RULES_UPDATE_2026_SOURCE_KEY;
}

export function scoringRulesUpdate2026ActivityTypeLabel(
  item: Pick<PoolActivityFeedRow, "type" | "metadata_json">,
): string | null {
  return isScoringRulesUpdate2026Activity(item)
    ? "AshBot · Scoring update"
    : null;
}

/**
 * Idempotent pool activity note for the post-lock scoring rule adjustment.
 * One row per pool; reruns are no-ops via milestone source_key unique index.
 */
export async function postScoringRulesUpdateAnnouncementForPool(
  supabase: SupabaseClient,
  poolId: string,
): Promise<"inserted" | "skipped"> {
  const { data: existing, error: findErr } = await supabase
    .from("pool_activity")
    .select("id")
    .eq("pool_id", poolId)
    .eq("type", "pool_milestone")
    .eq("metadata_json->>source_key", SCORING_RULES_UPDATE_2026_SOURCE_KEY)
    .maybeSingle();

  if (findErr) throw new Error(findErr.message);
  if (existing?.id) return "skipped";

  const { error } = await supabase.from("pool_activity").insert({
    pool_id: poolId,
    participant_id: null,
    actor_user_id: null,
    type: "pool_milestone",
    body_text: SCORING_RULES_UPDATE_2026_BODY,
    metadata_json: {
      source_key: SCORING_RULES_UPDATE_2026_SOURCE_KEY,
      milestone_label: "POOL UPDATE",
      ashbot_system_note: true,
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

export async function postScoringRulesUpdateAnnouncementsForPools(
  supabase: SupabaseClient,
  poolIds: readonly string[],
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const poolId of poolIds) {
    const result = await postScoringRulesUpdateAnnouncementForPool(
      supabase,
      poolId,
    );
    if (result === "inserted") inserted += 1;
    else skipped += 1;
  }

  return { inserted, skipped };
}
