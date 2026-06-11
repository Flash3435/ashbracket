import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCompletionStatusForParticipant,
  loadPicksCompletenessInputsForPool,
} from "../communications/picksCompleteness";
import {
  formatPoolPickDeadlineLabel,
  formatRelativeTimeUntilEn,
} from "../picks/poolPickDeadlineDisplay";
import { poolLocked } from "../pools/poolLocked";
import { participantPicksCompleteFromDrafts } from "../predictions/participantPicksCompletenessRules";
import type { AccountKnockoutSelection } from "./loadAccountKnockoutSelection";
import { buildEveryonesPicksList } from "./buildEveryonesPicksList";
import { buildPoolReveal, type PoolRevealData } from "./buildPoolReveal";
import {
  championTeamIdFromDraftSlots,
  championTeamIdFromPredictions,
  resolvePoolChampionPickInputs,
} from "./resolvePoolChampionPicks";
import { resolvePoolPreBracketRevealSections } from "./resolvePoolPreBracketReveal";

function championByParticipantFromInputs(
  participantIds: string[],
  inputs: NonNullable<
    Awaited<ReturnType<typeof loadPicksCompletenessInputsForPool>>
  >,
): Map<string, { teamName: string; teamCode?: string }> {
  const teamById = new Map(inputs.teams.map((t) => [t.id, t]));
  const out = new Map<string, { teamName: string; teamCode?: string }>();
  const draftContext = {
    stageByCode: inputs.stageByCode,
    predictions: inputs.predictions,
    bonusKeys: inputs.bonusKeys,
    teams: inputs.teams,
    groupTeamCountryCodesByLetter: inputs.groupTeamCountryCodesByLetter,
  };

  for (const participantId of participantIds) {
    let teamId = championTeamIdFromPredictions(inputs.predictions, participantId);
    if (!teamId) {
      teamId = championTeamIdFromDraftSlots({
        ...draftContext,
        participantId,
      });
    }
    if (!teamId) continue;
    const team = teamById.get(teamId);
    out.set(participantId, {
      teamName: team?.name?.trim() || "Unknown team",
      teamCode: team?.countryCode?.trim() || undefined,
    });
  }
  return out;
}

function completionByParticipantFromInputs(
  participantIds: string[],
  inputs: NonNullable<
    Awaited<ReturnType<typeof loadPicksCompletenessInputsForPool>>
  >,
) {
  const out = new Map<
    string,
    ReturnType<typeof buildCompletionStatusForParticipant>
  >();
  for (const pid of participantIds) {
    out.set(pid, buildCompletionStatusForParticipant(inputs, pid));
  }
  return out;
}

function buildEveryonesPicksForPool(input: {
  locked: boolean;
  participantRows: Array<{ id: string; display_name: string | null }>;
  completeParticipantIds: string[];
  inputs: Awaited<ReturnType<typeof loadPicksCompletenessInputsForPool>>;
}) {
  const participantIds = input.participantRows.map((r) => r.id);
  const championByParticipantId = input.inputs
    ? championByParticipantFromInputs(participantIds, input.inputs)
    : new Map<string, { teamName: string; teamCode?: string }>();
  const completionByParticipantId = input.inputs
    ? completionByParticipantFromInputs(participantIds, input.inputs)
    : undefined;

  return buildEveryonesPicksList({
    locked: input.locked,
    participantRows: input.participantRows,
    completeParticipantIds: input.completeParticipantIds,
    championByParticipantId,
    completionByParticipantId,
  });
}

/**
 * Loads pool reveal data for a signed-in pool member.
 * Before lock, omits all team and pick distribution information and avoids
 * champion prediction queries.
 */
export async function loadPoolReveal(
  supabase: SupabaseClient,
  poolId: string,
  picksCtx: AccountKnockoutSelection,
  nowMs = Date.now(),
): Promise<PoolRevealData> {
  const lockAt = picksCtx.selectedLockAt ?? null;
  const deadlineLabel = lockAt ? formatPoolPickDeadlineLabel(lockAt) : null;
  const relativeCountdown = lockAt ? formatRelativeTimeUntilEn(lockAt, nowMs) : null;

  const viewerPicksComplete = participantPicksCompleteFromDrafts(
    picksCtx.initialSlots,
    { knockoutBracketPicksUnlocked: picksCtx.knockoutBracketPicksUnlocked },
  );

  const [{ data: parRows, error: parErr }, poolRow] = await Promise.all([
    supabase.from("participants").select("id, display_name").eq("pool_id", poolId),
    supabase.from("pools").select("lock_at").eq("id", poolId).maybeSingle(),
  ]);

  if (parErr) throw new Error(parErr.message);
  if (poolRow.error) throw new Error(poolRow.error.message);

  const participantRows = (parRows ?? []).map((r) => ({
    id: r.id as string,
    display_name: (r.display_name as string | null) ?? null,
  }));
  const participantIds = participantRows.map((r) => r.id);
  const poolLockAt = (poolRow.data?.lock_at as string | null) ?? lockAt;
  const locked = poolLocked(poolLockAt);

  const inputs = await loadPicksCompletenessInputsForPool(
    supabase,
    poolId,
    participantIds,
  );

  const knockoutBracketPicksUnlocked =
    inputs?.knockoutBracketPicksUnlocked ??
    picksCtx.knockoutBracketPicksUnlocked;

  const incomplete = new Set<string>();
  if (!inputs) {
    participantIds.forEach((id) => incomplete.add(id));
  } else {
    for (const pid of participantIds) {
      const status = buildCompletionStatusForParticipant(inputs, pid);
      if (!status.isComplete) incomplete.add(pid);
    }
  }

  const completeParticipantIds = participantIds.filter((id) => !incomplete.has(id));
  const everyonesPicks = locked
    ? buildEveryonesPicksForPool({
        locked,
        participantRows,
        completeParticipantIds,
        inputs,
      })
    : [];

  if (!locked) {
    return buildPoolReveal({
      lockAt: poolLockAt,
      deadlineLabel,
      relativeCountdown,
      totalParticipants: participantRows.length,
      completeParticipantIds,
      championPicks: [],
      viewerPicksComplete,
      canShowParticipantNames: false,
      knockoutBracketPicksUnlocked,
      preBracketSections: [],
      everyonesPicks,
      nowMs,
    });
  }

  if (!inputs) {
    return buildPoolReveal({
      lockAt: poolLockAt,
      deadlineLabel,
      relativeCountdown,
      totalParticipants: participantRows.length,
      completeParticipantIds: [],
      championPicks: [],
      viewerPicksComplete,
      canShowParticipantNames: true,
      knockoutBracketPicksUnlocked,
      preBracketSections: [],
      everyonesPicks,
      nowMs,
    });
  }

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

  const preBracketSections =
    completeParticipantIds.length > 0
      ? resolvePoolPreBracketRevealSections({
          completeParticipantIds,
          predictions: inputs.predictions,
          participantRows,
          teams: inputs.teams,
          bonusKeys: inputs.bonusKeys,
          canShowParticipantNames: true,
        })
      : [];

  return buildPoolReveal({
    lockAt: poolLockAt,
    deadlineLabel,
    relativeCountdown,
    totalParticipants: participantRows.length,
    completeParticipantIds,
    championPicks,
    viewerPicksComplete,
    canShowParticipantNames: true,
    knockoutBracketPicksUnlocked,
    preBracketSections,
    everyonesPicks,
    nowMs,
  });
}
