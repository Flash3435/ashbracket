import type { SupabaseClient } from "@supabase/supabase-js";
import type { PoolActivityFeedRow, PoolActivityType } from "./poolActivityTypes";

const FEED_SELECT = `
  id,
  type,
  body_text,
  metadata_json,
  related_path,
  is_ai_generated,
  created_at,
  participants ( display_name )
`;

function isPoolActivityType(v: string): v is PoolActivityType {
  return (
    v === "participant_joined" ||
    v === "participant_submitted_picks" ||
    v === "participant_updated_picks" ||
    v === "ash_daily_recap"
  );
}

export async function fetchPoolActivityForPool(
  supabase: SupabaseClient,
  poolId: string,
  limit = 20,
): Promise<PoolActivityFeedRow[]> {
  const { data, error } = await supabase
    .from("pool_activity")
    .select(FEED_SELECT)
    .eq("pool_id", poolId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const rel = row.participants as
      | { display_name: string }
      | { display_name: string }[]
      | null;
    const displayName = Array.isArray(rel)
      ? rel[0]?.display_name
      : rel?.display_name;
    const t = row.type as string;
    if (!isPoolActivityType(t)) {
      throw new Error(`Unknown pool_activity.type: ${t}`);
    }
    return {
      id: row.id as string,
      type: t,
      body_text: row.body_text as string,
      metadata_json: (row.metadata_json as Record<string, unknown>) ?? {},
      related_path: (row.related_path as string | null) ?? null,
      is_ai_generated: Boolean(row.is_ai_generated),
      created_at: row.created_at as string,
      participant_display_name: displayName ?? null,
    };
  });
}
