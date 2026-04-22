import type { SupabaseClient } from "@supabase/supabase-js";
import { loadParticipantIdsWithIncompletePicks } from "../communications/picksCompleteness";
import type { RecapFacts } from "./buildDeterministicRecapBody";
import {
  buildChampionDistributionKey,
  recapMaterialKeyV1,
} from "./recapMaterialKey";

/**
 * Participant counts and champion mode among complete brackets — same logic as
 * daily recap generation (`ensureDailyAshRecapForPool`), callable with any
 * Supabase client that can read the pool (service role or member RLS).
 */
export async function loadRecapFacts(
  supabase: SupabaseClient,
  poolId: string,
): Promise<{
  facts: RecapFacts;
  participantRows: Array<{ id: string; display_name: string | null }>;
  recapMaterialKeyV1: string;
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

  let maxChampionCount = 0;
  for (const n of byTeam.values()) {
    if (n > maxChampionCount) maxChampionCount = n;
  }
  const coLeaders = [...byTeam.entries()]
    .filter(([, n]) => n === maxChampionCount)
    .sort(([a], [b]) => a.localeCompare(b));
  const topTeamId = coLeaders[0]?.[0] ?? null;
  const topCount = maxChampionCount;
  const championUniqueLeader = coLeaders.length === 1;
  const championDistributionKey = buildChampionDistributionKey(byTeam);

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

  const facts: RecapFacts = {
    participantCount: participantCount ?? 0,
    submittedCount: submittedCount ?? 0,
    topChampionTeamName,
    topChampionTeamId: topTeamId,
    topChampionPickCount: topCount,
    championUniqueLeader,
  };

  return {
    facts,
    participantRows,
    recapMaterialKeyV1: recapMaterialKeyV1(
      facts.participantCount,
      facts.submittedCount,
      championDistributionKey,
    ),
  };
}
