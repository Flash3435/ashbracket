#!/usr/bin/env tsx
/**
 * Dry-run: M101-only Spain finalist depth correction (NOT full-history).
 *
 * Only adjusts knockout awards for teams that progressed past the M100 cutoff
 * (currently Spain → finalist via M101). All other live ledger rows are left
 * untouched.
 *
 * Orphan rows: a live post-cutoff KO ledger award whose participant no longer
 * has a saved knockout prediction for that team (prediction cleared / removed
 * after the award was posted). The correction reduces only the incorrect M101
 * finalist increment (−8), grandfathering the pre-M101 cutoff amount. This does
 * not insert/update/delete predictions or tournament results.
 *
 * Does NOT write to the database.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { loadEnvLocal } from "./loadEnvLocal";
import { isKnockoutProgressionKind } from "../lib/predictions/knockoutProgressionKinds";
import {
  knockoutProgressionRank,
  participantMaximumPredictedDepthForTeam,
} from "../src/lib/scoring/knockoutOncePerTeamDepth";
import {
  FIFA_WC_2026_M101_KNOCKOUT_TRANSITION,
  buildCutoffOfficialTeamFurthestKnockoutKind,
  computeKnockoutTeamAward,
  knockoutScoringConfigFromTransition,
} from "../src/lib/scoring/knockoutScoringTransition";
import {
  betterKnockoutKind,
} from "../src/lib/scoring/knockoutOncePerTeamDepth";
import {
  mapPredictionRow,
  mapResultRow,
  mapScoringRuleRow,
} from "../src/lib/scoring/mapSupabaseRows";
import { isKnockoutPredictionScoringEligible } from "../lib/predictions/knockoutPickStatus";

loadEnvLocal();

const SPAIN = "153d854f-aa4e-4d42-83a9-ddbf2244b436";
const WWCD = "29388748-20bd-47c0-abcc-0b8ad0a0d23e";
const TRANSITIONAL = knockoutScoringConfigFromTransition(
  FIFA_WC_2026_M101_KNOCKOUT_TRANSITION,
);

const args = process.argv.slice(2);
const reportIdx = args.indexOf("--report-json");
const reportPath =
  reportIdx >= 0
    ? args[reportIdx + 1]?.trim()
    : "/tmp/m101-knockout-depth-transition-audit.json";
const poolIdx = args.indexOf("--pool");
const poolFilter = poolIdx >= 0 ? args[poolIdx + 1]?.trim() : "";

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
    for (const f of filters) q = q.eq(f.column, f.value);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < page) break;
  }
  return out;
}

function buildStandings(
  participants: { id: string; display_name: string | null }[],
  totals: Record<string, number>,
) {
  const rows = participants.map((p) => ({
    participantId: p.id,
    displayName: p.display_name ?? "?",
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

function countTies(standings: { rank: number }[]): number {
  const byRank = new Map<number, number>();
  for (const s of standings) byRank.set(s.rank, (byRank.get(s.rank) ?? 0) + 1);
  let ties = 0;
  for (const n of byRank.values()) if (n > 1) ties += 1;
  return ties;
}

function buildOfficialFurthest(
  results: { kind: string; teamId: string | null }[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of results) {
    if (!r.teamId || knockoutProgressionRank(r.kind) < 0) continue;
    m.set(r.teamId, betterKnockoutKind(m.get(r.teamId) ?? null, r.kind));
  }
  return m;
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
    .select("id, name, tournament_edition_id, is_simulation, archived_at")
    .is("archived_at", null)
    .eq("is_simulation", false);
  if (poolFilter) poolQuery = poolQuery.ilike("name", `%${poolFilter}%`);
  const { data: pools, error: poolErr } = await poolQuery.order("name");
  if (poolErr) throw new Error(poolErr.message);
  if (!pools?.length) {
    console.error("No live official pools found.");
    process.exit(1);
  }

  const byPool: Record<string, unknown> = {};
  let globalPtsRemoved = 0;
  let globalLosePlus8 = 0;
  let globalKeepPlus8 = 0;
  let globalOrphanCorrections = 0;
  let globalOrphanPtsRemoved = 0;
  let globalOrdinaryPtsRemoved = 0;

  console.log("\n=== M101 Spain depth transition audit (dry-run) ===");
  console.log(
    `Cutoff through ${FIFA_WC_2026_M101_KNOCKOUT_TRANSITION.cutoffAfterMatchCode}; ` +
      `only post-cutoff team progression (Spain/M101) is adjusted.`,
  );
  console.log("Other live ledger rows are preserved exactly.\n");

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

    const { data: m101Impact } = await sb
      .from("pool_activity")
      .select("id, created_at, metadata_json")
      .eq("pool_id", poolId)
      .eq("type", "ash_score_impact")
      .contains("metadata_json", { match_codes: ["M101"] })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const prevStandingsRaw = (
      m101Impact?.metadata_json as { previous_standings?: unknown }
    )?.previous_standings;
    const preM101FromActivity = new Map<string, number>();
    if (Array.isArray(prevStandingsRaw)) {
      for (const row of prevStandingsRaw) {
        if (row == null || typeof row !== "object") continue;
        const pid = (row as { participant_id?: unknown }).participant_id;
        const pts = (row as { total_points?: unknown }).total_points;
        if (typeof pid === "string" && typeof pts === "number") {
          preM101FromActivity.set(pid, pts);
        }
      }
    }

    const predictions = predRows.map((r) =>
      mapPredictionRow(r as Parameters<typeof mapPredictionRow>[0]),
    );
    const results = resultRows.map((r) =>
      mapResultRow(r as Parameters<typeof mapResultRow>[0]),
    );
    const scoringRules = ruleRows.map((r) =>
      mapScoringRuleRow(r as Parameters<typeof mapScoringRuleRow>[0]),
    );
    const rulesMap = new Map<string, number>(
      scoringRules
        .filter((r) => r.poolId === poolId)
        .map((r) => [r.predictionKind, r.points]),
    );

    const participants = partRows.map((p) => ({
      id: p.id as string,
      display_name: (p.display_name as string | null) ?? null,
    }));
    const displayName = Object.fromEntries(
      participants.map((p) => [p.id, p.display_name ?? "?"]),
    );

    const resultById = new Map(results.map((r) => [r.id, r]));
    const officialFurthest = buildOfficialFurthest(results);
    const cutoffFurthest = buildCutoffOfficialTeamFurthestKnockoutKind(
      results,
      FIFA_WC_2026_M101_KNOCKOUT_TRANSITION.cutoffMaxOfficialKind,
    );

    // Teams that gained official depth after the cutoff (M101+).
    const postCutoffTeams: string[] = [];
    for (const [teamId, current] of officialFurthest) {
      const cutoff = cutoffFurthest.get(teamId) ?? null;
      if (
        knockoutProgressionRank(current) >
        knockoutProgressionRank(cutoff ?? "")
      ) {
        postCutoffTeams.push(teamId);
      }
    }

    const predsByPart = new Map<string, typeof predictions>();
    for (const p of predictions) {
      if (
        !isKnockoutProgressionKind(p.predictionKind) ||
        !isKnockoutPredictionScoringEligible(p)
      ) {
        continue;
      }
      const list = predsByPart.get(p.participantId) ?? [];
      list.push(p);
      predsByPart.set(p.participantId, list);
    }

    const currentTotals: Record<string, number> = {};
    // Sum of live points for post-cutoff teams only (usually Spain).
    const livePostCutoffPts = new Map<string, number>();
    for (const row of ledgerRows) {
      const pid = row.participant_id as string;
      const pts = Number(row.points_delta);
      currentTotals[pid] = (currentTotals[pid] ?? 0) + pts;
      if (!isKnockoutProgressionKind(String(row.prediction_kind))) continue;
      const res = resultById.get(row.result_id as string);
      if (!res?.teamId || !postCutoffTeams.includes(res.teamId)) continue;
      livePostCutoffPts.set(
        `${pid}\0${res.teamId}`,
        (livePostCutoffPts.get(`${pid}\0${res.teamId}`) ?? 0) + pts,
      );
    }

    const spainRetainPlus8: string[] = [];
    const spainLosePlus8: string[] = [];
    const orphanCorrections: Array<Record<string, unknown>> = [];
    const finalistRank = knockoutProgressionRank("finalist");
    const deltas: Array<Record<string, unknown>> = [];
    const anomalous: Array<Record<string, unknown>> = [];
    const correctedTotals: Record<string, number> = { ...currentTotals };
    let ptsRemoved = 0;
    let ordinaryPtsRemoved = 0;
    let orphanPtsRemoved = 0;

    for (const p of participants) {
      const plist = predsByPart.get(p.id) ?? [];
      let partDelta = 0;
      let isOrphanCorrection = false;
      const teamDeltas: Array<Record<string, unknown>> = [];

      for (const teamId of postCutoffTeams) {
        const key = `${p.id}\0${teamId}`;
        const livePts = livePostCutoffPts.get(key) ?? 0;
        if (livePts === 0 && !plist.some((x) => x.teamId === teamId)) continue;

        const maxPredicted = participantMaximumPredictedDepthForTeam(
          plist,
          teamId,
        );
        let correctedPts: number;
        let awardNote: string;
        const orphan = !maxPredicted && livePts > 0;
        if (orphan) {
          // Orphan live post-cutoff row (prediction cleared): keep grandfathered
          // cutoff points only — remove the incorrect post-cutoff increment.
          const cutoffPts =
            cutoffFurthest.get(teamId) != null
              ? (rulesMap.get(cutoffFurthest.get(teamId)!) ?? 0)
              : 0;
          correctedPts = cutoffPts > 0 ? cutoffPts : 0;
          awardNote = `Knockout: orphan post-cutoff row grandfathered to cutoff (${correctedPts} pts)`;
        } else {
          const award = computeKnockoutTeamAward({
            currentOfficialKind: officialFurthest.get(teamId) ?? null,
            cutoffOfficialKind: cutoffFurthest.get(teamId) ?? null,
            maxPredictedKind: maxPredicted,
            rulesMap,
            config: TRANSITIONAL,
          });
          correctedPts = award.points;
          awardNote = award.note;
        }
        const d = correctedPts - livePts;
        if (d !== 0) {
          partDelta += d;
          if (orphan) isOrphanCorrection = true;
          teamDeltas.push({
            teamId,
            livePts,
            correctedPts,
            delta: d,
            maxPredicted,
            orphan,
            awardNote,
          });
        }

        if (teamId === SPAIN) {
          const hasSpain = plist.some((x) => x.teamId === SPAIN);
          if (orphan && d !== 0) {
            orphanCorrections.push({
              participantId: p.id,
              displayName: displayName[p.id],
              livePts,
              correctedPts,
              delta: d,
            });
          } else if (hasSpain) {
            if (
              maxPredicted &&
              knockoutProgressionRank(maxPredicted) >= finalistRank
            ) {
              spainRetainPlus8.push(p.id);
            } else if (livePts > 0 && d !== 0) {
              spainLosePlus8.push(p.id);
            }
          }
        }
      }

      correctedTotals[p.id] = (currentTotals[p.id] ?? 0) + partDelta;
      if (partDelta !== 0) {
        const row = {
          participantId: p.id,
          displayName: displayName[p.id],
          current: currentTotals[p.id] ?? 0,
          corrected: correctedTotals[p.id],
          deltaCurrentToCorrected: partDelta,
          correctionKind: isOrphanCorrection ? "orphan" : "ordinary",
          preM101Activity: preM101FromActivity.get(p.id) ?? null,
          spainMaxPredicted: participantMaximumPredictedDepthForTeam(
            plist,
            SPAIN,
          ),
          teamDeltas,
        };
        deltas.push(row);
        if (partDelta < 0) {
          ptsRemoved += partDelta;
          if (isOrphanCorrection) orphanPtsRemoved += partDelta;
          else ordinaryPtsRemoved += partDelta;
        }
        if (partDelta !== -8 && partDelta !== 8 && partDelta !== 0) {
          anomalous.push(row);
        }
      }
    }

    for (const p of participants) {
      currentTotals[p.id] = currentTotals[p.id] ?? 0;
      correctedTotals[p.id] = correctedTotals[p.id] ?? 0;
    }

    const currentStandings = buildStandings(participants, currentTotals);
    const correctedStandings = buildStandings(participants, correctedTotals);
    const currentRank = Object.fromEntries(
      currentStandings.map((s) => [s.participantId, s.rank]),
    );
    const correctedRank = Object.fromEntries(
      correctedStandings.map((s) => [s.participantId, s.rank]),
    );
    for (const d of deltas) {
      const pid = d.participantId as string;
      d.currentRank = currentRank[pid];
      d.correctedRank = correctedRank[pid];
      d.rankChange = (currentRank[pid] ?? 0) - (correctedRank[pid] ?? 0);
    }

    const rankChanges = deltas.filter((d) => (d.rankChange as number) !== 0)
      .length;
    globalPtsRemoved += ptsRemoved;
    globalLosePlus8 += spainLosePlus8.length;
    globalKeepPlus8 += spainRetainPlus8.length;
    globalOrphanCorrections += orphanCorrections.length;
    globalOrphanPtsRemoved += orphanPtsRemoved;
    globalOrdinaryPtsRemoved += ordinaryPtsRemoved;

    const wwcd = deltas.find((d) => d.participantId === WWCD) ?? {
      participantId: WWCD,
      displayName: displayName[WWCD],
      current: currentTotals[WWCD] ?? 0,
      corrected: correctedTotals[WWCD] ?? 0,
      deltaCurrentToCorrected:
        (correctedTotals[WWCD] ?? 0) - (currentTotals[WWCD] ?? 0),
      preM101Activity: preM101FromActivity.get(WWCD) ?? null,
      spainMaxPredicted: participantMaximumPredictedDepthForTeam(
        predsByPart.get(WWCD) ?? [],
        SPAIN,
      ),
      currentRank: currentRank[WWCD],
      correctedRank: correctedRank[WWCD],
    };

    console.log(`\n--- ${poolName} ---`);
    console.log(`Post-cutoff teams: ${postCutoffTeams.join(", ") || "(none)"}`);
    console.log(
      `Ordinary participant −8: ${spainLosePlus8.length} (= ${ordinaryPtsRemoved} pts)`,
    );
    console.log(
      `Orphan ledger −8: ${orphanCorrections.length} (= ${orphanPtsRemoved} pts)`,
    );
    console.log(
      `Spain Final/Champion retain +8: ${spainRetainPlus8.length}`,
    );
    console.log(
      `Total points removed: ${ptsRemoved} ` +
        `(ordinary ${ordinaryPtsRemoved} + orphan ${orphanPtsRemoved})`,
    );
    console.log(
      `Rank changes: ${rankChanges}; ties ${countTies(currentStandings)} → ${countTies(correctedStandings)}`,
    );
    if (orphanCorrections.length) {
      console.log(
        `  Orphans: ${orphanCorrections.map((o) => o.displayName).join(", ")}`,
      );
    }
    if (anomalous.length) {
      console.log(`Anomalous (not ±8/0): ${anomalous.length}`);
      for (const a of anomalous.slice(0, 8)) {
        console.log(
          `  ${a.displayName}: ${a.current} → ${a.corrected} (Δ ${a.deltaCurrentToCorrected}) Spain ${a.spainMaxPredicted}`,
          a.teamDeltas,
        );
      }
    }
    if (poolName.toLowerCase().includes("fampool")) {
      console.log(
        `WWCD: ${wwcd.current} → ${wwcd.corrected} (Δ ${wwcd.deltaCurrentToCorrected}); ranks ${wwcd.currentRank}→${wwcd.correctedRank}; Spain ${wwcd.spainMaxPredicted}; activity pre ${wwcd.preM101Activity}`,
      );
    }

    byPool[poolId] = {
      poolName,
      postCutoffTeams,
      ordinaryParticipantCorrections: spainLosePlus8.length,
      ordinaryPointsRemoved: ordinaryPtsRemoved,
      orphanCorrections: orphanCorrections.length,
      orphanPointsRemoved: orphanPtsRemoved,
      spainLosePlus8Count: spainLosePlus8.length,
      spainRetainPlus8Count: spainRetainPlus8.length,
      spainLosePlus8Names: spainLosePlus8.map((id) => displayName[id]),
      spainRetainPlus8Names: spainRetainPlus8.map((id) => displayName[id]),
      orphanNames: orphanCorrections.map((o) => o.displayName),
      orphanDetails: orphanCorrections,
      m101PointsThatShouldRemain: spainRetainPlus8.length * 8,
      m101IncorrectPointsToRemove: spainLosePlus8.length * 8,
      totalPointsRemoved: ptsRemoved,
      rankChanges,
      tiesBefore: countTies(currentStandings),
      tiesAfter: countTies(correctedStandings),
      anomalousDeltas: anomalous,
      affectedParticipants: deltas,
      wwcd,
      currentStandings,
      correctedStandings,
      m101ImpactActivityId: m101Impact?.id ?? null,
    };
  }

  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        policy: FIFA_WC_2026_M101_KNOCKOUT_TRANSITION,
        note:
          "M101-only post-cutoff team adjustment; preserves all other live ledger rows. " +
          "Orphan = live Spain finalist award with no surviving Spain knockout prediction; " +
          "adjusted −8 only (grandfather cutoff SF points). Does not mutate predictions/results.",
        orphanDefinition:
          "A points_ledger knockout row for a post-cutoff team (Spain/M101) whose participant " +
          "no longer has any saved knockout prediction for that team. Safe to adjust because we " +
          "only remove the incorrect uncapped M101 finalist increment and keep the pre-M101 " +
          "grandfathered cutoff points; predictions and official results are never written.",
        totals: {
          pools: pools.length,
          ordinaryParticipantCorrections: globalLosePlus8,
          ordinaryPointsRemoved: globalOrdinaryPtsRemoved,
          orphanCorrections: globalOrphanCorrections,
          orphanPointsRemoved: globalOrphanPtsRemoved,
          spainLosePlus8: globalLosePlus8,
          spainRetainPlus8: globalKeepPlus8,
          pointsRemoved: globalPtsRemoved,
        },
        pools: byPool,
      },
      null,
      2,
    ),
  );
  console.log(`\nWrote ${reportPath}`);
  console.log(
    `\nAll-pools reconciliation:` +
      `\n  ordinary −8: ${globalLosePlus8} (= ${globalOrdinaryPtsRemoved} pts)` +
      `\n  orphan −8:   ${globalOrphanCorrections} (= ${globalOrphanPtsRemoved} pts)` +
      `\n  total:       ${globalPtsRemoved} pts` +
      `\n  retain +8:   ${globalKeepPlus8}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
