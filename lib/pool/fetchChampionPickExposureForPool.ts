import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCompletionStatusForParticipant,
  loadPicksCompletenessInputsForPool,
} from "@/lib/communications/picksCompleteness";
import { resolvePoolChampionPickInputs } from "@/lib/account/resolvePoolChampionPicks";
import { eliminatedTeamIdsFromMatches } from "@/lib/participant/bracketMatchImpact";
import { poolLocked } from "@/lib/pools/poolLocked";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadTournamentPublicMatches } from "./loadTournamentPublicMatches";
import {
  buildChampionPickExposure,
  type ChampionPickExposure,
} from "./buildChampionPickExposure";

export type FetchChampionPickExposureResult =
  | {
      ok: true;
      exposure: ChampionPickExposure;
      showExposure: boolean;
      knockoutBracketPicksUnlocked: boolean;
      picksLocked: boolean;
    }
  | { ok: false; error: string };

/**
 * Read-only pool champion exposure for participant-facing pages.
 */
export async function fetchChampionPickExposureForPool(
  poolId: string,
  options?: { supabase?: SupabaseClient },
): Promise<FetchChampionPickExposureResult> {
  const trimmedPoolId = poolId.trim();
  if (!trimmedPoolId) {
    return { ok: false, error: "Pool not found." };
  }

  const service = createServiceRoleClient();
  const { data: poolRow, error: poolErr } = await service
    .from("pools")
    .select("id, lock_at, tournament_edition_id")
    .eq("id", trimmedPoolId)
    .maybeSingle();

  if (poolErr || !poolRow) {
    return { ok: false, error: poolErr?.message ?? "Pool not found." };
  }

  const locked = poolLocked(poolRow.lock_at as string | null);
  if (!locked) {
    return {
      ok: true,
      exposure: {
        surviving: [],
        eliminated: [],
        totalCompletedChampionPicks: 0,
        incompleteCount: 0,
      },
      showExposure: false,
      knockoutBracketPicksUnlocked: false,
      picksLocked: false,
    };
  }

  const editionId = (poolRow.tournament_edition_id as string | null)?.trim() || null;
  if (!editionId) {
    return {
      ok: true,
      exposure: {
        surviving: [],
        eliminated: [],
        totalCompletedChampionPicks: 0,
        incompleteCount: 0,
      },
      showExposure: false,
      knockoutBracketPicksUnlocked: false,
      picksLocked: true,
    };
  }

  const supabase = options?.supabase ?? service;

  const { data: parRows, error: parErr } = await service
    .from("participants")
    .select("id, display_name")
    .eq("pool_id", trimmedPoolId);

  if (parErr) {
    return { ok: false, error: parErr.message };
  }

  const participantRows = (parRows ?? []).map((r) => ({
    id: r.id as string,
    display_name: (r.display_name as string | null) ?? null,
  }));
  const participantIds = participantRows.map((r) => r.id);

  const inputs = await loadPicksCompletenessInputsForPool(
    supabase,
    trimmedPoolId,
    participantIds,
  );

  if (!inputs) {
    return { ok: false, error: "Could not load pool picks." };
  }

  const incomplete = new Set<string>();
  for (const pid of participantIds) {
    const status = buildCompletionStatusForParticipant(inputs, pid);
    if (!status.isComplete) incomplete.add(pid);
  }

  const completeParticipantIds = participantIds.filter((id) => !incomplete.has(id));
  const championPicks =
    completeParticipantIds.length > 0
      ? resolvePoolChampionPickInputs({
          completeParticipantIds,
          predictions: inputs.predictions,
          participantRows,
          teams: inputs.teams,
          stageByCode: inputs.stageByCode,
          bonusKeys: inputs.bonusKeys,
          groupTeamCountryCodesByLetter: inputs.groupTeamCountryCodesByLetter,
        })
      : [];

  let matches: Awaited<ReturnType<typeof loadTournamentPublicMatches>> = [];
  try {
    matches = await loadTournamentPublicMatches(supabase, editionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load tournament matches.";
    return { ok: false, error: message };
  }

  const eliminatedTeamIds = eliminatedTeamIdsFromMatches(matches, inputs.teams);
  const exposure = buildChampionPickExposure({
    completeParticipantIds,
    championPicks,
    eliminatedTeamIds,
  });

  const knockoutBracketPicksUnlocked = inputs.knockoutBracketPicksUnlocked;
  const showExposure =
    knockoutBracketPicksUnlocked && exposure.totalCompletedChampionPicks > 0;

  return {
    ok: true,
    exposure,
    showExposure,
    knockoutBracketPicksUnlocked,
    picksLocked: true,
  };
}
