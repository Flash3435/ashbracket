import { createServiceRoleClient } from "../../src/lib/supabase/service";
import type { PoolActivityType } from "./poolActivityTypes";

type InsertArgs = {
  poolId: string;
  type: PoolActivityType;
  bodyText: string;
  participantId?: string | null;
  actorUserId?: string | null;
  metadataJson?: Record<string, unknown>;
  relatedPath?: string | null;
  isAiGenerated?: boolean;
};

/**
 * Inserts a feed row using the service role after the caller has verified auth intent.
 */
export async function insertPoolActivityRow(args: InsertArgs): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("pool_activity").insert({
    pool_id: args.poolId,
    participant_id: args.participantId ?? null,
    actor_user_id: args.actorUserId ?? null,
    type: args.type,
    body_text: args.bodyText,
    metadata_json: args.metadataJson ?? {},
    related_path: args.relatedPath ?? null,
    is_ai_generated: args.isAiGenerated ?? false,
  });
  if (error) {
    throw new Error(error.message);
  }
}
