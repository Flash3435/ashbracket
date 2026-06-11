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
import { buildPoolReveal, type PoolRevealData } from "./buildPoolReveal";
import { resolvePoolChampionPickInputs } from "./resolvePoolChampionPicks";
import { resolvePoolPreBracketRevealSections } from "./resolvePoolPreBracketReveal";

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
    nowMs,
  });
}
