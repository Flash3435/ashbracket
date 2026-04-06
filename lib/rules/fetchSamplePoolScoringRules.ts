import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { solePublicPoolIdFromScoringView } from "../pools/solePublicPoolIdFromScoringView";
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
  /** Present after `20260409130000_pool_public_tie_break_note`; omitted on older views. */
  tie_break_note?: string | null;
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
  tie_break_note?: string | null;
};

const FULL_RULES_SELECT =
  "pool_id, pool_name, pool_lock_at, entry_fee_cents, prize_distribution_json, group_advance_exact_points, group_advance_wrong_slot_points, tie_break_note, prediction_kind, bonus_key, points";

/** When `pool_rules_public` / `scoring_rules_public` predates `tie_break_note`. */
const FULL_RULES_SELECT_WITHOUT_TIE =
  "pool_id, pool_name, pool_lock_at, entry_fee_cents, prize_distribution_json, group_advance_exact_points, group_advance_wrong_slot_points, prediction_kind, bonus_key, points";

const LEGACY_RULES_SELECT =
  "pool_id, pool_name, pool_lock_at, prediction_kind, points";

const POOL_RULES_META_SELECT =
  "pool_id, pool_name, pool_lock_at, entry_fee_cents, prize_distribution_json, group_advance_exact_points, group_advance_wrong_slot_points, tie_break_note";

const POOL_RULES_META_SELECT_WITHOUT_TIE =
  "pool_id, pool_name, pool_lock_at, entry_fee_cents, prize_distribution_json, group_advance_exact_points, group_advance_wrong_slot_points";

function normalizeTieBreakNote(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

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
  | "tieBreakNote"
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
    tieBreakNote: normalizeTieBreakNote(row.tie_break_note ?? null),
  };
}

/** View is missing fractional / bonus / pool-metadata columns (pre-20260409120000 shape). */
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
  | "poolName"
  | "lockAt"
  | "entryFeeCents"
  | "prizeTiers"
  | "groupAdvance"
  | "tieBreakNote"
> {
  if (!row) {
    return {
      poolName: "",
      lockAt: null,
      entryFeeCents: null,
      prizeTiers: [],
      groupAdvance: null,
      tieBreakNote: null,
    };
  }
  if (hasExtendedPoolColumnsOnRow(row)) {
    const r = row as ScoringRulesPublicRowDb;
    return poolMetaFromRow({
      pool_id: r.pool_id,
      pool_name: r.pool_name,
      pool_lock_at: r.pool_lock_at,
      entry_fee_cents: r.entry_fee_cents ?? null,
      prize_distribution_json: r.prize_distribution_json ?? null,
      group_advance_exact_points: r.group_advance_exact_points ?? null,
      group_advance_wrong_slot_points: r.group_advance_wrong_slot_points ?? null,
      tie_break_note:
        "tie_break_note" in r && r.tie_break_note != null
          ? String(r.tie_break_note)
          : null,
    });
  }
  return {
    poolName: row.pool_name,
    lockAt: row.pool_lock_at,
    entryFeeCents: null,
    prizeTiers: [],
    groupAdvance: null,
    tieBreakNote: null,
  };
}

type LoadScoringRawResult =
  | { ok: true; rulesRaw: ScoringRulesPublicRowDb[] }
  | { ok: false; message: string };

async function loadScoringRulesRawForPool(
  supabase: SupabaseClient,
  poolId: string,
): Promise<LoadScoringRawResult> {
  const full = await supabase
    .from("scoring_rules_public")
    .select(FULL_RULES_SELECT)
    .eq("pool_id", poolId);

  if (!full.error) {
    return { ok: true, rulesRaw: (full.data ?? []) as ScoringRulesPublicRowDb[] };
  }

  const fullMsg = full.error.message;

  if (fullMsg.toLowerCase().includes("tie_break_note")) {
    const withoutTie = await supabase
      .from("scoring_rules_public")
      .select(FULL_RULES_SELECT_WITHOUT_TIE)
      .eq("pool_id", poolId);
    if (!withoutTie.error) {
      return {
        ok: true,
        rulesRaw: (withoutTie.data ?? []) as ScoringRulesPublicRowDb[],
      };
    }
  }

  if (scoringViewMissingNewColumns(fullMsg)) {
    const legacy = await supabase
      .from("scoring_rules_public")
      .select(LEGACY_RULES_SELECT)
      .eq("pool_id", poolId);
    if (legacy.error) {
      return { ok: false, message: legacy.error.message };
    }
    return {
      ok: true,
      rulesRaw: (legacy.data ?? []) as ScoringRulesPublicRowDb[],
    };
  }

  return { ok: false, message: fullMsg };
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

    let effectivePoolId = SAMPLE_POOL_ID;
    let loaded = await loadScoringRulesRawForPool(supabase, effectivePoolId);
    if (!loaded.ok) {
      return { ok: false, kind: "error", message: loaded.message };
    }
    let rulesRaw = loaded.rulesRaw;

    if (rulesRaw.length === 0) {
      const sole = await solePublicPoolIdFromScoringView(supabase);
      if (sole && sole !== SAMPLE_POOL_ID) {
        effectivePoolId = sole;
        loaded = await loadScoringRulesRawForPool(supabase, effectivePoolId);
        if (!loaded.ok) {
          return { ok: false, kind: "error", message: loaded.message };
        }
        rulesRaw = loaded.rulesRaw;
      }
    }

    let poolOnly: PoolRulesPublicRowDb | null = null;
    const needsPoolMetaFromView =
      rulesRaw.length === 0 || !hasExtendedPoolColumnsOnRow(rulesRaw[0]);

    if (needsPoolMetaFromView) {
      let poolRes = await supabase
        .from("pool_rules_public")
        .select(POOL_RULES_META_SELECT)
        .eq("pool_id", effectivePoolId)
        .maybeSingle();

      if (
        poolRes.error &&
        poolRes.error.message.toLowerCase().includes("tie_break_note")
      ) {
        poolRes = await supabase
          .from("pool_rules_public")
          .select(POOL_RULES_META_SELECT_WITHOUT_TIE)
          .eq("pool_id", effectivePoolId)
          .maybeSingle();
      }

      // `pool_rules_public` is optional (some production DBs only expose
      // `scoring_rules_public`). Never fail the rules page because metadata
      // enrichment failed — scoring rows alone are enough to render the table.
      if (!poolRes.error && poolRes.data) {
        poolOnly = poolRes.data as PoolRulesPublicRowDb;
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
    const poolMeta = poolOnly ? poolMetaFromRow(poolOnly) : null;
    const meta = poolMeta
      ? {
          poolName: poolMeta.poolName,
          lockAt: poolMeta.lockAt,
          entryFeeCents: poolMeta.entryFeeCents,
          prizeTiers: poolMeta.prizeTiers,
          groupAdvance: poolMeta.groupAdvance,
          tieBreakNote: poolMeta.tieBreakNote,
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
