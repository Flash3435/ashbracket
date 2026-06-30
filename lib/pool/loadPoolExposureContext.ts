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
  /** Brackets for every pool participant (complete or partial). */
  allParticipantBrackets: ParticipantBracketForExposure[];
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

  const picksInputs = inputs;

  const incomplete = new Set<string>();
  for (const pid of participantIds) {
    const status = buildCompletionStatusForParticipant(picksInputs, pid);
    if (!status.isComplete) incomplete.add(pid);
  }

  const completeParticipantIds = participantIds.filter((id) => !incomplete.has(id));

  function bracketForParticipant(participantId: string): ParticipantBracketForExposure {
    return {
      participantId,
      slots: buildAllParticipantPickDrafts({
        stageByCode: picksInputs.stageByCode,
        predictions: picksInputs.predictions,
        participantId,
        bonusKeys: picksInputs.bonusKeys,
        teams: picksInputs.teams,
        groupTeamCountryCodesByLetter: picksInputs.groupTeamCountryCodesByLetter,
      }),
    };
  }

  const allParticipantBrackets = participantIds.map(bracketForParticipant);
  const completeParticipantBrackets = completeParticipantIds.map(bracketForParticipant);

  let matches: TournamentMatchPublicRow[] = [];
  try {
    matches = await loadTournamentPublicMatches(service, editionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load tournament matches.";
    return { ok: false, error: message };
  }

  const eliminatedTeamIds = eliminatedTeamIdsFromMatches(matches, picksInputs.teams);
  const championPicks =
    participantIds.length > 0
      ? resolvePoolChampionPickInputs({
          completeParticipantIds: participantIds,
          predictions: picksInputs.predictions,
          participantRows,
          teams: picksInputs.teams,
          stageByCode: picksInputs.stageByCode,
          bonusKeys: picksInputs.bonusKeys,
          groupTeamCountryCodesByLetter: picksInputs.groupTeamCountryCodesByLetter,
        })
      : [];

  return {
    ok: true,
    context: {
      picksLocked: locked,
      knockoutBracketPicksUnlocked: picksInputs.knockoutBracketPicksUnlocked,
      allParticipantBrackets,
      completeParticipantBrackets,
      incompleteCount: incomplete.size,
      matches,
      teams: picksInputs.teams,
      eliminatedTeamIds,
      championPicks,
    },
  };
}
