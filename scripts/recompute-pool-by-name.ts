#!/usr/bin/env tsx
/**
 * Recompute points_ledger for a pool identified by name substring or UUID.
 *
 *   npx tsx scripts/recompute-pool-by-name.ts "FAMPOOL 2026"
 */
import { createClient } from "@supabase/supabase-js";
import { recomputePoolLedgerWithClient } from "../src/lib/scoring/recomputePoolLedger";
import { loadEnvLocal } from "./loadEnvLocal";

async function main() {
  const identifier = process.argv[2]?.trim();
  if (!identifier) {
    console.error('Usage: npx tsx scripts/recompute-pool-by-name.ts "<pool name or uuid>"');
    process.exit(1);
  }

  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  let poolId: string;
  let poolName: string;

  if (uuidRe.test(identifier)) {
    const { data, error } = await supabase
      .from("pools")
      .select("id, name")
      .eq("id", identifier)
      .maybeSingle();
    if (error || !data) {
      console.error(error?.message ?? "Pool not found");
      process.exit(1);
    }
    poolId = data.id as string;
    poolName = String(data.name ?? identifier);
  } else {
    const { data, error } = await supabase
      .from("pools")
      .select("id, name")
      .ilike("name", `%${identifier}%`);
    if (error) {
      console.error(error.message);
      process.exit(1);
    }
    const matches = data ?? [];
    if (matches.length === 0) {
      console.error(`No pool matching: ${identifier}`);
      process.exit(1);
    }
    if (matches.length > 1) {
      console.error(
        `Ambiguous pool name "${identifier}". Matches:\n${matches
          .map((row) => `  - ${row.name} (${row.id})`)
          .join("\n")}`,
      );
      process.exit(1);
    }
    poolId = matches[0]!.id as string;
    poolName = String(matches[0]!.name ?? identifier);
  }

  console.log(`Recomputing ledger for ${poolName} (${poolId})…`);
  const result = await recomputePoolLedgerWithClient(supabase, poolId, {
    ledgerTrigger: "admin_manual_recompute",
    skipRevalidation: true,
  });

  if (result.error) {
    console.error(`Recompute failed: ${result.error}`);
    process.exit(1);
  }

  console.log("Recompute succeeded.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
