#!/usr/bin/env tsx
/**
 * Compare latest score-impact deltas vs match attribution and third-place picks.
 *
 *   npx tsx scripts/audit-score-impact-breakdown.ts "FAMPOOL 2026"
 */
import { createClient } from "@supabase/supabase-js";
import { buildPoolStandingsFromLedger } from "../lib/leaderboard/buildPoolStandingsFromLedger";
import { fetchPoolLedgerLinesForStandings } from "../lib/leaderboard/fetchPoolLedgerLinesForStandings";
import { fetchLeaderboardLatestScoreImpactForPool } from "../lib/leaderboard/fetchLeaderboardLatestScoreImpactForPool";
import {
  formatLeaderboardLatestImpactSummary,
} from "../lib/leaderboard/leaderboardBracketImpactDisplay";
import { formatRecentPointsDelta } from "../lib/leaderboard/leaderboardMomentumDisplay";
import { loadEnvLocal } from "./loadEnvLocal";

async function main() {
  const identifier = process.argv[2]?.trim() ?? "FAMPOOL 2026";
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

  const { data: pools, error: poolErr } = await supabase
    .from("pools")
    .select("id, name")
    .ilike("name", `%${identifier}%`);
  if (poolErr || !pools?.length) {
    console.error(poolErr?.message ?? `No pool matching ${identifier}`);
    process.exit(1);
  }
  if (pools.length > 1) {
    console.error(`Ambiguous pool: ${pools.map((p) => p.name).join(", ")}`);
    process.exit(1);
  }

  const pool = pools[0]!;
  const poolId = pool.id as string;

  const { data: participants, error: pErr } = await supabase
    .from("participants")
    .select("id, display_name")
    .eq("pool_id", poolId);
  if (pErr) throw new Error(pErr.message);

  const ledgerRes = await fetchPoolLedgerLinesForStandings(supabase, poolId);
  if (!ledgerRes.ok) throw new Error(ledgerRes.error);

  const standings = buildPoolStandingsFromLedger({
    poolId,
    poolName: pool.name as string,
    participants: (participants ?? []).map((p) => ({
      id: p.id as string,
      display_name: p.display_name as string | null,
    })),
    ledgerLines: ledgerRes.ledgerLines,
  });

  const currentRows = standings;

  const loaded = await fetchLeaderboardLatestScoreImpactForPool(
    supabase,
    poolId,
    currentRows,
  );
  const momentumById = new Map(
    loaded.momentum?.rows.map((row) => [row.participantId, row]) ?? [],
  );

  console.log(`\n=== Score impact breakdown audit: ${pool.name} ===`);
  console.log(
    `Event: ${loaded.event?.eventKind ?? "—"}  matches: ${loaded.event?.matchCodes.join(", ") ?? "—"}`,
  );
  console.log(
    "\ndisplay_name\tmatch_pts\tthird_place_pts\tother_pts\ttotal_delta\told_total\tnew_total\tpts_suffix\tlatest_line\tcorrection_line",
  );

  for (const row of [...currentRows].sort((a, b) => a.rank - b.rank)) {
    const momentum = momentumById.get(row.participantId);
    const breakdown = loaded.pointsBreakdownByParticipantId.get(row.participantId);
    const summary = formatLeaderboardLatestImpactSummary({
      totalPoints: row.totalPoints,
      momentum,
      event: loaded.event,
      pointsBreakdown: breakdown,
      participantId: row.participantId,
      displayName: row.displayName,
    });
    const suffix = formatRecentPointsDelta(momentum ?? null, {
      showZero: true,
      latestSuffix: true,
      pointsBreakdown: breakdown,
      event: loaded.event ?? undefined,
    });

    console.log(
      [
        row.displayName,
        breakdown?.latestMatchPointsDelta ?? "—",
        breakdown?.thirdPlaceQualifierDelta ?? "—",
        breakdown?.otherScoringDelta ?? "—",
        momentum?.recentPointsGained ?? "—",
        momentum?.previousPoints ?? "—",
        momentum?.currentPoints ?? row.totalPoints,
        suffix ?? "—",
        summary.latestLine ?? "—",
        summary.correctionLine ?? "—",
      ].join("\t"),
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
