#!/usr/bin/env tsx
import { createClient } from "@supabase/supabase-js";
import { SAMPLE_POOL_ID } from "../lib/config/sample-pool";
import { resolvePublicRulesPoolId } from "../lib/pool/resolvePublicRulesPoolId";
import { loadEnvLocal } from "./loadEnvLocal";

async function main(): Promise<void> {
  loadEnvLocal();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const resolved = await resolvePublicRulesPoolId(supabase);
  console.log("SAMPLE_POOL_ID:", SAMPLE_POOL_ID);
  console.log("resolvePublicRulesPoolId:", resolved);

  const { count: sampleCount } = await supabase
    .from("scoring_rules_public")
    .select("pool_id", { count: "exact", head: true })
    .eq("pool_id", SAMPLE_POOL_ID);
  console.log("scoring_rules_public rows for SAMPLE_POOL_ID:", sampleCount);

  const { data: allPublicPools } = await supabase
    .from("scoring_rules_public")
    .select("pool_id, pool_name, prediction_kind, bonus_key, points")
    .order("pool_name")
    .order("prediction_kind");

  const poolIds = [...new Set((allPublicPools ?? []).map((r) => r.pool_id))];
  console.log("Pools in scoring_rules_public:", poolIds.length);

  for (const pid of poolIds) {
    const rows = (allPublicPools ?? []).filter((r) => r.pool_id === pid);
    const { data: pool } = await supabase
      .from("pools")
      .select(
        "id,name,is_simulation,archived_at,show_public_rules,is_public,tournament_edition_id",
      )
      .eq("id", pid)
      .single();
    const { data: edition } = pool?.tournament_edition_id
      ? await supabase
          .from("tournament_editions")
          .select("code,is_simulation")
          .eq("id", pool.tournament_edition_id)
          .maybeSingle()
      : { data: null };
    console.log(`\n=== ${pool?.name} (${pid}) ===`);
    console.log(
      `  sim=${pool?.is_simulation} archived=${pool?.archived_at ?? "null"} show_public_rules=${pool?.show_public_rules}`,
    );
    console.log(
      `  edition=${edition?.code ?? "null"} edition_sim=${edition?.is_simulation ?? "null"}`,
    );
    for (const r of rows) {
      console.log(`  ${r.prediction_kind} ${r.bonus_key ?? "-"} ${r.points}`);
    }
  }

  const { data: livePools } = await supabase
    .from("pools")
    .select(
      "id,name,is_simulation,archived_at,show_public_rules,tournament_editions!inner(code,is_simulation)",
    )
    .eq("tournament_editions.code", "fifa_wc_2026")
    .eq("tournament_editions.is_simulation", false)
    .eq("is_simulation", false)
    .is("archived_at", null);

  console.log("\n=== Live WC2026 pools (scoring_rules table) ===");
  for (const p of livePools ?? []) {
    const { data: rules } = await supabase
      .from("scoring_rules")
      .select("prediction_kind,bonus_key,points")
      .eq("pool_id", p.id)
      .order("prediction_kind");
    console.log(
      `\n${p.name} (${p.id}) show_public_rules=${p.show_public_rules}`,
    );
    for (const r of rules ?? []) {
      console.log(`  ${r.prediction_kind} ${r.bonus_key ?? "-"} ${r.points}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
