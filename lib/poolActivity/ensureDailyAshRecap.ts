import { createServiceRoleClient } from "../../src/lib/supabase/service";
import { generateAshDailyRecapOpenAI } from "../ash/generateAshDailyRecapOpenAI";
import { buildDeterministicRecapBody, type RecapFacts } from "./buildDeterministicRecapBody";
import { recapCalendarDateYmdEdmonton } from "./recapCalendarDate";

async function loadRecapFacts(poolId: string): Promise<RecapFacts> {
  const supabase = createServiceRoleClient();

  const { count: participantCount, error: pErr } = await supabase
    .from("participants")
    .select("*", { count: "exact", head: true })
    .eq("pool_id", poolId);

  if (pErr) throw new Error(pErr.message);

  const { count: submittedCount, error: sErr } = await supabase
    .from("participants")
    .select("*", { count: "exact", head: true })
    .eq("pool_id", poolId)
    .not("picks_first_submitted_at", "is", null);

  if (sErr) throw new Error(sErr.message);

  const { data: champRows, error: cErr } = await supabase
    .from("predictions")
    .select("team_id")
    .eq("pool_id", poolId)
    .eq("prediction_kind", "champion")
    .not("team_id", "is", null);

  if (cErr) throw new Error(cErr.message);

  const byTeam = new Map<string, number>();
  for (const r of champRows ?? []) {
    const tid = r.team_id as string;
    byTeam.set(tid, (byTeam.get(tid) ?? 0) + 1);
  }

  let topTeamId: string | null = null;
  let topCount = 0;
  for (const [tid, n] of byTeam) {
    if (n > topCount) {
      topCount = n;
      topTeamId = tid;
    }
  }

  let topChampionTeamName: string | null = null;
  if (topTeamId) {
    const { data: teamRow, error: tErr } = await supabase
      .from("teams")
      .select("name")
      .eq("id", topTeamId)
      .maybeSingle();
    if (!tErr && teamRow?.name) {
      topChampionTeamName = teamRow.name as string;
    }
  }

  return {
    participantCount: participantCount ?? 0,
    submittedCount: submittedCount ?? 0,
    topChampionTeamName,
    topChampionPickCount: topCount,
  };
}

function recapPrompt(facts: RecapFacts, recapDate: string): string {
  const factsBlock = [
    `calendar_date=${recapDate} (America/Edmonton)`,
    `participant_count=${facts.participantCount}`,
    `submitted_picks_count=${facts.submittedCount}`,
    facts.topChampionTeamName
      ? `most_common_champion_pick=${facts.topChampionTeamName} (${facts.topChampionPickCount} picks)`
      : "most_common_champion_pick=not available in data",
  ].join("\n");

  return `You are Ash, the voice of the AshBracket pool app — witty, sports-radio-ish, office-safe, lightly opinionated, never mean.

Write a short daily pool recap in character using ONLY the facts below. Do not invent statistics, match outcomes, or participant names not given. If a fact is missing, skip it gracefully.

Stay under about 90 words. Sound playful and confident. No abusive or insulting language.

Facts:
${factsBlock}`;
}

/**
 * Idempotent: creates at most one ash_daily_recap per pool per calendar day (Edmonton).
 * Call only after the requester is authorized to view this pool’s activity.
 */
export async function ensureDailyAshRecapForPool(poolId: string): Promise<void> {
  const recapDate = recapCalendarDateYmdEdmonton();
  const supabase = createServiceRoleClient();

  const { data: existing, error: exErr } = await supabase
    .from("pool_activity")
    .select("id")
    .eq("pool_id", poolId)
    .eq("type", "ash_daily_recap")
    .contains("metadata_json", { recap_date: recapDate })
    .limit(1)
    .maybeSingle();

  if (exErr) {
    throw new Error(exErr.message);
  }
  if (existing?.id) return;

  const facts = await loadRecapFacts(poolId);
  const fallback = buildDeterministicRecapBody(facts);
  const aiText = await generateAshDailyRecapOpenAI(recapPrompt(facts, recapDate));
  const bodyText = (aiText && aiText.length > 0 ? aiText : fallback).trim();
  const isAi = Boolean(aiText && aiText.length > 0);

  const { error: insErr } = await supabase.from("pool_activity").insert({
    pool_id: poolId,
    participant_id: null,
    actor_user_id: null,
    type: "ash_daily_recap",
    body_text: bodyText,
    metadata_json: {
      recap_date: recapDate,
      participant_count: facts.participantCount,
      submitted_count: facts.submittedCount,
      top_champion_team: facts.topChampionTeamName,
      top_champion_pick_count: facts.topChampionPickCount,
    },
    related_path: null,
    is_ai_generated: isAi,
  });

  if (insErr) {
    if (insErr.code === "23505") return;
    throw new Error(insErr.message);
  }
}
