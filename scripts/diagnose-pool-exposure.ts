#!/usr/bin/env tsx
/**
 * Read-only diagnostic for Phase 1/2 pool exposure gating.
 *
 * Usage:
 *   npx tsx scripts/diagnose-pool-exposure.ts <poolId>
 *   npx tsx scripts/diagnose-pool-exposure.ts --pool-name "work"
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./loadEnvLocal";
import { fetchChampionPickExposureForPool } from "../lib/pool/fetchChampionPickExposureForPool";
import { fetchKnockoutMatchExposureForPool } from "../lib/pool/fetchKnockoutMatchExposureForPool";
import {
  buildCompletionStatusForParticipant,
  loadPicksCompletenessInputsForPool,
} from "../lib/communications/picksCompleteness";
import { poolLocked } from "../lib/pools/poolLocked";
import { fetchOfficialRoundOf32Complete } from "../lib/tournament/fetchOfficialRoundOf32Complete";

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const args = process.argv.slice(2);
let poolId = "";
let poolNameFilter = "";

for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (a === "--pool-name" && args[i + 1]) {
    poolNameFilter = args[++i]!.trim().toLowerCase();
    continue;
  }
  if (!poolId && !a.startsWith("--")) poolId = a.trim();
}

const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function resolvePoolId(): Promise<string> {
  if (poolId) return poolId;
  if (poolNameFilter) {
    const { data } = await service
      .from("pools")
      .select("id, name")
      .ilike("name", `%${poolNameFilter}%`)
      .limit(5);
    const rows = data ?? [];
    if (rows.length === 0) throw new Error(`No pool matching name: ${poolNameFilter}`);
    console.log("Matched pools:", rows.map((r) => `${r.id} (${r.name})`).join(", "));
    return rows[0]!.id as string;
  }
  const { data } = await service
    .from("pools")
    .select("id, name, is_public")
    .eq("is_public", true)
    .order("created_at", { ascending: true })
    .limit(1);
  if (!data?.[0]?.id) throw new Error("No public pool found");
  return data[0].id as string;
}

async function diagnoseFetchers(label: string) {
  console.log(`\n=== ${label} ===`);

  const champion = await fetchChampionPickExposureForPool(resolvedPoolId);
  const match = await fetchKnockoutMatchExposureForPool(resolvedPoolId);

  console.log("championExposure:", JSON.stringify(champion, null, 2));
  console.log("matchExposure:", JSON.stringify(match, null, 2));
}

let resolvedPoolId = "";

async function main() {
  resolvedPoolId = await resolvePoolId();

  const { data: pool } = await service
    .from("pools")
    .select("id, name, lock_at, tournament_edition_id, is_public, is_simulation")
    .eq("id", resolvedPoolId)
    .maybeSingle();

  console.log("Pool:", pool);
  console.log("picksLocked:", poolLocked(pool?.lock_at as string | null));

  const { data: parRows } = await service
    .from("participants")
    .select("id")
    .eq("pool_id", resolvedPoolId);
  const participantIds = (parRows ?? []).map((r) => r.id as string);
  console.log("participantCount:", participantIds.length);

  const inputsService = await loadPicksCompletenessInputsForPool(
    service,
    resolvedPoolId,
    participantIds,
  );
  const inputsAnon = anonKey
    ? await loadPicksCompletenessInputsForPool(
        createClient(url!, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        }),
        resolvedPoolId,
        participantIds,
      )
    : null;

  console.log("\n--- loadPicksCompletenessInputsForPool ---");
  console.log("service role inputs:", inputsService ? "ok" : "null");
  console.log("anon inputs:", inputsAnon ? "ok" : "null");
  if (inputsService) {
    console.log("predictionCount (service):", inputsService.predictions.length);
    console.log("knockoutBracketPicksUnlocked (service):", inputsService.knockoutBracketPicksUnlocked);
  }
  if (inputsAnon) {
    console.log("predictionCount (anon):", inputsAnon.predictions.length);
    console.log("knockoutBracketPicksUnlocked (anon):", inputsAnon.knockoutBracketPicksUnlocked);
  }

  if (inputsService) {
    let complete = 0;
    for (const pid of participantIds) {
      if (buildCompletionStatusForParticipant(inputsService, pid).isComplete) complete++;
    }
    console.log("completeParticipants (service):", complete);

    const r32Stage = Object.values(inputsService.stageByCode).find(
      (s) => s?.code === "round_of_32",
    );
    if (r32Stage && pool?.tournament_edition_id) {
      const r32Complete = await fetchOfficialRoundOf32Complete(
        service,
        r32Stage.id,
        pool.tournament_edition_id as string,
      );
      console.log("official_round_of_32_complete RPC:", r32Complete);
    }
  }

  await diagnoseFetchers("Exposure fetchers (service role, public-safe aggregates)");

  if (anonKey) {
    await diagnoseFetchers("Same fetchers (anonymous page — no RLS client needed)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
