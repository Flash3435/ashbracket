import { createClient } from "@/lib/supabase/server";
import { SAMPLE_POOL_ID } from "../config/sample-pool";
import { comparePublicScoringRuleRows } from "./comparePublicScoringRules";
import { labelPublicScoringRule } from "./scoringRulePublicLabels";
import type {
  PoolPrizeTier,
  PublicScoringRuleRow,
  SamplePoolScoringRulesPayload,
} from "../../types/publicScoringRules";

type PoolRulesPublicRowDb = {
  pool_id: string;
  pool_name: string;
  pool_lock_at: string | null;
  entry_fee_cents: number | null;
  prize_distribution_json: unknown;
  group_advance_exact_points: number | string | null;
  group_advance_wrong_slot_points: number | string | null;
};

type ScoringRulesPublicRowDb = PoolRulesPublicRowDb & {
  prediction_kind: string;
  bonus_key: string | null;
  points: number | string;
};

function parsePrizeTiers(raw: unknown): PoolPrizeTier[] {
  if (!raw || !Array.isArray(raw)) return [];
  const out: PoolPrizeTier[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const place = o.place;
    const label = o.label;
    if (typeof place !== "number" || typeof label !== "string") continue;
    const tier: PoolPrizeTier = { place, label };
    if (typeof o.percent === "number") tier.percent = o.percent;
    if (o.remainder === true) tier.remainder = true;
    out.push(tier);
  }
  return out.sort((a, b) => a.place - b.place);
}

function poolMetaFromRow(row: PoolRulesPublicRowDb): Pick<
  SamplePoolScoringRulesPayload,
  | "poolName"
  | "lockAt"
  | "entryFeeCents"
  | "prizeTiers"
  | "groupAdvance"
> {
  const exact = row.group_advance_exact_points;
  const wrong = row.group_advance_wrong_slot_points;
  const groupAdvance =
    exact != null && wrong != null
      ? {
          exactPoints: Number(exact),
          wrongSlotPoints: Number(wrong),
        }
      : null;

  return {
    poolName: row.pool_name,
    lockAt: row.pool_lock_at,
    entryFeeCents: row.entry_fee_cents,
    prizeTiers: parsePrizeTiers(row.prize_distribution_json),
    groupAdvance,
  };
}

export type FetchSamplePoolScoringRulesResult =
  | { ok: true; data: SamplePoolScoringRulesPayload }
  | { ok: false; kind: "empty" }
  | { ok: false; kind: "error"; message: string };

/**
 * Loads public pool rules for the configured sample pool (anon-safe views).
 */
export async function fetchSamplePoolScoringRules(): Promise<FetchSamplePoolScoringRulesResult> {
  try {
    const supabase = await createClient();

    const { data: rulesData, error: rulesError } = await supabase
      .from("scoring_rules_public")
      .select(
        "pool_id, pool_name, pool_lock_at, entry_fee_cents, prize_distribution_json, group_advance_exact_points, group_advance_wrong_slot_points, prediction_kind, bonus_key, points",
      )
      .eq("pool_id", SAMPLE_POOL_ID);

    if (rulesError) {
      return { ok: false, kind: "error", message: rulesError.message };
    }

    const rulesRaw = (rulesData ?? []) as ScoringRulesPublicRowDb[];

    if (rulesRaw.length > 0) {
      const meta = poolMetaFromRow(rulesRaw[0]!);
      const rules: PublicScoringRuleRow[] = rulesRaw
        .map((row) => ({
          predictionKind: row.prediction_kind,
          bonusKey: row.bonus_key,
          points: Number(row.points),
          label: labelPublicScoringRule(row.prediction_kind, row.bonus_key),
        }))
        .sort(comparePublicScoringRuleRows);

      return {
        ok: true,
        data: { ...meta, rules },
      };
    }

    const { data: poolOnly, error: poolErr } = await supabase
      .from("pool_rules_public")
      .select(
        "pool_id, pool_name, pool_lock_at, entry_fee_cents, prize_distribution_json, group_advance_exact_points, group_advance_wrong_slot_points",
      )
      .eq("pool_id", SAMPLE_POOL_ID)
      .maybeSingle();

    if (poolErr) {
      return { ok: false, kind: "error", message: poolErr.message };
    }

    if (!poolOnly) {
      return { ok: false, kind: "empty" };
    }

    return {
      ok: true,
      data: {
        ...poolMetaFromRow(poolOnly as PoolRulesPublicRowDb),
        rules: [],
      },
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
