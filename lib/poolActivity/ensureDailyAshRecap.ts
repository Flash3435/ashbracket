import { createServiceRoleClient } from "../../src/lib/supabase/service";
import {
  loadBracketCompletionDiagnosticsForPool,
  recapCompletionDiagnosticsEnabled,
  RECAP_METADATA_COMPLETION_DIAGNOSTICS_KEY,
} from "../communications/bracketCompletionDiagnostics";
import { loadParticipantIdsWithIncompletePicks } from "../communications/picksCompleteness";
import { generateAshDailyRecapOpenAI } from "../ash/generateAshDailyRecapOpenAI";
import { buildDeterministicRecapBody, type RecapFacts } from "./buildDeterministicRecapBody";
import { recapCalendarDateYmdEdmonton } from "./recapCalendarDate";
import type { SupabaseClient } from "@supabase/supabase-js";

async function loadRecapFacts(
  supabase: SupabaseClient,
  poolId: string,
): Promise<{
  facts: RecapFacts;
  participantRows: Array<{ id: string; display_name: string | null }>;
}> {
  const { data: parRows, error: pErr } = await supabase
    .from("participants")
    .select("id, display_name")
    .eq("pool_id", poolId);

  if (pErr) throw new Error(pErr.message);

  const participantRows = (parRows ?? []).map((r) => ({
    id: r.id as string,
    display_name: (r.display_name as string | null) ?? null,
  }));
  const participantIds = participantRows.map((r) => r.id);
  const participantCount = participantIds.length;

  /**
   * Submitted = required slots filled per the same rules as the picks wizard
   * (`loadParticipantIdsWithIncompletePicks`). Do not use `picks_first_submitted_at`
   * here: that column is only set on save after the column existed, so recaps would
   * under-count legacy pickers and contradict champion rows from `predictions`.
   */
  const incomplete = await loadParticipantIdsWithIncompletePicks(
    supabase,
    poolId,
    participantIds,
  );
  const submittedCount = participantIds.filter((id) => !incomplete.has(id)).length;
  const completeParticipantIds = participantIds.filter((id) => !incomplete.has(id));

  const { data: champRows, error: cErr } =
    completeParticipantIds.length > 0
      ? await supabase
          .from("predictions")
          .select("team_id")
          .eq("pool_id", poolId)
          .eq("prediction_kind", "champion")
          .not("team_id", "is", null)
          .in("participant_id", completeParticipantIds)
      : { data: [], error: null };

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
    facts: {
      participantCount: participantCount ?? 0,
      submittedCount: submittedCount ?? 0,
      topChampionTeamName,
      topChampionPickCount: topCount,
    },
    participantRows,
  };
}

function recapFlavorPrompt(facts: RecapFacts, recapDate: string): string {
  const factsBlock = [
    `calendar_date=${recapDate} (America/Edmonton)`,
    `participant_count=${facts.participantCount}`,
    `participants_with_complete_brackets=${facts.submittedCount}`,
    facts.topChampionTeamName
      ? `most_common_champion_among_complete_brackets=${facts.topChampionTeamName} (${facts.topChampionPickCount} picks)`
      : "most_common_champion_among_complete_brackets=not available in data",
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

  const { facts, participantRows } = await loadRecapFacts(supabase, poolId);
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
    participant_count: facts.participantCount,
    submitted_count: facts.submittedCount,
    top_champion_team: facts.topChampionTeamName,
    top_champion_pick_count: facts.topChampionPickCount,
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
