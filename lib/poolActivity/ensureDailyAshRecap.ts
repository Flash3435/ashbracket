import { createServiceRoleClient } from "../../src/lib/supabase/service";
import {
  loadBracketCompletionDiagnosticsForPool,
  recapCompletionDiagnosticsEnabled,
  RECAP_METADATA_COMPLETION_DIAGNOSTICS_KEY,
} from "../communications/bracketCompletionDiagnostics";
import { generateAshDailyRecapOpenAI } from "../ash/generateAshDailyRecapOpenAI";
import {
  buildDeterministicRecapBody,
  shouldShowChampionInsight,
  type RecapFacts,
} from "./buildDeterministicRecapBody";
import { loadRecapFacts } from "./loadRecapFacts";
import { recapCalendarDateYmdEdmonton } from "./recapCalendarDate";
import { recapMaterialUnchangedSincePrevious } from "./recapMaterialKey";

function recapFlavorPrompt(facts: RecapFacts, recapDate: string): string {
  const championHeadline =
    shouldShowChampionInsight(facts) && facts.topChampionTeamName
      ? `headline_will_include_unique_champion_leader=${facts.topChampionTeamName} (${facts.topChampionPickCount} picks among complete brackets)`
      : "headline_will_omit_champion_leader_detail (not enough complete brackets, tied leader, or counts too small to headline)";
  const factsBlock = [
    `calendar_date=${recapDate} (America/Edmonton)`,
    `participant_count=${facts.participantCount}`,
    `participants_with_complete_brackets=${facts.submittedCount}`,
    championHeadline,
  ].join("\n");

  return `You are Ash, the voice of the AshBracket pool app — witty, sports-radio-ish, office-safe, lightly opinionated, never mean.

The app will show a separate fixed opening sentence with exact participant and champion stats. Your job is ONLY optional follow-up color (about one short paragraph).

Rules:
- Do NOT state any numbers, counts, fractions, "X of Y", percentages, or champion vote totals — those are already shown elsewhere.
- Do not invent match outcomes, team names, or participant names not implied by the tone of "a pool" in general.
- If you have nothing additive to say, output exactly the word: SKIP

Facts (context only — do not repeat numerically):
${factsBlock}

Stay under about 60 words. No abusive or insulting language.`;
}

/**
 * Idempotent: at most one ash_daily_recap per pool per calendar day (Edmonton), and
 * skips creating a new row when pool-level recap stats are unchanged since the last recap.
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

  const { data: latestRecap, error: latestErr } = await supabase
    .from("pool_activity")
    .select("metadata_json")
    .eq("pool_id", poolId)
    .eq("type", "ash_daily_recap")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestErr) {
    throw new Error(latestErr.message);
  }

  const { facts, participantRows, recapMaterialKeyV1 } = await loadRecapFacts(
    supabase,
    poolId,
  );

  const prevMeta = latestRecap?.metadata_json as Record<string, unknown> | undefined;
  if (recapMaterialUnchangedSincePrevious(prevMeta, recapMaterialKeyV1, facts)) {
    return;
  }

  const baseline = buildDeterministicRecapBody(facts);
  const aiFlavor = (
    await generateAshDailyRecapOpenAI(recapFlavorPrompt(facts, recapDate))
  )?.trim();
  const flavor =
    aiFlavor &&
    aiFlavor.length > 0 &&
    !/^skip\.?$/i.test(aiFlavor) &&
    !/^skip$/i.test(aiFlavor)
      ? aiFlavor
      : "";
  const bodyText = flavor ? `${baseline}\n\n${flavor}` : baseline;
  const isAi = Boolean(flavor);

  const metadataJson: Record<string, unknown> = {
    recap_date: recapDate,
    recap_material_key_v1: recapMaterialKeyV1,
    participant_count: facts.participantCount,
    submitted_count: facts.submittedCount,
    top_champion_team: facts.topChampionTeamName,
    top_champion_team_id: facts.topChampionTeamId ?? null,
    top_champion_pick_count: facts.topChampionPickCount,
    champion_unique_leader: facts.championUniqueLeader ?? null,
    champion_insight_eligible: shouldShowChampionInsight(facts),
  };

  if (recapCompletionDiagnosticsEnabled() && participantRows.length > 0) {
    metadataJson[RECAP_METADATA_COMPLETION_DIAGNOSTICS_KEY] =
      await loadBracketCompletionDiagnosticsForPool(supabase, poolId, participantRows);
  }

  const { error: insErr } = await supabase.from("pool_activity").insert({
    pool_id: poolId,
    participant_id: null,
    actor_user_id: null,
    type: "ash_daily_recap",
    body_text: bodyText,
    metadata_json: metadataJson,
    related_path: null,
    is_ai_generated: isAi,
  });

  if (insErr) {
    if (insErr.code === "23505") return;
    throw new Error(insErr.message);
  }
}
