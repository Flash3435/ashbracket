#!/usr/bin/env tsx
/**
 * Reset leaderboard movement baseline for a pool after a standings read-path repair.
 * Sets the latest ash_score_impact snapshot's previous_standings to current standings
 * so movement arrows stay neutral until the next real scoring change.
 *
 *   npx tsx scripts/reset-pool-movement-baseline.ts "FAMPOOL 2026"
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { capturePoolStandingsState } from "../lib/admin/pilotStandingsSnapshot";
import { buildLeaderboardMomentum } from "../lib/leaderboard/buildLeaderboardMomentum";
import {
  STANDINGS_CAPTURE_VERSION,
  STANDINGS_CAPTURE_VERSION_KEY,
} from "../lib/leaderboard/validateLeaderboardMomentumSnapshot";
import { loadEnvLocal } from "./loadEnvLocal";

type PoolLookupRow = {
  id: string;
  name: string | null;
};

async function resolvePoolId(
  supabase: SupabaseClient,
  identifier: string,
): Promise<{ poolId: string; poolName: string }> {
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (uuidRe.test(identifier)) {
    const { data, error } = await supabase
      .from("pools")
      .select("id, name")
      .eq("id", identifier)
      .maybeSingle();
    const row = data as PoolLookupRow | null;
    if (error || !row?.id) throw new Error(error?.message ?? "Pool not found");
    return { poolId: row.id, poolName: String(row.name ?? identifier) };
  }

  const { data, error } = await supabase
    .from("pools")
    .select("id, name")
    .ilike("name", `%${identifier}%`);
  if (error) throw new Error(error.message);
  const matches = (data ?? []) as PoolLookupRow[];
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `No pool matching "${identifier}"`
        : `Ambiguous pool name "${identifier}" (${matches.length} matches)`,
    );
  }
  const match = matches[0]!;
  return {
    poolId: match.id,
    poolName: String(match.name ?? identifier),
  };
}

async function main() {
  const identifier = process.argv[2]?.trim();
  if (!identifier) {
    console.error('Usage: npx tsx scripts/reset-pool-movement-baseline.ts "<pool name or uuid>"');
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

  const { poolId, poolName } = await resolvePoolId(supabase, identifier);
  const capture = await capturePoolStandingsState(supabase, poolId);

  const { data: activity, error: findErr } = await supabase
    .from("pool_activity")
    .select("id, metadata_json")
    .eq("pool_id", poolId)
    .eq("type", "ash_score_impact")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findErr) throw new Error(findErr.message);
  if (!activity?.id) {
    console.log(`No ash_score_impact activity for ${poolName}; nothing to reset.`);
    return;
  }

  const metadata =
    activity.metadata_json != null && typeof activity.metadata_json === "object"
      ? { ...(activity.metadata_json as Record<string, unknown>) }
      : {};

  const currentRows = capture.rows.map((row) => ({
    participantId: row.participantId,
    totalPoints: row.totalPoints,
    rank: row.rank,
  }));
  const previousRows = currentRows.map((row) => ({
    participantId: row.participantId,
    totalPoints: row.totalPoints,
  }));
  const momentum = buildLeaderboardMomentum({ currentRows, previousRows });

  metadata.has_previous_snapshot = true;
  metadata[STANDINGS_CAPTURE_VERSION_KEY] = STANDINGS_CAPTURE_VERSION;
  metadata.previous_standings = previousRows.map((row) => ({
    participant_id: row.participantId,
    total_points: row.totalPoints,
  }));
  metadata.leaderboard_momentum = momentum.rows.map((row) => ({
    participant_id: row.participantId,
    previous_rank: row.currentRank,
    previous_points: row.currentPoints,
    rank_change: 0,
    points_gained: 0,
    is_new_entry: false,
  }));
  delete metadata.leaderboard_movement;

  const { error: updateErr } = await supabase
    .from("pool_activity")
    .update({
      metadata_json: metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", activity.id);

  if (updateErr) throw new Error(updateErr.message);

  console.log(
    `Reset movement baseline for ${poolName} (${poolId}) on activity ${activity.id} — ${capture.rows.length} participants, neutral arrows until next score change.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
