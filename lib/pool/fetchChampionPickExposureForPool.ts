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
import { shouldShowChampionPickExposure } from "./poolExposureDisplay";

export type FetchChampionPickExposureResult =
  | {
      ok: true;
      exposure: ChampionPickExposure;
      showExposure: boolean;
      knockoutBracketPicksUnlocked: boolean;
      picksLocked: boolean;
    }
  | { ok: false; error: string };

const EMPTY_EXPOSURE: ChampionPickExposure = {
  surviving: [],
  eliminated: [],
  totalCompletedChampionPicks: 0,
  incompleteCount: 0,
};

/**
 * Read-only pool champion exposure for participant-facing pages.
 * Uses service role for picks aggregation so public leaderboard works for anonymous visitors.
 * Returns aggregate team counts only — no per-participant pick rows.
 */
export async function fetchChampionPickExposureForPool(
  poolId: string,
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
      exposure: EMPTY_EXPOSURE,
      showExposure: false,
      knockoutBracketPicksUnlocked: false,
      picksLocked: false,
    };
  }

  const editionId = (poolRow.tournament_edition_id as string | null)?.trim() || null;
  if (!editionId) {
    return {
      ok: true,
      exposure: EMPTY_EXPOSURE,
      showExposure: false,
      knockoutBracketPicksUnlocked: false,
      picksLocked: true,
    };
  }

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
    service,
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
    matches = await loadTournamentPublicMatches(service, editionId);
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
  const showExposure = shouldShowChampionPickExposure({
    picksLocked: locked,
    exposure,
  });

  return {
    ok: true,
    exposure,
    showExposure,
    knockoutBracketPicksUnlocked,
    picksLocked: true,
  };
}
