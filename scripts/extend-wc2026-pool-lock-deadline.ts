#!/usr/bin/env tsx
/**
 * Extend pick lock deadline for live World Cup 2026 pools.
 *
 * Dry run (default): list matching pools and planned updates.
 * Apply: pass --apply to write the new lock_at.
 *
 * Usage:
 *   npx tsx scripts/extend-wc2026-pool-lock-deadline.ts
 *   npx tsx scripts/extend-wc2026-pool-lock-deadline.ts --apply
 *
 * Requires `.env.local` with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import { poolLocked } from "../lib/pools/poolLocked";
import {
  FIFA_WC_2026_EDITION_CODE,
  isKnownBadWc2026PoolLockAt,
  WC2026_OFFICIAL_POOL_LOCK_AT_ISO,
} from "../lib/pools/wc2026PoolLockDeadline";
import { loadEnvLocal } from "./loadEnvLocal";

const NEW_LOCK_AT_ISO = "2026-06-11T16:00:00.000Z";

function normalizeLockAtIso(lockAtIso: string | null | undefined): string | null {
  if (lockAtIso == null || lockAtIso.trim() === "") return null;
  const ms = new Date(lockAtIso).getTime();
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/** Pools on the AshBracket official deadline (or unset/bad) — not custom organizer deadlines. */
function shouldExtendWc2026PoolLockAt(lockAtIso: string | null | undefined): boolean {
  const lockAt = normalizeLockAtIso(lockAtIso);
  if (!lockAt) return true;
  if (lockAt === WC2026_OFFICIAL_POOL_LOCK_AT_ISO) return true;
  return isKnownBadWc2026PoolLockAt(lockAt);
}

type Wc2026PoolRow = {
  id: string;
  name: string;
  lock_at: string | null;
  join_code: string | null;
  is_simulation: boolean;
  tournament_editions: {
    code: string;
    is_simulation: boolean;
  } | null;
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
  return true;
}

async function main(): Promise<void> {
  loadEnvLocal();

  const apply = process.argv.includes("--apply");
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
  const nowMs = Date.now();

  const { data, error } = await supabase
    .from("pools")
    .select(
      "id, name, lock_at, join_code, is_simulation, tournament_editions!inner(code, is_simulation)",
    )
    .eq("tournament_editions.code", FIFA_WC_2026_EDITION_CODE)
    .eq("tournament_editions.is_simulation", false)
    .eq("is_simulation", false)
    .order("name", { ascending: true });

  if (error) {
    console.error("Failed to load pools:", error.message);
    process.exit(1);
  }

  const pools = ((data ?? []) as unknown as Wc2026PoolRow[]).filter(
    isTargetWc2026LivePool,
  );

  if (pools.length === 0) {
    console.log("No live World Cup 2026 pools matched.");
    return;
  }

  const eligible = pools.filter((p) => shouldExtendWc2026PoolLockAt(p.lock_at));
  const skipped = pools.filter((p) => !shouldExtendWc2026PoolLockAt(p.lock_at));

  console.log(
    apply ? "Applying lock_at extension…" : "Dry run — no changes written.",
  );
  console.log(`New lock_at: ${NEW_LOCK_AT_ISO}`);
  console.log(`Old official: ${WC2026_OFFICIAL_POOL_LOCK_AT_ISO}`);
  console.log(`Now (UTC):   ${new Date(nowMs).toISOString()}`);
  console.log("");

  console.log(`Matching live WC 2026 pools (${pools.length}):`);
  for (const pool of pools) {
    const before = pool.lock_at;
    const lockedBefore = poolLocked(before);
    const willUpdate = shouldExtendWc2026PoolLockAt(before);
    console.log(`Pool: ${pool.name}`);
    console.log(`  id:         ${pool.id}`);
    console.log(`  join_code:  ${pool.join_code ?? "—"}`);
    console.log(`  lock_at:    ${before ?? "null"}`);
    console.log(`  locked now: ${lockedBefore ? "yes" : "no"}`);
    console.log(`  action:     ${willUpdate ? `set to ${NEW_LOCK_AT_ISO}` : "skip (custom deadline)"}`);
    if (willUpdate) {
      const lockedAfter = poolLocked(NEW_LOCK_AT_ISO);
      console.log(`  after apply: unlocked=${lockedAfter ? "no" : "yes"}`);
    }
    console.log("");
  }

  if (skipped.length > 0) {
    console.log(
      `Skipping ${skipped.length} pool(s) with custom lock_at (not the AshBracket official deadline).`,
    );
    console.log("");
  }

  const toUpdate = eligible.filter(
    (p) => normalizeLockAtIso(p.lock_at) !== NEW_LOCK_AT_ISO,
  );

  if (toUpdate.length === 0) {
    console.log("All matching pools already have the target lock_at.");
    return;
  }

  if (!apply) {
    console.log(
      `${toUpdate.length} pool(s) would be updated. Re-run with --apply to write.`,
    );
    return;
  }

  for (const pool of toUpdate) {
    const before = pool.lock_at;
    const { data: updated, error: updateError } = await supabase
      .from("pools")
      .update({ lock_at: NEW_LOCK_AT_ISO, updated_at: new Date().toISOString() })
      .eq("id", pool.id)
      .select("id, name, lock_at, join_code")
      .single();

    if (updateError || !updated) {
      console.error(
        `Update failed for ${pool.id} (${pool.name}):`,
        updateError?.message ?? "no row returned",
      );
      process.exit(1);
    }

    console.log(`Updated ${updated.name} (${updated.id})`);
    console.log(`  before: ${before ?? "null"}`);
    console.log(`  after:  ${updated.lock_at}`);
  }

  console.log("");
  console.log("Verification:");
  for (const pool of toUpdate) {
    const { data: verifyRow, error: verifyError } = await supabase
      .from("pools")
      .select("id, name, lock_at")
      .eq("id", pool.id)
      .maybeSingle();

    if (verifyError || !verifyRow) {
      console.error(`Verify failed for ${pool.id}:`, verifyError?.message ?? "");
      process.exit(1);
    }

    const lockAt = verifyRow.lock_at as string | null;
    const ok = normalizeLockAtIso(lockAt) === NEW_LOCK_AT_ISO;
    const unlocked = !poolLocked(lockAt);
    console.log(
      `  ${verifyRow.name}: lock_at=${lockAt} match=${ok ? "yes" : "NO"} unlocked=${unlocked ? "yes" : "no"}`,
    );
    if (!ok) process.exit(1);
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
