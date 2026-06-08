export type PoolActivityType =
  | "participant_joined"
  | "participant_submitted_picks"
  | "participant_updated_picks"
  | "ash_daily_recap"
  | "announcement"
  | "pool_milestone"
  | "pool_insight";

/** Card header label for pool-wide milestone rows. */
export type PoolMilestoneLabel = "MILESTONE" | "DEADLINE" | "POOL UPDATE";

/** Card header label for pool-wide insight rows. */
export type PoolInsightLabel = "POOL INSIGHT";

export type PoolActivityFeedRow = {
  id: string;
  type: PoolActivityType;
  body_text: string;
  metadata_json: Record<string, unknown>;
  related_path: string | null;
  is_ai_generated: boolean;
  created_at: string;
  participant_display_name: string | null;
};
