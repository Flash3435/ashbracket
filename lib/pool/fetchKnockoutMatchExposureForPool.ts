import {
  buildCompletionStatusForParticipant,
  loadPicksCompletenessInputsForPool,
} from "@/lib/communications/picksCompleteness";
import { buildAllParticipantPickDrafts } from "@/lib/predictions/buildParticipantPickDrafts";
import { poolLocked } from "@/lib/pools/poolLocked";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  buildKnockoutMatchExposure,
  type KnockoutMatchExposure,
} from "./buildKnockoutMatchExposure";
import { loadTournamentPublicMatches } from "./loadTournamentPublicMatches";
import { shouldShowKnockoutMatchExposure } from "./poolExposureDisplay";

export type FetchKnockoutMatchExposureResult =
  | {
      ok: true;
      exposure: KnockoutMatchExposure;
      showExposure: boolean;
      knockoutBracketPicksUnlocked: boolean;
      picksLocked: boolean;
    }
  | { ok: false; error: string };

const EMPTY_EXPOSURE: KnockoutMatchExposure = {
  fixtures: [],
  totalCompletedBrackets: 0,
  incompleteCount: 0,
};

/**
 * Read-only knockout match exposure for participant-facing pages.
 * Uses service role for picks aggregation so public leaderboard works for anonymous visitors.
 * Returns aggregate bracket counts per fixture only — no per-participant pick rows.
 */
export async function fetchKnockoutMatchExposureForPool(
  poolId: string,
): Promise<FetchKnockoutMatchExposureResult> {
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
    .select("id")
    .eq("pool_id", trimmedPoolId);

  if (parErr) {
    return { ok: false, error: parErr.message };
  }

  const participantIds = (parRows ?? []).map((r) => r.id as string);

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
  const completeParticipantBrackets = completeParticipantIds.map((participantId) => ({
    participantId,
    slots: buildAllParticipantPickDrafts({
      stageByCode: inputs.stageByCode,
      predictions: inputs.predictions,
      participantId,
      bonusKeys: inputs.bonusKeys,
      teams: inputs.teams,
      groupTeamCountryCodesByLetter: inputs.groupTeamCountryCodesByLetter,
    }),
  }));

  let matches: Awaited<ReturnType<typeof loadTournamentPublicMatches>> = [];
  try {
    matches = await loadTournamentPublicMatches(service, editionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load tournament matches.";
    return { ok: false, error: message };
  }

  const exposure = buildKnockoutMatchExposure({
    matches,
    completeParticipantBrackets,
    teams: inputs.teams,
    incompleteCount: incomplete.size,
  });

  const knockoutBracketPicksUnlocked = inputs.knockoutBracketPicksUnlocked;
  const showExposure = shouldShowKnockoutMatchExposure({
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
