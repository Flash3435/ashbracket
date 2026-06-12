#!/usr/bin/env tsx
/**
 * Archive World Cup pools (soft archive: is_public=false + archived_at).
 *
 * Empty pools (default):
 *   npm run archive-empty-pools -- --dry-run
 *   npm run archive-empty-pools -- --apply --confirm "ARCHIVE_EMPTY_POOLS"
 *
 * Named pools with participants (explicit opt-in):
 *   npm run archive-empty-pools -- --dry-run \
 *     --name "Simulation test pool" \
 *     --include-simulation --include-merged --allow-non-empty
 *
 *   npm run archive-empty-pools -- --apply \
 *     --confirm "ARCHIVE_SELECTED_POOLS_WITH_PARTICIPANTS" \
 *     --name "Simulation test pool" \
 *     --include-simulation --include-merged --allow-non-empty
 *
 * Pool identifiers may be UUIDs or exact case-insensitive pool names.
 * Requires SUPABASE_SERVICE_ROLE_KEY in the environment or `.env.local`.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildPoolArchiveApplyPayload,
  EMPTY_POOL_ARCHIVE_CONFIRM_TOKEN,
  evaluatePoolArchiveEligibility,
  formatPoolArchiveDryRunReport,
  resolveArchiveReasonForPool,
  resolvePoolArchiveApplyConfirmation,
  SELECTED_POOLS_ARCHIVE_CONFIRM_TOKEN,
  type PoolArchiveCandidate,
  type PoolArchiveDryRunRow,
} from "../lib/pools/poolArchive";
import { loadEnvLocal } from "./loadEnvLocal";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const POOL_SELECT =
  "id, name, is_public, is_simulation, archived_at, archived_by_user_id, archive_reason";

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1]?.trim() || null;
}

function argValues(flag: string): string[] {
  const values: string[] = [];
  for (let idx = 0; idx < process.argv.length; idx++) {
    if (process.argv[idx] === flag) {
      const value = process.argv[idx + 1]?.trim();
      if (value) values.push(value);
    }
  }
  return values;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function poolFromRow(row: Record<string, unknown>): PoolArchiveCandidate {
  return {
    id: row.id as string,
    name: String(row.name ?? ""),
    is_public: Boolean(row.is_public),
    is_simulation: Boolean(row.is_simulation),
    archived_at: (row.archived_at as string | null) ?? null,
    archived_by_user_id: (row.archived_by_user_id as string | null) ?? null,
    archive_reason: (row.archive_reason as string | null) ?? null,
  };
}

async function resolvePoolByIdentifier(
  supabase: SupabaseClient,
  identifier: string,
): Promise<PoolArchiveCandidate> {
  if (isUuid(identifier)) {
    const { data, error } = await supabase
      .from("pools")
      .select(POOL_SELECT)
      .eq("id", identifier)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      throw new Error(`Pool not found: ${identifier}`);
    }
    return poolFromRow(data);
  }

  const { data, error } = await supabase
    .from("pools")
    .select(POOL_SELECT)
    .ilike("name", identifier);
  if (error) throw new Error(error.message);

  const matches = (data ?? []).map(poolFromRow);
  if (matches.length === 0) {
    throw new Error(`Pool not found with exact name: ${identifier}`);
  }
  if (matches.length > 1) {
    const names = matches.map((row) => `${row.name} (${row.id})`).join(", ");
    throw new Error(
      `Pool name "${identifier}" is ambiguous. Matches: ${names}. Use a pool UUID instead.`,
    );
  }
  return matches[0]!;
}

async function loadAllPools(supabase: SupabaseClient): Promise<PoolArchiveCandidate[]> {
  const { data, error } = await supabase
    .from("pools")
    .select(POOL_SELECT)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(poolFromRow);
}

async function loadParticipantCountsByPoolId(
  supabase: SupabaseClient,
  poolIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const poolId of poolIds) {
    counts.set(poolId, 0);
  }
  if (poolIds.length === 0) return counts;

  const { data, error } = await supabase
    .from("participants")
    .select("pool_id")
    .in("pool_id", poolIds);
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const poolId = row.pool_id as string;
    counts.set(poolId, (counts.get(poolId) ?? 0) + 1);
  }
  return counts;
}

async function main() {
  loadEnvLocal();

  const nameArgs = argValues("--name");
  const apply = hasFlag("--apply");
  const dryRun = hasFlag("--dry-run") || !apply;
  const includeSimulation = hasFlag("--include-simulation");
  const includeMerged = hasFlag("--include-merged");
  const allowNonEmpty = hasFlag("--allow-non-empty");
  const customReason = argValue("--reason");
  const confirmArg = process.argv
    .slice(process.argv.indexOf("--confirm") + 1)
    .find((value) => value && !value.startsWith("--")) ?? null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const pools =
    nameArgs.length > 0
      ? await Promise.all(
          nameArgs.map((name) => resolvePoolByIdentifier(supabase, name)),
        )
      : await loadAllPools(supabase);

  const uniquePools = [...new Map(pools.map((pool) => [pool.id, pool])).values()];
  const countsByPoolId = await loadParticipantCountsByPoolId(
    supabase,
    uniquePools.map((pool) => pool.id),
  );

  const archiveOptions = {
    includeSimulation,
    includeMerged,
    allowNonEmpty,
  };

  const rows: PoolArchiveDryRunRow[] = uniquePools.map((pool) => ({
    pool,
    participantCount: countsByPoolId.get(pool.id) ?? 0,
    evaluation: evaluatePoolArchiveEligibility(
      pool,
      countsByPoolId.get(pool.id) ?? 0,
      archiveOptions,
    ),
  }));

  console.log(formatPoolArchiveDryRunReport(rows));
  console.log("");

  if (dryRun) {
    const hasNonEmptyEligible = rows.some(
      (row) => row.evaluation.eligible && row.participantCount > 0,
    );
    if (hasNonEmptyEligible) {
      console.log(
        `Dry-run only. Re-run with --apply --confirm "${SELECTED_POOLS_ARCHIVE_CONFIRM_TOKEN}" --allow-non-empty to execute.`,
      );
    } else {
      console.log(
        `Dry-run only. Re-run with --apply --confirm "${EMPTY_POOL_ARCHIVE_CONFIRM_TOKEN}" to execute.`,
      );
    }
    return;
  }

  const eligible = rows.filter((row) => row.evaluation.eligible);
  const confirmation = resolvePoolArchiveApplyConfirmation(eligible, confirmArg, {
    allowNonEmpty,
  });
  if (!confirmation.ok) {
    console.error(confirmation.error);
    process.exit(1);
  }

  if (eligible.length === 0) {
    console.log("No eligible pools to archive.");
    return;
  }

  const archivedAt = new Date().toISOString();

  let archivedCount = 0;
  const failures: { poolId: string; name: string; error: string }[] = [];

  for (const row of eligible) {
    const payload = buildPoolArchiveApplyPayload(
      archivedAt,
      resolveArchiveReasonForPool(row.participantCount, customReason),
    );

    const { error } = await supabase
      .from("pools")
      .update({
        ...payload,
        updated_at: archivedAt,
      })
      .eq("id", row.pool.id)
      .is("archived_at", null);

    if (error) {
      failures.push({
        poolId: row.pool.id,
        name: row.pool.name,
        error: error.message,
      });
      continue;
    }
    archivedCount++;
    console.log(`Archived: ${row.pool.name} (${row.pool.id})`);
  }

  console.log("");
  console.log("Apply summary");
  console.log("=============");
  console.log(`Archived: ${archivedCount}`);
  console.log(`Failed:   ${failures.length}`);
  console.log(`Skipped:  ${rows.length - eligible.length} (blocked or ineligible)`);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.log(`  - ${failure.name} [${failure.poolId}]: ${failure.error}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
