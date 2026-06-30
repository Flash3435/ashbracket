import {
  buildCompletionStatusForParticipant,
  loadPicksCompletenessInputsForPool,
} from "@/lib/communications/picksCompleteness";
import { resolvePoolChampionPickInputs } from "@/lib/account/resolvePoolChampionPicks";
import type { ChampionPickInput } from "@/lib/account/buildPoolReveal";
import { eliminatedTeamIdsFromMatches } from "@/lib/participant/bracketMatchImpact";
import { buildAllParticipantPickDrafts } from "@/lib/predictions/buildParticipantPickDrafts";
import { poolLocked } from "@/lib/pools/poolLocked";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import type { ParticipantBracketForExposure } from "./buildKnockoutMatchExposure";
import { loadTournamentPublicMatches } from "./loadTournamentPublicMatches";

export type PoolExposureContext = {
  picksLocked: boolean;
  knockoutBracketPicksUnlocked: boolean;
  completeParticipantBrackets: ParticipantBracketForExposure[];
  incompleteCount: number;
  matches: TournamentMatchPublicRow[];
  teams: Team[];
  eliminatedTeamIds: Set<string>;
  championPicks: ChampionPickInput[];
};

export type LoadPoolExposureContextResult =
  | { ok: true; context: PoolExposureContext }
  | { ok: false; error: string };

/**
 * Shared service-role loader for pool exposure features (aggregate + race outlook).
 */
export async function loadPoolExposureContext(
  poolId: string,
): Promise<LoadPoolExposureContextResult> {
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
    return { ok: false, error: "Pool picks are not locked." };
  }

  const editionId = (poolRow.tournament_edition_id as string | null)?.trim() || null;
  if (!editionId) {
    return { ok: false, error: "Pool has no tournament edition." };
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

  let matches: TournamentMatchPublicRow[] = [];
  try {
    matches = await loadTournamentPublicMatches(service, editionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load tournament matches.";
    return { ok: false, error: message };
  }

  const eliminatedTeamIds = eliminatedTeamIdsFromMatches(matches, inputs.teams);
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

  return {
    ok: true,
    context: {
      picksLocked: locked,
      knockoutBracketPicksUnlocked: inputs.knockoutBracketPicksUnlocked,
      completeParticipantBrackets,
      incompleteCount: incomplete.size,
      matches,
      teams: inputs.teams,
      eliminatedTeamIds,
      championPicks,
    },
  };
}
