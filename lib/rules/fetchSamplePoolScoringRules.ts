import { createClient } from "@/lib/supabase/server";
import { SAMPLE_POOL_ID } from "../config/sample-pool";
import { labelPredictionKind } from "../participant/predictionKindLabels";
import { sortKeyForPredictionKind } from "./scoringRulesOrder";
import type {
  PublicScoringRuleRow,
  SamplePoolScoringRulesPayload,
} from "../../types/publicScoringRules";

type ScoringRulesPublicRowDb = {
  pool_id: string;
  pool_name: string;
  pool_lock_at: string | null;
  prediction_kind: string;
  points: number;
};

export type FetchSamplePoolScoringRulesResult =
  | { ok: true; data: SamplePoolScoringRulesPayload }
  | { ok: false; kind: "empty" }
  | { ok: false; kind: "error"; message: string };

/**
 * Loads `scoring_rules_public` for the configured sample pool (anon-safe).
 */
export async function fetchSamplePoolScoringRules(): Promise<FetchSamplePoolScoringRulesResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("scoring_rules_public")
      .select("pool_id, pool_name, pool_lock_at, prediction_kind, points")
      .eq("pool_id", SAMPLE_POOL_ID);

    if (error) {
      return { ok: false, kind: "error", message: error.message };
    }

    const raw = (data ?? []) as ScoringRulesPublicRowDb[];
    if (raw.length === 0) {
      return { ok: false, kind: "empty" };
    }

    const poolName = raw[0].pool_name;
    const lockAt = raw[0].pool_lock_at;

    const rules: PublicScoringRuleRow[] = raw
      .map((row) => ({
        predictionKind: row.prediction_kind,
        points: Number(row.points),
        label: labelPredictionKind(row.prediction_kind),
      }))
      .sort(
        (a, b) =>
          sortKeyForPredictionKind(a.predictionKind) -
          sortKeyForPredictionKind(b.predictionKind),
      );

    return {
      ok: true,
      data: { poolName, lockAt, rules },
    };
  } catch (e) {
    return {
      ok: false,
      kind: "error",
      message:
        e instanceof Error ? e.message : "Failed to load scoring rules.",
    };
  }
}
