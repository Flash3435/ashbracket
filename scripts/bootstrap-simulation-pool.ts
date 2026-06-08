/**
 * CLI helper: clone live WC edition + create a simulation pool.
 *
 * Usage (from ashbracket/):
 *   npx tsx scripts/bootstrap-simulation-pool.ts "My sim pool"
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in env.
 */
import { createClient } from "@supabase/supabase-js";
import { OFFICIAL_EDITION_CODE } from "../lib/config/officialTournament";

async function main() {
  const poolName = process.argv[2]?.trim() || "Simulation test pool";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error } = await supabase.rpc("bootstrap_simulation_pool", {
    p_pool_name: poolName,
    p_source_edition_code: OFFICIAL_EDITION_CODE,
    p_join_code: null,
    p_is_public: false,
  });

  if (error) {
    console.error("bootstrap_simulation_pool failed:", error.message);
    process.exit(1);
  }

  const row = (rows as { pool_id: string; edition_id: string; edition_code: string }[] | null)?.[0];
  if (!row) {
    console.error("No row returned from bootstrap_simulation_pool.");
    process.exit(1);
  }

  console.log("Simulation pool ready:");
  console.log("  pool_id:", row.pool_id);
  console.log("  edition_id:", row.edition_id);
  console.log("  edition_code:", row.edition_code);
  console.log("  admin:", `/admin/pools/${row.pool_id}`);
  console.log("  test results:", `/admin/simulation/editions/${row.edition_id}/results`);
}

main();
