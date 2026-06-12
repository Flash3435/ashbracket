#!/usr/bin/env tsx
/**
 * Preview or apply live WC 2026 scoring rule value changes and recompute ledgers.
 *
 * Rule updates are normally applied by migration
 * `20260611150000_wc2026_live_scoring_rule_values.sql`. This script supports:
 * - Dry-run inventory of matching pools and current rule values
 * - Optional `--apply-rules` to write rule changes (same filters as migration)
 * - `--recompute` to refresh points_ledger for affected live pools
 * - `--announce` to post the AshBot scoring-update note (idempotent; also runs with --apply-rules / --recompute)
 *
 * Usage:
 *   npx tsx scripts/update-wc2026-live-scoring-rules.ts
 *   npx tsx scripts/update-wc2026-live-scoring-rules.ts --apply-rules --announce --recompute
 *
 * Requires `.env.local` with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import { recomputePoolLedgerWithClient } from "../src/lib/scoring/recomputePoolLedger";
import { FIFA_WC_2026_EDITION_CODE } from "../lib/pools/wc2026PoolLockDeadline";
import {
  DEFAULT_WORLD_CUP_GROUP_ADVANCE_EXACT_POINTS,
  DEFAULT_WORLD_CUP_GROUP_ADVANCE_WRONG_SLOT_POINTS,
  DEFAULT_WORLD_CUP_SCORING_RULE_ROWS,
} from "../lib/scoring/worldcupPoolDefaults";
import {
  postScoringRulesUpdateAnnouncementsForPools,
  SCORING_RULES_UPDATE_2026_SOURCE_KEY,
} from "../lib/poolActivity/scoringRulesUpdateAnnouncement";
import { loadEnvLocal } from "./loadEnvLocal";

const TARGET_THIRD_PLACE_POINTS = 4;
const TARGET_MOST_GOALS_POINTS = 25;
const PRIOR_THIRD_PLACE_POINTS = 2;
const PRIOR_MOST_GOALS_POINTS = 50;

type Wc2026PoolRow = {
  id: string;
  name: string;
  join_code: string | null;
  is_simulation: boolean;
  archived_at: string | null;
  tournament_editions: {
    code: string;
    is_simulation: boolean;
  } | null;
};

type ScoringRuleRow = {
  pool_id: string;
  prediction_kind: string;
  bonus_key: string | null;
  points: number;
};

function validateSupabaseEnv(url: string, key: string): void {
  const lowerUrl = url.toLowerCase();
  if (
    lowerUrl.includes("your_project") ||
    lowerUrl.includes("your-project") ||
    url.includes("YOUR_PROJECT")
  ) {
    console.error("NEXT_PUBLIC_SUPABASE_URL still looks like a placeholder.");
    process.exit(1);
  }
  if (key.trim().length < 100) {
    console.error(
      "SUPABASE_SERVICE_ROLE_KEY does not look like a real service_role JWT.",
    );
    process.exit(1);
  }
}

function isTargetWc2026LivePool(row: Wc2026PoolRow): boolean {
  const edition = row.tournament_editions;
  if (!edition) return false;
  if (edition.code !== FIFA_WC_2026_EDITION_CODE) return false;
  if (edition.is_simulation) return false;
  if (row.is_simulation) return false;
  if (row.archived_at != null && row.archived_at.trim() !== "") return false;
  return true;
}


async function main(): Promise<void> {
  loadEnvLocal();

  const applyRules = process.argv.includes("--apply-rules");
  const recompute = process.argv.includes("--recompute");
  const announce =
    process.argv.includes("--announce") || applyRules || recompute;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    );
    process.exit(1);
  }
  validateSupabaseEnv(url, key);

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from("pools")
    .select(
      "id, name, join_code, is_simulation, archived_at, tournament_editions!inner(code, is_simulation)",
    )
    .eq("tournament_editions.code", FIFA_WC_2026_EDITION_CODE)
    .eq("tournament_editions.is_simulation", false)
    .eq("is_simulation", false)
    .is("archived_at", null)
    .order("name", { ascending: true });

  if (error) {
    console.error("Failed to load pools:", error.message);
    process.exit(1);
  }

  const pools = ((data ?? []) as unknown as Wc2026PoolRow[]).filter(
    isTargetWc2026LivePool,
  );

  if (pools.length === 0) {
    console.log("No active live World Cup 2026 pools matched.");
    console.log("Excluded: simulation editions/pools, archived pools.");
    return;
  }

  const poolIds = pools.map((p) => p.id);
  const { data: ruleRows, error: rulesError } = await supabase
    .from("scoring_rules")
    .select("pool_id, prediction_kind, bonus_key, points")
    .in("pool_id", poolIds);

  if (rulesError) {
    console.error("Failed to load scoring_rules:", rulesError.message);
    process.exit(1);
  }

  const rulesByPool = new Map<string, ScoringRuleRow[]>();
  for (const row of (ruleRows ?? []) as ScoringRuleRow[]) {
    const list = rulesByPool.get(row.pool_id) ?? [];
    list.push(row);
    rulesByPool.set(row.pool_id, list);
  }

  console.log(
    applyRules || recompute || announce
      ? "Live WC 2026 scoring rule maintenance"
      : "Dry run — no changes written.",
  );
  console.log(
    `Target values: third_place_qualifier=${TARGET_THIRD_PLACE_POINTS}, most_goals=${TARGET_MOST_GOALS_POINTS}`,
  );
  console.log(`AshBot dedupe key: ${SCORING_RULES_UPDATE_2026_SOURCE_KEY}`);
  console.log(
    "Excluded: simulation editions/pools, archived pools, custom rule values.",
  );
  console.log("");

  const poolsNeedingThird: Wc2026PoolRow[] = [];
  const poolsNeedingGoals: Wc2026PoolRow[] = [];
  const poolsNeedingFullSeed: Wc2026PoolRow[] = [];
  const poolsAlreadyCorrect: Wc2026PoolRow[] = [];

  const { data: announcementRows, error: announcementQueryError } =
    await supabase
      .from("pool_activity")
      .select("pool_id")
      .in("pool_id", poolIds)
      .eq("type", "pool_milestone")
      .eq("metadata_json->>source_key", SCORING_RULES_UPDATE_2026_SOURCE_KEY);

  if (announcementQueryError) {
    console.error(
      "Failed to load existing scoring-update announcements:",
      announcementQueryError.message,
    );
    process.exit(1);
  }

  const announcedPoolIds = new Set(
    (announcementRows ?? []).map((row) => row.pool_id as string),
  );

  for (const pool of pools) {
    const rules = rulesByPool.get(pool.id) ?? [];
    const third = rules.find(
      (r) =>
        r.prediction_kind === "third_place_qualifier" && r.bonus_key == null,
    );
    const goals = rules.find(
      (r) => r.prediction_kind === "bonus_pick" && r.bonus_key === "most_goals",
    );
    const yellow = rules.find(
      (r) =>
        r.prediction_kind === "bonus_pick" &&
        r.bonus_key === "most_yellow_cards",
    );
    const red = rules.find(
      (r) =>
        r.prediction_kind === "bonus_pick" && r.bonus_key === "most_red_cards",
    );
    const r16 = rules.find(
      (r) => r.prediction_kind === "round_of_16" && r.bonus_key == null,
    );

    const needsFullSeed = rules.length === 0;
    const thirdNeedsUpdate =
      third != null && Number(third.points) === PRIOR_THIRD_PLACE_POINTS;
    const goalsNeedsUpdate =
      goals != null && Number(goals.points) === PRIOR_MOST_GOALS_POINTS;
    const thirdNeedsInsert =
      !needsFullSeed && third == null;
    const goalsNeedsInsert =
      !needsFullSeed && goals == null;
    const thirdAtTarget =
      third != null && Number(third.points) === TARGET_THIRD_PLACE_POINTS;
    const goalsAtTarget =
      goals != null && Number(goals.points) === TARGET_MOST_GOALS_POINTS;

    if (needsFullSeed) poolsNeedingFullSeed.push(pool);
    if (thirdNeedsUpdate) poolsNeedingThird.push(pool);
    if (goalsNeedsUpdate) poolsNeedingGoals.push(pool);
    if (
      !needsFullSeed &&
      !thirdNeedsUpdate &&
      !goalsNeedsUpdate &&
      !thirdNeedsInsert &&
      !goalsNeedsInsert &&
      thirdAtTarget &&
      goalsAtTarget
    ) {
      poolsAlreadyCorrect.push(pool);
    }

    const thirdAction = needsFullSeed
      ? `seed full rule set (${TARGET_THIRD_PLACE_POINTS} pts)`
      : thirdNeedsUpdate
        ? String(TARGET_THIRD_PLACE_POINTS)
        : thirdNeedsInsert
          ? `insert ${TARGET_THIRD_PLACE_POINTS}`
          : (third?.points ?? "custom/missing");
    const goalsAction = needsFullSeed
      ? `seed full rule set (${TARGET_MOST_GOALS_POINTS} pts)`
      : goalsNeedsUpdate
        ? String(TARGET_MOST_GOALS_POINTS)
        : goalsNeedsInsert
          ? `insert ${TARGET_MOST_GOALS_POINTS}`
          : (goals?.points ?? "custom/missing");

    console.log(`Pool: ${pool.name}`);
    console.log(`  id:        ${pool.id}`);
    console.log(`  join_code: ${pool.join_code ?? "—"}`);
    console.log(
      `  scoring_rules rows: ${rules.length === 0 ? "none (will seed)" : rules.length}`,
    );
    console.log(
      `  third_place_qualifier: ${third?.points ?? "missing"} → ${thirdAction}`,
    );
    console.log(
      `  most_goals:            ${goals?.points ?? "missing"} → ${goalsAction}`,
    );
    console.log(
      `  unchanged checks: round_of_16=${r16?.points ?? "missing"}, most_yellow_cards=${yellow?.points ?? "missing"}, most_red_cards=${red?.points ?? "missing"}`,
    );
    console.log(
      `  AshBot note: ${announcedPoolIds.has(pool.id) ? "already posted" : "would post"}`,
    );
    console.log("");
  }

  console.log(`Affected live pools (${pools.length} total):`);
  console.log(`  need full rule seed:     ${poolsNeedingFullSeed.length}`);
  console.log(`  need third_place update: ${poolsNeedingThird.length}`);
  console.log(`  need most_goals update:  ${poolsNeedingGoals.length}`);
  console.log(`  already at target:       ${poolsAlreadyCorrect.length}`);
  console.log(
    `  AshBot notes posted:     ${announcedPoolIds.size}/${pools.length}`,
  );
  console.log("");

  if (applyRules) {
    for (const pool of poolsNeedingFullSeed) {
      const { error: poolUpdateError } = await supabase
        .from("pools")
        .update({
          group_advance_exact_points: DEFAULT_WORLD_CUP_GROUP_ADVANCE_EXACT_POINTS,
          group_advance_wrong_slot_points:
            DEFAULT_WORLD_CUP_GROUP_ADVANCE_WRONG_SLOT_POINTS,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pool.id);

      if (poolUpdateError) {
        console.error(
          `group advance backfill failed for ${pool.id}:`,
          poolUpdateError.message,
        );
        process.exit(1);
      }

      const payload = DEFAULT_WORLD_CUP_SCORING_RULE_ROWS.map((row) => ({
        pool_id: pool.id,
        prediction_kind: row.predictionKind,
        bonus_key: row.bonusKey,
        points: row.points,
      }));
      const { error: seedError } = await supabase
        .from("scoring_rules")
        .upsert(payload, { onConflict: "pool_id,prediction_kind,bonus_key" });

      if (seedError) {
        console.error(
          `scoring_rules seed failed for ${pool.id}:`,
          seedError.message,
        );
        process.exit(1);
      }
      console.log(`Seeded full scoring_rules for ${pool.name}`);
    }

    for (const pool of poolsNeedingThird) {
      const { error: updateError } = await supabase
        .from("scoring_rules")
        .update({
          points: TARGET_THIRD_PLACE_POINTS,
          updated_at: new Date().toISOString(),
        })
        .eq("pool_id", pool.id)
        .eq("prediction_kind", "third_place_qualifier")
        .is("bonus_key", null)
        .eq("points", PRIOR_THIRD_PLACE_POINTS);

      if (updateError) {
        console.error(
          `third_place_qualifier update failed for ${pool.id}:`,
          updateError.message,
        );
        process.exit(1);
      }
      console.log(`Updated third_place_qualifier for ${pool.name}`);
    }

    for (const pool of poolsNeedingGoals) {
      const { error: updateError } = await supabase
        .from("scoring_rules")
        .update({
          points: TARGET_MOST_GOALS_POINTS,
          updated_at: new Date().toISOString(),
        })
        .eq("pool_id", pool.id)
        .eq("prediction_kind", "bonus_pick")
        .eq("bonus_key", "most_goals")
        .eq("points", PRIOR_MOST_GOALS_POINTS);

      if (updateError) {
        console.error(
          `most_goals update failed for ${pool.id}:`,
          updateError.message,
        );
        process.exit(1);
      }
      console.log(`Updated most_goals for ${pool.name}`);
    }

    if (
      poolsNeedingFullSeed.length === 0 &&
      poolsNeedingThird.length === 0 &&
      poolsNeedingGoals.length === 0
    ) {
      console.log("All matching pools already have target rule values.");
    }
  } else if (
    poolsNeedingFullSeed.length > 0 ||
    poolsNeedingThird.length > 0 ||
    poolsNeedingGoals.length > 0
  ) {
    console.log(
      "Rule rows would be updated by migration or --apply-rules. Re-run with --apply-rules to write.",
    );
  }

  if (announce) {
    console.log("");
    console.log("Posting AshBot scoring-update notes…");
    const announcementResult = await postScoringRulesUpdateAnnouncementsForPools(
      supabase,
      poolIds,
    );
    console.log(
      `AshBot notes: inserted=${announcementResult.inserted}, skipped=${announcementResult.skipped}`,
    );
  } else if (
    announcedPoolIds.size < pools.length
  ) {
    console.log("");
    console.log(
      "After rules are applied, run with --announce (or --apply-rules / --recompute) to post AshBot notes.",
    );
  }

  if (recompute) {
    console.log("");
    console.log(`Recomputing ledgers for ${poolIds.length} live pool(s)…`);
    for (const poolId of poolIds) {
      const pool = pools.find((p) => p.id === poolId);
      const ledger = await recomputePoolLedgerWithClient(supabase, poolId, {
        ledgerTrigger: "admin_manual_recompute",
        skipRevalidation: true,
      });
      if (ledger.error) {
        console.error(
          `Ledger recompute failed for ${pool?.name ?? poolId}:`,
          ledger.error,
        );
        process.exit(1);
      }
      console.log(`  recomputed ${pool?.name ?? poolId}`);
    }
    console.log("Ledger recompute complete.");
  } else if (applyRules) {
    console.log("");
    console.log(
      "Rules updated. Re-run with --recompute to refresh standings/points_ledger.",
    );
  } else if (
    poolsNeedingFullSeed.length > 0 ||
    poolsNeedingThird.length > 0 ||
    poolsNeedingGoals.length > 0
  ) {
    console.log(
      "After migration deploy, run with --recompute to refresh standings.",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
