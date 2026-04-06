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

type ScoringRulesPublicRowDb = {
  pool_id: string;
  pool_name: string;
  pool_lock_at: string | null;
  prediction_kind: string;
  bonus_key?: string | null;
  points: number | string;
  entry_fee_cents?: number | null;
  prize_distribution_json?: unknown;
  group_advance_exact_points?: number | string | null;
  group_advance_wrong_slot_points?: number | string | null;
};

const FULL_RULES_SELECT =
  "pool_id, pool_name, pool_lock_at, entry_fee_cents, prize_distribution_json, group_advance_exact_points, group_advance_wrong_slot_points, prediction_kind, bonus_key, points";

const LEGACY_RULES_SELECT =
  "pool_id, pool_name, pool_lock_at, prediction_kind, points";

const POOL_RULES_META_SELECT =
  "pool_id, pool_name, pool_lock_at, entry_fee_cents, prize_distribution_json, group_advance_exact_points, group_advance_wrong_slot_points";

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

function scoringViewMissingNewColumns(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("entry_fee_cents") ||
    m.includes("prize_distribution_json") ||
    m.includes("group_advance_exact_points") ||
    m.includes("group_advance_wrong_slot_points") ||
    m.includes("bonus_key")
  );
}

function hasExtendedPoolColumnsOnRow(
  row: ScoringRulesPublicRowDb | undefined,
): boolean {
  return (
    row != null &&
    typeof row === "object" &&
    "entry_fee_cents" in row &&
    row.entry_fee_cents !== undefined
  );
}

function metaFromFirstScoringRow(
  row: ScoringRulesPublicRowDb | undefined,
): Pick<
  SamplePoolScoringRulesPayload,
  "poolName" | "lockAt" | "entryFeeCents" | "prizeTiers" | "groupAdvance"
> {
  if (!row) {
    return {
      poolName: "",
      lockAt: null,
      entryFeeCents: null,
      prizeTiers: [],
      groupAdvance: null,
    };
  }
  if (hasExtendedPoolColumnsOnRow(row)) {
    return poolMetaFromRow(row as PoolRulesPublicRowDb);
  }
  return {
    poolName: row.pool_name,
    lockAt: row.pool_lock_at,
    entryFeeCents: null,
    prizeTiers: [],
    groupAdvance: null,
  };
}

export type FetchSamplePoolScoringRulesResult =
  | { ok: true; data: SamplePoolScoringRulesPayload }
  | { ok: false; kind: "empty" }
  | { ok: false; kind: "error"; message: string };

/**
 * Loads public pool rules for the configured sample pool (anon-safe views).
 * Supports DBs that have not applied the extended `scoring_rules_public` migration yet
 * by falling back to the legacy view columns, then optionally enriching from `pool_rules_public`.
 */
export async function fetchSamplePoolScoringRules(): Promise<FetchSamplePoolScoringRulesResult> {
  try {
    const supabase = await createClient();

    const first = await supabase
      .from("scoring_rules_public")
      .select(FULL_RULES_SELECT)
      .eq("pool_id", SAMPLE_POOL_ID);

    let rulesRaw: ScoringRulesPublicRowDb[] = [];
    let rulesError = first.error;

    if (first.error && scoringViewMissingNewColumns(first.error.message)) {
      const legacy = await supabase
        .from("scoring_rules_public")
        .select(LEGACY_RULES_SELECT)
        .eq("pool_id", SAMPLE_POOL_ID);
      rulesRaw = (legacy.data ?? []) as ScoringRulesPublicRowDb[];
      rulesError = legacy.error;
    } else if (!first.error) {
      rulesRaw = (first.data ?? []) as ScoringRulesPublicRowDb[];
    } else {
      return { ok: false, kind: "error", message: first.error.message };
    }

    if (rulesError) {
      return { ok: false, kind: "error", message: rulesError.message };
    }

    let poolOnly: PoolRulesPublicRowDb | null = null;
    const needsPoolMetaFromView =
      rulesRaw.length === 0 || !hasExtendedPoolColumnsOnRow(rulesRaw[0]);

    if (needsPoolMetaFromView) {
      const { data: poolRow, error: poolErr } = await supabase
        .from("pool_rules_public")
        .select(POOL_RULES_META_SELECT)
        .eq("pool_id", SAMPLE_POOL_ID)
        .maybeSingle();

      // `pool_rules_public` is optional (some production DBs only expose
      // `scoring_rules_public`). Never fail the rules page because metadata
      // enrichment failed — scoring rows alone are enough to render the table.
      if (!poolErr && poolRow) {
        poolOnly = poolRow as PoolRulesPublicRowDb;
      }
    }

    // Empty state only when there are no public scoring rows for this pool id.
    // Missing `pool_rules_public` does not imply "no rules" if scoring rows exist.
    if (rulesRaw.length === 0) {
      if (!poolOnly) {
        return { ok: false, kind: "empty" };
      }
      return {
        ok: true,
        data: {
          ...poolMetaFromRow(poolOnly),
          rules: [],
        },
      };
    }

    const metaFromScoring = metaFromFirstScoringRow(rulesRaw[0]);
    const meta = poolOnly
      ? {
          poolName: poolOnly.pool_name,
          lockAt: poolOnly.pool_lock_at,
          entryFeeCents: poolMetaFromRow(poolOnly).entryFeeCents,
          prizeTiers: poolMetaFromRow(poolOnly).prizeTiers,
          groupAdvance: poolMetaFromRow(poolOnly).groupAdvance,
        }
      : metaFromScoring;

    const rules: PublicScoringRuleRow[] = rulesRaw
      .map((row) => ({
        predictionKind: row.prediction_kind,
        bonusKey: row.bonus_key ?? null,
        points: Number(row.points),
        label: labelPublicScoringRule(
          row.prediction_kind,
          row.bonus_key ?? null,
        ),
      }))
      .sort(comparePublicScoringRuleRows);

    return {
      ok: true,
      data: { ...meta, rules },
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
