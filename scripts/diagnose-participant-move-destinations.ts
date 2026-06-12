#!/usr/bin/env tsx
/**
 * Diagnose why destination pools are included or excluded for a participant move.
 *
 * Usage (reads `.env.local` when present):
 *   npx tsx scripts/diagnose-participant-move-destinations.ts \
 *     --source-pool "FSChumps" \
 *     --participant "Adarsh" \
 *     --user-email "you@example.com"
 *
 * Optional:
 *   --destination-pool "Fampool 2026"
 */

import { createClient } from "@supabase/supabase-js";
import {
  detectParticipantDuplicateInDestinationPool,
  diagnoseMoveDestinationPool,
  formatMoveDestinationBlockedLabel,
  worldCupPoolMoveScopeFromManagedPool,
  type ParticipantMoveIdentity,
} from "../lib/participants/worldCupParticipantMove";
import { loadEnvLocal } from "./loadEnvLocal";

type PoolRow = {
  id: string;
  name: string;
  tournament_edition_id: string;
  is_simulation: boolean;
  created_by_user_id: string | null;
};

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1]?.trim() || null;
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || (!serviceKey && !anonKey)) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or anon key).");
    process.exit(1);
  }

  const sourcePoolName = argValue("--source-pool");
  const participantQuery = argValue("--participant");
  const userEmail = argValue("--user-email");
  const destinationPoolName = argValue("--destination-pool");

  if (!sourcePoolName || !participantQuery) {
    console.error(
      "Required: --source-pool <name> --participant <display name or email>",
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey ?? anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let actorUserId: string | null = null;
  if (userEmail && serviceKey) {
    const { data: usersData, error: usersErr } = await supabase.auth.admin.listUsers();
    if (usersErr) {
      console.error("Could not list users:", usersErr.message);
      process.exit(1);
    }
    const match = usersData.users.find(
      (user) => user.email?.toLowerCase() === userEmail.toLowerCase(),
    );
    actorUserId = match?.id ?? null;
    if (!actorUserId) {
      console.error(`No auth user found for ${userEmail}`);
      process.exit(1);
    }
  }

  const { data: pools, error: poolsErr } = await supabase
    .from("pools")
    .select("id, name, tournament_edition_id, is_simulation, created_by_user_id");
  if (poolsErr) {
    console.error(poolsErr.message);
    process.exit(1);
  }

  const poolList = (pools ?? []) as PoolRow[];
  const sourcePool = poolList.find(
    (pool) => pool.name.toLowerCase() === sourcePoolName.toLowerCase(),
  );
  if (!sourcePool) {
    console.error(`Source pool not found: ${sourcePoolName}`);
    process.exit(1);
  }

  const participantRes = await supabase
    .from("participants")
    .select("id, pool_id, display_name, email, user_id")
    .eq("pool_id", sourcePool.id)
    .or(
      `display_name.ilike.%${participantQuery}%,email.ilike.%${participantQuery}%`,
    );
  if (participantRes.error) {
    console.error(participantRes.error.message);
    process.exit(1);
  }
  const participant = participantRes.data?.[0];
  if (!participant) {
    console.error(`Participant not found in ${sourcePool.name}: ${participantQuery}`);
    process.exit(1);
  }

  const moving: ParticipantMoveIdentity = {
    userId: (participant.user_id as string | null) ?? null,
    email: String(participant.email ?? ""),
    displayName: String(participant.display_name ?? ""),
  };

  let poolAdminMembershipIds = new Set<string>();
  if (actorUserId) {
    const { data: adminRows } = await supabase
      .from("pool_admins")
      .select("pool_id")
      .eq("user_id", actorUserId);
    poolAdminMembershipIds = new Set((adminRows ?? []).map((row) => row.pool_id as string));
  }

  let directManagedPools = poolList;
  if (actorUserId) {
    directManagedPools = poolList.filter(
      (pool) =>
        poolAdminMembershipIds.has(pool.id) || pool.created_by_user_id === actorUserId,
    );
  }

  const candidatePools = destinationPoolName
    ? directManagedPools.filter((pool) =>
        pool.name.toLowerCase().includes(destinationPoolName.toLowerCase()),
      )
    : directManagedPools;

  const destinationPoolIds = candidatePools.map((pool) => pool.id);
  const destinationParticipantsByPoolId = new Map<string, ParticipantMoveIdentity[]>();
  if (destinationPoolIds.length > 0) {
    const { data: destinationRows } = await supabase
      .from("participants")
      .select("pool_id, user_id, email, display_name")
      .in("pool_id", destinationPoolIds);
    for (const row of destinationRows ?? []) {
      const poolId = row.pool_id as string;
      const bucket = destinationParticipantsByPoolId.get(poolId) ?? [];
      bucket.push({
        userId: (row.user_id as string | null) ?? null,
        email: String(row.email ?? ""),
        displayName: String(row.display_name ?? ""),
      });
      destinationParticipantsByPoolId.set(poolId, bucket);
    }
  }

  console.log("Participant move destination diagnostics");
  console.log("----------------------------------------");
  console.log(`Source pool: ${sourcePool.name} (${sourcePool.id})`);
  console.log(`Source participant id: ${participant.id}`);
  console.log(`Source participant email: ${moving.email || "(empty)"}`);
  console.log(`Source participant user_id: ${moving.userId ?? "null"}`);
  console.log(`Source participant display_name: ${moving.displayName}`);
  if (actorUserId) {
    console.log(`Actor user: ${userEmail} (${actorUserId})`);
    console.log(`Direct pool_admins ids: ${[...poolAdminMembershipIds].join(", ") || "(none)"}`);
  } else {
    console.log("Actor user: not resolved (pass --user-email with service role key)");
  }
  console.log("");

  const sourceScope = worldCupPoolMoveScopeFromManagedPool(sourcePool);
  for (const pool of candidatePools) {
    const destinationParticipants = destinationParticipantsByPoolId.get(pool.id) ?? [];
    const duplicate = detectParticipantDuplicateInDestinationPool(
      moving,
      destinationParticipants,
    );
    const diagnostic = diagnoseMoveDestinationPool({
      sourcePool: sourceScope,
      destinationPool: pool,
      currentUserId: actorUserId ?? "",
      poolAdminMembershipIds,
      movingParticipant: moving,
      destinationParticipants,
    });
    const blockedLabel = formatMoveDestinationBlockedLabel(diagnostic);
    console.log(
      JSON.stringify(
        {
          destinationPoolId: pool.id,
          destinationPoolName: pool.name,
          destinationParticipantCount: destinationParticipants.length,
          destinationParticipants,
          directAdmin: diagnostic.directAdmin,
          compatible: diagnostic.compatible,
          duplicateUser: diagnostic.duplicateUser,
          duplicateEmail: diagnostic.duplicateEmail,
          duplicateMatchReason: diagnostic.duplicateMatchReason,
          matchedParticipant: diagnostic.matchedParticipant,
          excludedReason: diagnostic.excludedReason,
          blockedLabel,
        },
        null,
        2,
      ),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
