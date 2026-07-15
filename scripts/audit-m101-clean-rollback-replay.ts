#!/usr/bin/env tsx
/**
 * Dry-run audit: clean M101 rollback-and-replay plan for every live official pool.
 *
 * Reconstructs pre-M101 from the original M101 score-impact `previous_standings`
 * when available; otherwise reconstructs from the already-clean live board
 * (keepers: live−8, others: live).
 *
 * Does NOT write to the database.
 *
 * Usage:
 *   npx tsx scripts/audit-m101-clean-rollback-replay.ts
 *   npx tsx scripts/audit-m101-clean-rollback-replay.ts --report-json /tmp/m101-clean-replay-audit.json
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { loadEnvLocal } from "./loadEnvLocal";
import { capturePoolStandingsState } from "../lib/admin/pilotStandingsSnapshot";
import { isKnockoutPredictionScoringEligible } from "../lib/predictions/knockoutPickStatus";
import { isKnockoutProgressionKind } from "../lib/predictions/knockoutProgressionKinds";
import {
  buildCleanM101ReplayPlan,
  reconstructPreM101Standings,
} from "../lib/scoring/m101CleanReplay";
import { mapPredictionRow } from "../src/lib/scoring/mapSupabaseRows";

loadEnvLocal();

const SPAIN_TEAM_ID = "153d854f-aa4e-4d42-83a9-ddbf2244b436";

const args = process.argv.slice(2);
const reportIdx = args.indexOf("--report-json");
const reportPath =
  reportIdx >= 0
    ? args[reportIdx + 1]?.trim()
    : "/tmp/m101-clean-rollback-replay-audit.json";

async function fetchAll(
  sb: SupabaseClient,
  table: string,
  select: string,
  filters: { column: string; value: string }[],
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = sb.from(table).select(select).order("id").range(from, from + page - 1);
    for (const f of filters) q = q.eq(f.column, f.value);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      const id = String(row.id ?? "");
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      out.push(row);
    }
    if (!data || data.length < page) break;
  }
  return out;
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: pools, error: poolErr } = await sb
    .from("pools")
    .select("id, name, tournament_edition_id, is_simulation, archived_at")
    .eq("is_simulation", false)
    .is("archived_at", null)
    .order("name");
  if (poolErr) throw new Error(poolErr.message);

  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    note: "Dry-run only. Prefer Option 1: restore pre-M101 from M101 previous_standings, supersede correction activities, replay M101 once.",
    pools: {} as Record<string, unknown>,
  };

  console.log("=== M101 clean rollback-and-replay audit (dry-run) ===\n");

  for (const pool of pools ?? []) {
    const poolId = pool.id as string;
    const poolName = pool.name as string;
    const snap = await capturePoolStandingsState(sb, poolId);
    const displayNameByParticipantId = new Map(
      snap.rows.map((r) => [r.participantId, r.displayName]),
    );
    const liveTotalsByParticipantId = new Map(
      snap.rows.map((r) => [r.participantId, r.totalPoints]),
    );

    const { data: acts, error: actErr } = await sb
      .from("pool_activity")
      .select("id, created_at, metadata_json, body_text")
      .eq("pool_id", poolId)
      .eq("type", "ash_score_impact")
      .order("created_at", { ascending: false })
      .limit(80);
    if (actErr) throw new Error(actErr.message);

    const correctionActs = (acts ?? []).filter((a) =>
      JSON.stringify(a.metadata_json ?? {}).includes(
        "m101_knockout_depth_transition",
      ),
    );
    const m101Act = (acts ?? []).find((a) => {
      const md = a.metadata_json as Record<string, unknown> | null;
      const codes = (md?.match_codes as string[] | undefined) ?? [];
      const sig = String(md?.score_signature ?? "");
      if (sig.includes("m101_knockout_depth_transition")) return false;
      return codes.includes("M101");
    });
    const argentinaAct = (acts ?? []).find((a) => {
      const md = a.metadata_json as Record<string, unknown> | null;
      const codes = (md?.match_codes as string[] | undefined) ?? [];
      return codes.includes("M100");
    });

    const predRows = await fetchAll(sb, "predictions", "*", [
      { column: "pool_id", value: poolId },
    ]);
    const predictions = predRows.map((r) =>
      mapPredictionRow(r as Parameters<typeof mapPredictionRow>[0]),
    );
    const predictionsByParticipantId = new Map<
      string,
      ReturnType<typeof mapPredictionRow>[]
    >();
    for (const p of predictions) {
      if (
        !isKnockoutProgressionKind(p.predictionKind) ||
        !isKnockoutPredictionScoringEligible(p)
      ) {
        continue;
      }
      const list = predictionsByParticipantId.get(p.participantId) ?? [];
      list.push(p);
      predictionsByParticipantId.set(p.participantId, list);
    }

    const prevStandings = m101Act
      ? ((m101Act.metadata_json as { previous_standings?: { participant_id: string; total_points: number }[] })
          ?.previous_standings ?? null)
      : null;

    const reconstructed = reconstructPreM101Standings({
      previousStandingsFromM101Activity: prevStandings,
      displayNameByParticipantId,
      liveTotalsByParticipantId,
      predictionsByParticipantId,
      spainTeamId: SPAIN_TEAM_ID,
    });

    const plan = buildCleanM101ReplayPlan({
      preM101Rows: reconstructed.rows,
      predictionsByParticipantId,
      spainTeamId: SPAIN_TEAM_ID,
    });

    const mismatches = plan.participants.filter((p) => {
      const live = liveTotalsByParticipantId.get(p.participantId);
      return live != null && live !== p.postReplayPoints;
    });

    console.log(`--- ${poolName} ---`);
    console.log(`Baseline source: ${reconstructed.source}`);
    console.log(
      `M101 activity: ${m101Act?.id ?? "(none — reconstruct)"} ${(m101Act?.metadata_json as { match_label?: string })?.match_label ?? ""}`,
    );
    console.log(
      `Correction activities to supersede: ${correctionActs.length}`,
    );
    console.log(
      `Argentina/M100 activity retained in history: ${argentinaAct?.id ?? "(none)"}`,
    );
    console.log("Pre-M101 top 6:");
    for (const row of plan.preTop.slice(0, 6)) {
      console.log(`  ${row.rank}. ${row.displayName} — ${row.totalPoints}`);
    }
    console.log(
      `+8 recipients (${plan.plus8Recipients.length}): ${plan.plus8Recipients.map((p) => p.displayName).join(", ") || "(none)"}`,
    );
    console.log(`0 delta participants: ${plan.zeroRecipients.length}`);
    console.log("Post-replay top 6:");
    for (const row of plan.postTop.slice(0, 6)) {
      const d =
        row.m101Delta > 0 ? ` (+${row.m101Delta})` : row.m101Delta < 0 ? ` (${row.m101Delta})` : "";
      console.log(
        `  ${row.postRank}. ${row.displayName} — ${row.postReplayPoints}${d}  [pre ${row.preRank}→${row.postRank}] live=${liveTotalsByParticipantId.get(row.participantId)}`,
      );
    }
    console.log(
      `Live vs expected post mismatches: ${mismatches.length}; negatives: ${plan.anomalous.length}`,
    );
    console.log("");

    (report.pools as Record<string, unknown>)[poolId] = {
      poolName,
      baselineSource: reconstructed.source,
      m101ActivityId: m101Act?.id ?? null,
      correctionActivityIds: correctionActs.map((a) => a.id),
      argentinaActivityId: argentinaAct?.id ?? null,
      plus8Recipients: plan.plus8Recipients.map((p) => ({
        displayName: p.displayName,
        maxPredictedSpainDepth: p.maxPredictedSpainDepth,
        pre: p.preM101Points,
        post: p.postReplayPoints,
      })),
      zeroCount: plan.zeroRecipients.length,
      preTop6: plan.preTop.slice(0, 6),
      postTop8: plan.postTop.slice(0, 8),
      liveMatchesExpectedPost: mismatches.length === 0,
      mismatches: mismatches.map((m) => ({
        displayName: m.displayName,
        expected: m.postReplayPoints,
        live: liveTotalsByParticipantId.get(m.participantId),
      })),
      anomalous: plan.anomalous,
    };
  }

  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Wrote ${reportPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
