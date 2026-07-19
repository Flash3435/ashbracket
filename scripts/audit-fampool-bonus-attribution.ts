#!/usr/bin/env tsx
/**
 * Read-only: Fampool latest score-impact vs bonus ledger for named participants.
 *
 *   npx tsx scripts/audit-fampool-bonus-attribution.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./loadEnvLocal";

async function main() {
  loadEnvLocal();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const poolId = "35914476-e0e3-4df7-9389-b2bab8548ac4";
  const names = ["Seema", "Dipa", "khyan", "Saahil", "Joel Lopez"];

  const { data: act } = await sb
    .from("pool_activity")
    .select("id, created_at, body_text, metadata_json")
    .eq("pool_id", poolId)
    .eq("type", "ash_score_impact")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const md = (act?.metadata_json ?? {}) as Record<string, unknown>;
  console.log("activity", act?.id, act?.created_at);
  console.log("trigger", md.trigger);
  console.log("match_codes", md.match_codes);
  console.log("match_id", md.match_id);
  console.log("match_label", md.match_label);
  console.log("match_attribution_inferred", md.match_attribution_inferred);
  console.log("scoring_corrections", md.scoring_corrections);
  console.log("body", String(act?.body_text ?? "").slice(0, 240));

  const { data: m103 } = await sb
    .from("tournament_matches")
    .select(
      "match_code, stage_code, scoring_result_kind, scoring_slot_key, winner_team_id, home_goals, away_goals, last_sync_at",
    )
    .eq("match_code", "M103")
    .maybeSingle();
  console.log("M103", m103);

  const { data: parts } = await sb
    .from("participants")
    .select("id, display_name")
    .eq("pool_id", poolId)
    .in("display_name", names);
  const ids = (parts ?? []).map((p) => p.id as string);
  const partName = new Map(
    (parts ?? []).map((p) => [p.id as string, p.display_name as string]),
  );

  const [{ data: bonusPreds }, { data: bonusResults }, { data: teams }, { data: ledger }] =
    await Promise.all([
      sb
        .from("predictions")
        .select("participant_id, bonus_key, team_id, prediction_kind")
        .eq("pool_id", poolId)
        .eq("prediction_kind", "bonus_pick")
        .in("participant_id", ids),
      sb
        .from("results")
        .select("slot_key, team_id, kind, edition_id")
        .eq("kind", "bonus_pick"),
      sb.from("teams").select("id, name"),
      sb
        .from("points_ledger")
        .select("participant_id, points_delta, prediction_kind, note")
        .eq("pool_id", poolId)
        .eq("prediction_kind", "bonus_pick")
        .in("participant_id", ids),
    ]);

  const teamName = new Map((teams ?? []).map((t) => [t.id as string, t.name as string]));
  console.log(
    "\nBonus results:",
    (bonusResults ?? []).map(
      (r) => `${r.slot_key}=${teamName.get(r.team_id as string) ?? r.team_id}`,
    ),
  );
  console.log("\nParticipant bonus picks:");
  for (const p of bonusPreds ?? []) {
    console.log(
      partName.get(p.participant_id as string),
      p.bonus_key,
      teamName.get(p.team_id as string),
    );
  }
  console.log("\nLedger bonus:");
  for (const l of ledger ?? []) {
    console.log(
      partName.get(l.participant_id as string),
      l.points_delta,
      l.note,
    );
  }

  const prev = Array.isArray(md.previous_standings)
    ? (md.previous_standings as Array<{ participant_id: string; total_points: number }>)
    : [];
  console.log("\nStandings delta vs previous_standings:");
  for (const name of names) {
    const pid = [...partName.entries()].find(([, n]) => n === name)?.[0];
    if (!pid) continue;
    const before = prev.find((r) => r.participant_id === pid)?.total_points;
    const bonusPts = (ledger ?? [])
      .filter((l) => l.participant_id === pid)
      .reduce((s, l) => s + Number(l.points_delta), 0);
    console.log({ name, before, ledgerBonusTotal: bonusPts });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
