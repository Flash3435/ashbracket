import type { SupabaseClient } from "@supabase/supabase-js";
import { mapPredictionRow } from "../../src/lib/scoring/mapSupabaseRows";
import type { Prediction } from "../../src/types/domain";
import { fetchAllRows } from "../supabase/fetchAllRows";

type PredRow = Parameters<typeof mapPredictionRow>[0];

export const POOL_PREDICTION_TABLE_SELECT =
  "id, pool_id, participant_id, prediction_kind, team_id, tournament_stage_id, group_code, slot_key, bonus_key, value_text, created_at, updated_at";

export type FetchPoolPredictionsResult = {
  predictions: Prediction[];
  error: string | null;
  pageCount: number;
};

export async function fetchPoolPredictions(
  supabase: SupabaseClient,
  args: {
    poolId: string;
    participantIds?: string[];
  },
): Promise<FetchPoolPredictionsResult> {
  const { data, error, pageCount } = await fetchAllRows<PredRow>(
    async ({ from, to }) => {
      let query = supabase
        .from("predictions")
        .select(POOL_PREDICTION_TABLE_SELECT)
        .eq("pool_id", args.poolId)
        .order("id", { ascending: true })
        .range(from, to);

      if (args.participantIds && args.participantIds.length > 0) {
        query = query.in("participant_id", args.participantIds);
      }

      return query;
    },
  );

  if (error) {
    return { predictions: [], error, pageCount };
  }

  return {
    predictions: data.map((row) => mapPredictionRow(row)),
    error: null,
    pageCount,
  };
}
