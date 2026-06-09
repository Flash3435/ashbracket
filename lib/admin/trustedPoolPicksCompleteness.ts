import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadPicksCompletenessInputsForPool,
  participantPicksCompleteFromDrafts,
  type PicksCompletenessInputs,
} from "../communications/picksCompleteness";
import { buildAllParticipantPickDrafts } from "../predictions/buildParticipantPickDrafts";
import { createServiceRoleClient } from "../../src/lib/supabase/service";

/**
 * Pool-admin completeness reads use the service role so results match
 * `scripts/diagnose-pool-completion.ts` and are not affected by participant-scoped RLS.
 * Call only after `canManagePool` / `requireManagedPool` has authorized the request.
 */
export async function loadAdminPicksCompletenessInputsForPool(
  poolId: string,
  participantIds: string[],
  options?: { fallbackSupabase?: SupabaseClient },
): Promise<PicksCompletenessInputs | null> {
  let supabase: SupabaseClient;
  try {
    supabase = createServiceRoleClient();
  } catch (err) {
    if (!options?.fallbackSupabase) {
      console.error(
        "[loadAdminPicksCompletenessInputsForPool] missing service role client",
        err instanceof Error ? err.message : err,
      );
      return null;
    }
    console.warn(
      "[loadAdminPicksCompletenessInputsForPool] falling back to session client",
    );
    supabase = options.fallbackSupabase;
  }

  return loadPicksCompletenessInputsForPool(supabase, poolId, participantIds);
}

/** Same rules as `loadParticipantIdsWithIncompletePicks`, with trusted pool-wide reads. */
export async function loadAdminParticipantIdsWithIncompletePicks(
  poolId: string,
  participantIds: string[],
  options?: { fallbackSupabase?: SupabaseClient },
): Promise<Set<string>> {
  const incomplete = new Set<string>();
  if (participantIds.length === 0) return incomplete;

  const inputs = await loadAdminPicksCompletenessInputsForPool(
    poolId,
    participantIds,
    options,
  );
  if (!inputs) {
    participantIds.forEach((id) => incomplete.add(id));
    return incomplete;
  }

  for (const pid of participantIds) {
    const slots = buildAllParticipantPickDrafts({
      stageByCode: inputs.stageByCode,
      predictions: inputs.predictions,
      participantId: pid,
      bonusKeys: inputs.bonusKeys,
      teams: inputs.teams,
      groupTeamCountryCodesByLetter: inputs.groupTeamCountryCodesByLetter,
    });
    if (
      !participantPicksCompleteFromDrafts(slots, {
        knockoutBracketPicksUnlocked: inputs.knockoutBracketPicksUnlocked,
      })
    ) {
      incomplete.add(pid);
    }
  }

  return incomplete;
}
