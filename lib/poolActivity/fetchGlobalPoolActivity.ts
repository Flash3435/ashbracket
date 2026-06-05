import type { SupabaseClient } from "@supabase/supabase-js";
import type { GlobalPoolActivityFeedRow } from "./globalActivityTypes";
import type { PoolActivityType } from "./poolActivityTypes";

const GLOBAL_FEED_SELECT = `
  id,
  pool_id,
  type,
  body_text,
  metadata_json,
  related_path,
  is_ai_generated,
  created_at,
  participants ( display_name ),
  pools ( name, ashbot_enabled )
`;

function isPoolActivityType(v: string): v is PoolActivityType {
  return (
    v === "participant_joined" ||
    v === "participant_submitted_picks" ||
    v === "participant_updated_picks" ||
    v === "ash_daily_recap" ||
    v === "announcement" ||
    v === "pool_milestone"
  );
}

function parsePoolJoin(
  rel:
    | { name: string; ashbot_enabled: boolean | null }
    | { name: string; ashbot_enabled: boolean | null }[]
    | null,
): { poolName: string; ashbotEnabled: boolean } {
  const row = Array.isArray(rel) ? rel[0] : rel;
  return {
    poolName: row?.name?.trim() || "Pool",
    ashbotEnabled: row?.ashbot_enabled !== false,
  };
}

/**
 * Latest activity across all pools visible to a global admin (`app_admins`).
 * Does not run milestone or recap side effects.
 */
export async function fetchGlobalPoolActivity(
  supabase: SupabaseClient,
  options: { limit?: number; poolId?: string | null } = {},
): Promise<GlobalPoolActivityFeedRow[]> {
  const limit = options.limit ?? 50;
  let query = supabase
    .from("pool_activity")
    .select(GLOBAL_FEED_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  const poolId = options.poolId?.trim();
  if (poolId) {
    query = query.eq("pool_id", poolId);
  }

  const { data, error } = await query;
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
    const { poolName, ashbotEnabled } = parsePoolJoin(
      row.pools as
        | { name: string; ashbot_enabled: boolean | null }
        | { name: string; ashbot_enabled: boolean | null }[]
        | null,
    );
    return {
      id: row.id as string,
      pool_id: row.pool_id as string,
      pool_name: poolName,
      ashbot_enabled: ashbotEnabled,
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
