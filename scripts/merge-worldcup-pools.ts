#!/usr/bin/env tsx
/**
 * One-time/admin merge: move non-duplicate participants from a source World Cup pool
 * into a compatible destination pool.
 *
 * Dry-run (default):
 *   npm run merge-worldcup-pools -- --source "FSChumps" --destination "PPFamily"
 *
 * Apply (requires explicit confirmation token):
 *   npm run merge-worldcup-pools -- \
 *     --source "FSChumps" \
 *     --destination "PPFamily" \
 *     --apply \
 *     --confirm "SOURCE_POOL_ID:DESTINATION_POOL_ID"
 *
 * Pool identifiers may be UUIDs or case-insensitive name substrings.
 * Requires SUPABASE_SERVICE_ROLE_KEY in the environment or `.env.local`.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { recomputePoolLedgerWithClient } from "../src/lib/scoring/recomputePoolLedger";
import {
  formatWorldCupPoolMergeDryRunReport,
  mergedPoolDisplayName,
  planWorldCupPoolMerge,
  type WorldCupPoolMergeParticipant,
  worldCupPoolMergePoolFromRow,
} from "../lib/participants/worldCupPoolMerge";
import { mapMoveWorldCupParticipantRpcError } from "../lib/participants/worldCupParticipantMove";
import { loadEnvLocal } from "./loadEnvLocal";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1]?.trim() || null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

type PoolLookupRow = {
  id: string;
  name: string | null;
  tournament_edition_id: string | null;
  is_simulation: boolean | null;
};

async function resolvePool(
  supabase: SupabaseClient,
  identifier: string,
  label: "source" | "destination",
) {
  if (isUuid(identifier)) {
    const { data, error } = await supabase
      .from("pools")
      .select("id, name, tournament_edition_id, is_simulation")
      .eq("id", identifier)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`${label} pool not found: ${identifier}`);
    return worldCupPoolMergePoolFromRow(data);
  }

  const { data, error } = await supabase
    .from("pools")
    .select("id, name, tournament_edition_id, is_simulation")
    .ilike("name", `%${identifier}%`);
  if (error) throw new Error(error.message);
  const matches = (data ?? []) as PoolLookupRow[];
  if (matches.length === 0) {
    throw new Error(`${label} pool not found matching name: ${identifier}`);
  }
  if (matches.length > 1) {
    const names = matches.map((row) => `${row.name} (${row.id})`).join(", ");
    throw new Error(
      `${label} pool name "${identifier}" is ambiguous. Matches: ${names}. Use a pool UUID instead.`,
    );
  }
  return worldCupPoolMergePoolFromRow(matches[0]!);
}

async function loadParticipants(
  supabase: SupabaseClient,
  poolId: string,
): Promise<WorldCupPoolMergeParticipant[]> {
  const { data, error } = await supabase
    .from("participants")
    .select("id, display_name, email, user_id")
    .eq("pool_id", poolId)
    .order("display_name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    displayName: String(row.display_name ?? ""),
    email: String(row.email ?? ""),
    userId: (row.user_id as string | null) ?? null,
  }));
}

async function main() {
  loadEnvLocal();

  const sourceArg = argValue("--source");
  const destinationArg = argValue("--destination");
  const confirmArg = argValue("--confirm");
  const apply = hasFlag("--apply");

  if (!sourceArg || !destinationArg) {
    console.error(
      "Usage: npm run merge-worldcup-pools -- --source <name-or-id> --destination <name-or-id> [--apply --confirm sourceId:destinationId]",
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sourcePool = await resolvePool(supabase, sourceArg, "source");
  const destinationPool = await resolvePool(supabase, destinationArg, "destination");
  const sourceParticipants = await loadParticipants(supabase, sourcePool.id);
  const destinationParticipants = await loadParticipants(supabase, destinationPool.id);

  const planned = planWorldCupPoolMerge({
    sourcePool,
    destinationPool,
    sourceParticipants,
    destinationParticipants,
  });

  if (!planned.ok) {
    console.error(`Merge blocked: ${planned.reason}`);
    process.exit(1);
  }

  const plan = planned.plan;
  console.log(formatWorldCupPoolMergeDryRunReport(plan));
  console.log("");

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply and --confirm to execute.");
    return;
  }

  const expectedConfirm = `${sourcePool.id}:${destinationPool.id}`;
  if (confirmArg !== expectedConfirm) {
    console.error(
      `Apply blocked: pass --confirm "${expectedConfirm}" exactly (sourceId:destinationId).`,
    );
    process.exit(1);
  }

  const moved: string[] = [];
  const failures: { participantId: string; displayName: string; error: string }[] = [];

  for (const row of plan.movable) {
    const participant = row.participant;
    const { error } = await supabase.rpc("move_world_cup_participant_to_pool", {
      p_participant_id: participant.id,
      p_source_pool_id: sourcePool.id,
      p_destination_pool_id: destinationPool.id,
    });

    if (error) {
      failures.push({
        participantId: participant.id,
        displayName: participant.displayName,
        error: mapMoveWorldCupParticipantRpcError(error.message),
      });
      continue;
    }
    moved.push(participant.id);
  }

  console.log(`Moved ${moved.length} participant(s).`);
  if (failures.length > 0) {
    console.log("Move failures:");
    for (const failure of failures) {
      console.log(
        `  - ${failure.displayName} [${failure.participantId}]: ${failure.error}`,
      );
    }
  }

  const sourceLedger = await recomputePoolLedgerWithClient(supabase, sourcePool.id, {
    ledgerTrigger: "admin_manual_recompute",
    skipRevalidation: true,
  });
  if (sourceLedger.error) {
    console.error(`Source pool ledger recompute failed: ${sourceLedger.error}`);
  } else {
    console.log(`Recomputed standings for source pool ${sourcePool.name}.`);
  }

  const destinationLedger = await recomputePoolLedgerWithClient(
    supabase,
    destinationPool.id,
    {
      ledgerTrigger: "admin_manual_recompute",
      skipRevalidation: true,
    },
  );
  if (destinationLedger.error) {
    console.error(`Destination pool ledger recompute failed: ${destinationLedger.error}`);
  } else {
    console.log(`Recomputed standings for destination pool ${destinationPool.name}.`);
  }

  const remainingSourceParticipants = await loadParticipants(supabase, sourcePool.id);
  const { error: poolUpdateErr } = await supabase
    .from("pools")
    .update({
      name: mergedPoolDisplayName(sourcePool.name),
      is_public: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourcePool.id);

  if (poolUpdateErr) {
    console.error(`Failed to mark source pool merged: ${poolUpdateErr.message}`);
  } else {
    console.log(
      `Source pool renamed to "${mergedPoolDisplayName(sourcePool.name)}" and set private.`,
    );
  }

  console.log("");
  console.log("Merge summary");
  console.log("=============");
  console.log(`Moved:   ${moved.length}`);
  console.log(`Failed:  ${failures.length}`);
  console.log(`Blocked: ${plan.blocked.length} (unchanged in source pool)`);
  console.log(`Remaining in source pool: ${remainingSourceParticipants.length}`);
  if (remainingSourceParticipants.length > 0) {
    for (const participant of remainingSourceParticipants) {
      console.log(
        `  - ${participant.displayName || "(no name)"} <${participant.email || "no email"}> [${participant.id}]`,
      );
    }
  }

  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
