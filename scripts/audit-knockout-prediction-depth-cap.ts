#!/usr/bin/env tsx
/**
 * Dry-run: knockout prediction-depth cap correction impact across live official pools.
 *
 * Does NOT write to the database. Does NOT recompute ledgers.
 *
 * Compares current `points_ledger` knockout once-per-team rows against
 * `computePoolScores` with awardedDepth = min(officialFurthest, maxPredicted).
 *
 * Usage:
 *   npx tsx scripts/audit-knockout-prediction-depth-cap.ts
 *   npx tsx scripts/audit-knockout-prediction-depth-cap.ts --report-json /tmp/ko-depth-cap-audit.json
 *   npx tsx scripts/audit-knockout-prediction-depth-cap.ts --pool "Fampool 2026"
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { loadEnvLocal } from "./loadEnvLocal";
import { KNOCKOUT_PROGRESSION_PREDICTION_KINDS } from "../lib/predictions/knockoutProgressionKinds";
import { computePoolScores } from "../src/lib/scoring/computePoolScores";
import {
  betterKnockoutKind,
  knockoutDepthBucketLabel,
  participantMaximumPredictedDepthForTeam,
} from "../src/lib/scoring/knockoutOncePerTeamDepth";
import {
  mapPredictionRow,
  mapResultRow,
  mapScoringRuleRow,
} from "../src/lib/scoring/mapSupabaseRows";
import type { Prediction } from "../src/types/domain";

loadEnvLocal();

const KO = new Set<string>(KNOCKOUT_PROGRESSION_PREDICTION_KINDS);
const SPAIN = "153d854f-aa4e-4d42-83a9-ddbf2244b436";

const args = process.argv.slice(2);
const reportIdx = args.indexOf("--report-json");
const reportPath =
  reportIdx >= 0
    ? args[reportIdx + 1]?.trim()
    : "/tmp/knockout-prediction-depth-cap-audit.json";
const poolIdx = args.indexOf("--pool");
const poolFilter = poolIdx >= 0 ? args[poolIdx + 1]?.trim() : "";

type RowDiff = {
  poolId: string;
  poolName: string;
  participantId: string;
  displayName: string;
  teamId: string;
  teamName: string;
  maxPredictedDepth: string | null;
  officialFurthestDepth: string | null;
  currentKind: string | null;
  currentPoints: number;
  correctedKind: string | null;
  correctedPoints: number;
  pointDelta: number;
};

async function fetchAll(
  sb: SupabaseClient,
  table: string,
  select: string,
  filters: { column: string; value: string }[],
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = sb.from(table).select(select).range(from, from + page - 1);
    for (const f of filters) {
      q = q.eq(f.column, f.value);
    }
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    out.push(...rows);
    if (!data || data.length < page) break;
  }
  return out;
}

function buildStandings(
  participants: { id: string; display_name: string | null }[],
  totals: Record<string, number>,
): { participantId: string; points: number; rank: number }[] {
  const rows = participants.map((p) => ({
    participantId: p.id,
    points: totals[p.id] ?? 0,
  }));
  rows.sort(
    (a, b) =>
      b.points - a.points || a.participantId.localeCompare(b.participantId),
  );
  let rank = 0;
  let lastPts: number | null = null;
  return rows.map((row, i) => {
    if (lastPts === null || row.points !== lastPts) {
      rank = i + 1;
      lastPts = row.points;
    }
    return { ...row, rank };
  });
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let poolQuery = sb
    .from("pools")
    .select(
      "id, name, tournament_edition_id, is_simulation, archived_at, group_advance_exact_points, group_advance_wrong_slot_points",
    )
    .is("archived_at", null)
    .eq("is_simulation", false);
  if (poolFilter) {
    poolQuery = poolQuery.ilike("name", `%${poolFilter}%`);
  }
  const { data: pools, error: poolErr } = await poolQuery.order("name");
  if (poolErr) throw new Error(poolErr.message);
  if (!pools?.length) {
    console.error("No live official pools found.");
    process.exit(1);
  }

  const { data: teams } = await sb.from("teams").select("id, name, fifa_code");
  const teamName = Object.fromEntries(
    (teams ?? []).map((t) => [t.id as string, t.name as string]),
  );

  const editionIds = [
    ...new Set(pools.map((p) => p.tournament_edition_id as string)),
  ];
  const groupStages: Record<string, string> = {};
  for (const editionId of editionIds) {
    const { data } = await sb
      .from("tournament_stages")
      .select("id")
      .eq("edition_id", editionId)
      .eq("code", "group")
      .maybeSingle();
    if (data?.id) groupStages[editionId] = data.id as string;
  }

  const allDiffs: RowDiff[] = [];
  const byPool: Record<string, Record<string, unknown>> = {};

  for (const pool of pools) {
    const poolId = pool.id as string;
    const poolName = pool.name as string;
    const editionId = pool.tournament_edition_id as string;

    const [predRows, ledgerRows, resultRows, ruleRows, partRows] =
      await Promise.all([
        fetchAll(sb, "predictions", "*", [{ column: "pool_id", value: poolId }]),
        fetchAll(
          sb,
          "points_ledger",
          "id, participant_id, points_delta, prediction_kind, prediction_id, result_id, note",
          [{ column: "pool_id", value: poolId }],
        ),
        fetchAll(sb, "results", "*", [{ column: "edition_id", value: editionId }]),
        fetchAll(sb, "scoring_rules", "*", [{ column: "pool_id", value: poolId }]),
        fetchAll(sb, "participants", "id, display_name", [
          { column: "pool_id", value: poolId },
        ]),
      ]);

    const predictions = predRows.map((r) =>
      mapPredictionRow(r as Parameters<typeof mapPredictionRow>[0]),
    );
    const results = resultRows.map((r) =>
      mapResultRow(r as Parameters<typeof mapResultRow>[0]),
    );
    const scoringRules = ruleRows.map((r) =>
      mapScoringRuleRow(r as Parameters<typeof mapScoringRuleRow>[0]),
    );
    const participants = partRows.map((p) => ({
      id: p.id as string,
      display_name: (p.display_name as string | null) ?? null,
    }));
    const displayName = Object.fromEntries(
      participants.map((p) => [p.id, p.display_name ?? "?"]),
    );

    const groupStageId = groupStages[editionId];
    const corrected = computePoolScores({
      poolId,
      predictions,
      results,
      scoringRules,
      groupStageScoring: groupStageId
        ? {
            groupStageId,
            exactPoints: Number(pool.group_advance_exact_points ?? 3),
            wrongSlotPoints: Number(pool.group_advance_wrong_slot_points ?? 1),
          }
        : null,
    });

    const predById = new Map(predictions.map((p) => [p.id, p]));

    // Official furthest per team
    const officialFurthest = new Map<string, string>();
    for (const r of results) {
      if (!r.teamId || !KO.has(r.kind)) continue;
      officialFurthest.set(
        r.teamId,
        betterKnockoutKind(officialFurthest.get(r.teamId) ?? null, r.kind),
      );
    }

    // Current KO ledger by participant+team
    type KoAward = { kind: string; points: number; predictionId: string | null };
    const currentByPartTeam = new Map<string, KoAward>();
    const currentTotals: Record<string, number> = {};
    for (const row of ledgerRows) {
      const pid = row.participant_id as string;
      const pts = Number(row.points_delta);
      currentTotals[pid] = (currentTotals[pid] ?? 0) + pts;
      const kind = row.prediction_kind as string | null;
      if (!kind || !KO.has(kind) || pts <= 0) continue;
      const pred = predById.get(row.prediction_id as string);
      const teamId = pred?.teamId?.trim();
      if (!teamId) continue;
      const key = `${pid}|${teamId}`;
      const prev = currentByPartTeam.get(key);
      if (!prev || pts > prev.points) {
        currentByPartTeam.set(key, {
          kind,
          points: pts,
          predictionId: (row.prediction_id as string) ?? null,
        });
      }
    }

    const correctedByPartTeam = new Map<string, KoAward>();
    for (const line of corrected.ledgerLines) {
      if (!KO.has(line.predictionKind) || line.pointsDelta <= 0) continue;
      const pred = predById.get(line.predictionId);
      const teamId = pred?.teamId?.trim();
      if (!teamId) continue;
      const key = `${line.participantId}|${teamId}`;
      correctedByPartTeam.set(key, {
        kind: line.predictionKind,
        points: line.pointsDelta,
        predictionId: line.predictionId,
      });
    }

    const predsByParticipant = new Map<string, Prediction[]>();
    for (const p of predictions) {
      if (!KO.has(p.predictionKind) || !p.teamId?.trim()) continue;
      const list = predsByParticipant.get(p.participantId) ?? [];
      list.push(p);
      predsByParticipant.set(p.participantId, list);
    }

    const keys = new Set([
      ...currentByPartTeam.keys(),
      ...correctedByPartTeam.keys(),
    ]);
    const poolDiffs: RowDiff[] = [];
    const otherTeams: Record<string, number> = {};
    let spainRows = 0;
    let spainPts = 0;

    for (const key of keys) {
      const [participantId, teamId] = key.split("|") as [string, string];
      const cur = currentByPartTeam.get(key);
      const next = correctedByPartTeam.get(key);
      const currentPoints = cur?.points ?? 0;
      const correctedPoints = next?.points ?? 0;
      if (currentPoints === correctedPoints && cur?.kind === next?.kind) {
        continue;
      }
      const partPreds = predsByParticipant.get(participantId) ?? [];
      const maxPredicted = participantMaximumPredictedDepthForTeam(partPreds, teamId);
      const delta = correctedPoints - currentPoints;
      const diff: RowDiff = {
        poolId,
        poolName,
        participantId,
        displayName: displayName[participantId] ?? "?",
        teamId,
        teamName: teamName[teamId] ?? teamId,
        maxPredictedDepth: maxPredicted,
        officialFurthestDepth: officialFurthest.get(teamId) ?? null,
        currentKind: cur?.kind ?? null,
        currentPoints,
        correctedKind: next?.kind ?? null,
        correctedPoints,
        pointDelta: delta,
      };
      poolDiffs.push(diff);
      allDiffs.push(diff);
      if (teamId === SPAIN) {
        spainRows += 1;
        spainPts += delta;
      } else {
        otherTeams[diff.teamName] = (otherTeams[diff.teamName] ?? 0) + delta;
      }
    }

    const currentStandings = buildStandings(participants, currentTotals);
    const correctedStandings = buildStandings(
      participants,
      corrected.totalsByParticipantId,
    );
    const curRank = Object.fromEntries(
      currentStandings.map((r) => [r.participantId, r.rank]),
    );
    const newRank = Object.fromEntries(
      correctedStandings.map((r) => [r.participantId, r.rank]),
    );
    const affectedPartIds = new Set(poolDiffs.map((d) => d.participantId));
    let rankChanges = 0;
    for (const pid of Object.keys(curRank)) {
      if (curRank[pid] !== newRank[pid]) rankChanges += 1;
    }

    const pointsToRemove = poolDiffs.reduce(
      (s, d) => s + Math.min(0, d.pointDelta),
      0,
    );
    const largestReduction = poolDiffs.reduce(
      (m, d) => Math.min(m, d.pointDelta),
      0,
    );

    const rankMoves = participants
      .map((p) => ({
        participantId: p.id,
        displayName: displayName[p.id] ?? "?",
        beforeRank: curRank[p.id] ?? null,
        afterRank: newRank[p.id] ?? null,
        beforePoints: currentTotals[p.id] ?? 0,
        afterPoints: corrected.totalsByParticipantId[p.id] ?? 0,
        rankDelta:
          (curRank[p.id] ?? 0) - (newRank[p.id] ?? 0), // positive = moved up
      }))
      .filter((r) => r.beforeRank !== r.afterRank);

    const upward = rankMoves
      .filter((r) => r.rankDelta > 0)
      .sort((a, b) => b.rankDelta - a.rankDelta);
    const downward = rankMoves
      .filter((r) => r.rankDelta < 0)
      .sort((a, b) => a.rankDelta - b.rankDelta);

    const countTies = (
      standings: { points: number; rank: number }[],
    ): number => {
      const byRank = new Map<number, number>();
      for (const s of standings) {
        byRank.set(s.rank, (byRank.get(s.rank) ?? 0) + 1);
      }
      let ties = 0;
      for (const n of byRank.values()) {
        if (n > 1) ties += n;
      }
      return ties;
    };
    const tiesBefore = countTies(currentStandings);
    const tiesAfter = countTies(correctedStandings);

    const negativeOrZeroAfter = correctedStandings
      .filter((s) => s.points <= 0)
      .map((s) => ({
        participantId: s.participantId,
        displayName: displayName[s.participantId] ?? "?",
        points: s.points,
      }));

    byPool[poolId] = {
      poolName,
      affectedParticipants: affectedPartIds.size,
      affectedRows: poolDiffs.length,
      pointsToRemove,
      rankChanges,
      largestReduction,
      spainM101Rows: spainRows,
      spainM101PointsRemoved: spainPts,
      otherTeamsOverAwarded: otherTeams,
      standingsImpact: {
        tiesBefore,
        tiesAfter,
        tiesCreated: Math.max(0, tiesAfter - tiesBefore),
        tiesRemoved: Math.max(0, tiesBefore - tiesAfter),
        largestUpwardRankMove: upward[0]
          ? {
              displayName: upward[0].displayName,
              ranksUp: upward[0].rankDelta,
              beforeRank: upward[0].beforeRank,
              afterRank: upward[0].afterRank,
            }
          : null,
        largestDownwardRankMove: downward[0]
          ? {
              displayName: downward[0].displayName,
              ranksDown: Math.abs(downward[0].rankDelta),
              beforeRank: downward[0].beforeRank,
              afterRank: downward[0].afterRank,
            }
          : null,
        negativeOrZeroTotalsAfter: negativeOrZeroAfter.filter(
          (r) => r.points < 0,
        ),
        zeroTotalsAfter: negativeOrZeroAfter.filter((r) => r.points === 0),
      },
    };

    console.log(
      `\n=== ${poolName} (${poolId}) ===\n` +
        `affected_participants=${affectedPartIds.size} affected_rows=${poolDiffs.length} ` +
        `points_to_remove=${pointsToRemove} rank_changes=${rankChanges} ` +
        `largest_reduction=${largestReduction} spain_rows=${spainRows} spain_pts=${spainPts}\n` +
        `ties_before=${tiesBefore} ties_after=${tiesAfter} ` +
        `up=${upward[0] ? `${upward[0].displayName}+${upward[0].rankDelta}` : "—"} ` +
        `down=${downward[0] ? `${downward[0].displayName}-${Math.abs(downward[0].rankDelta)}` : "—"}`,
    );
    for (const d of poolDiffs
      .slice()
      .sort((a, b) => a.pointDelta - b.pointDelta)
      .slice(0, 25)) {
      console.log(
        `  ${d.displayName} | ${d.teamName} | ${d.maxPredictedDepth}→${d.officialFurthestDepth} | ${d.currentKind}:${d.currentPoints} → ${d.correctedKind}:${d.correctedPoints} (${d.pointDelta})`,
      );
    }
    if (poolDiffs.length > 25) {
      console.log(`  … ${poolDiffs.length - 25} more rows`);
    }
  }

  function buildDepthBuckets(rows: RowDiff[]) {
    const buckets: Record<
      string,
      {
        label: string;
        affectedParticipants: number;
        affectedRows: number;
        pointsRemoved: number;
        examples: Array<{
          pool: string;
          participant: string;
          team: string;
          predicted: string | null;
          official: string | null;
          oldPoints: number;
          correctedPoints: number;
          pointDelta: number;
          why: string;
        }>;
      }
    > = {};
    for (const d of rows) {
      const key = d.maxPredictedDepth ?? "unknown";
      const label = knockoutDepthBucketLabel(d.maxPredictedDepth);
      if (!buckets[key]) {
        buckets[key] = {
          label,
          affectedParticipants: 0,
          affectedRows: 0,
          pointsRemoved: 0,
          examples: [],
        };
      }
      const b = buckets[key]!;
      b.affectedRows += 1;
      b.pointsRemoved += Math.min(0, d.pointDelta);
      if (b.examples.length < 5) {
        b.examples.push({
          pool: d.poolName,
          participant: d.displayName,
          team: d.teamName,
          predicted: d.maxPredictedDepth,
          official: d.officialFurthestDepth,
          oldPoints: d.currentPoints,
          correctedPoints: d.correctedPoints,
          pointDelta: d.pointDelta,
          why: `${d.maxPredictedDepth} → ${d.officialFurthestDepth} → old ${d.currentKind}:${d.currentPoints} → corrected ${d.correctedKind}:${d.correctedPoints}`,
        });
      }
    }
    for (const b of Object.values(buckets)) {
      b.affectedParticipants = new Set(
        rows
          .filter(
            (d) =>
              (d.maxPredictedDepth ?? "unknown") ===
              Object.keys(buckets).find((k) => buckets[k] === b),
          )
          .map((d) => d.participantId),
      ).size;
    }
    // Fix participant counts per bucket properly
    for (const [key, b] of Object.entries(buckets)) {
      b.affectedParticipants = new Set(
        rows
          .filter((d) => (d.maxPredictedDepth ?? "unknown") === key)
          .map((d) => d.participantId),
      ).size;
    }
    return buckets;
  }

  const wwcdRows = allDiffs.filter(
    (d) => d.participantId === "29388748-20bd-47c0-abcc-0b8ad0a0d23e",
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    poolCount: pools.length,
    affectedParticipants: new Set(allDiffs.map((d) => d.participantId)).size,
    affectedRows: allDiffs.length,
    totalPointsToRemove: allDiffs.reduce(
      (s, d) => s + Math.min(0, d.pointDelta),
      0,
    ),
    largestReduction: allDiffs.reduce((m, d) => Math.min(m, d.pointDelta), 0),
    depthBuckets: buildDepthBuckets(allDiffs),
    spainImpact: {
      rows: allDiffs.filter((d) => d.teamId === SPAIN).length,
      pointsDelta: allDiffs
        .filter((d) => d.teamId === SPAIN)
        .reduce((s, d) => s + d.pointDelta, 0),
      participants: new Set(
        allDiffs.filter((d) => d.teamId === SPAIN).map((d) => d.participantId),
      ).size,
    },
    otherTeams: allDiffs
      .filter((d) => d.teamId !== SPAIN)
      .reduce(
        (acc, d) => {
          acc[d.teamName] = (acc[d.teamName] ?? 0) + d.pointDelta;
          return acc;
        },
        {} as Record<string, number>,
      ),
    byPool,
    wwcd: {
      rows: wwcdRows,
      totalDelta: wwcdRows.reduce((s, d) => s + d.pointDelta, 0),
      byTeam: Object.fromEntries(
        wwcdRows.map((d) => [
          d.teamName,
          {
            predicted: d.maxPredictedDepth,
            official: d.officialFurthestDepth,
            old: `${d.currentKind}:${d.currentPoints}`,
            corrected: `${d.correctedKind}:${d.correctedPoints}`,
            delta: d.pointDelta,
          },
        ]),
      ),
    },
  };

  console.log("\n=== GLOBAL SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  if (reportPath) {
    writeFileSync(
      reportPath,
      JSON.stringify({ summary, rows: allDiffs }, null, 2),
    );
    console.log(`\nWrote ${reportPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
