import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPoolActivityForPool } from "../poolActivity/fetchPoolActivity";
import type { AccountKnockoutSelection } from "../account/loadAccountKnockoutSelection";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  buildParticipantLatestRecap,
  pointsByMatchCodeFromScoreImpactActivities,
  type ParticipantLatestRecap,
} from "./buildParticipantLatestRecap";

export type LoadParticipantLatestRecapResult = ParticipantLatestRecap & {
  tournamentErr: string | null;
};

const emptyRecap: LoadParticipantLatestRecapResult = {
  showCard: false,
  variant: "matches",
  items: [],
  tournamentErr: null,
};

/**
 * Participant-facing recap from official results + the viewer's own picks.
 * Optionally enriches items with points from pool score-impact activity when available.
 */
export async function loadParticipantLatestRecap(
  supabase: SupabaseClient,
  picksCtx: AccountKnockoutSelection | null,
  matches: TournamentMatchPublicRow[] | null | undefined,
  tournamentErr: string | null,
): Promise<LoadParticipantLatestRecapResult> {
  if (
    !picksCtx ||
    picksCtx.loadError ||
    !picksCtx.selectedParticipant ||
    picksCtx.initialSlots.length === 0
  ) {
    return emptyRecap;
  }

  if (tournamentErr || !matches) {
    return {
      ...emptyRecap,
      tournamentErr: tournamentErr ?? "Schedule unavailable",
    };
  }

  let pointsByMatchCode: Map<string, number> | undefined;
  if (picksCtx.selectedPoolId) {
    try {
      const activity = await fetchPoolActivityForPool(supabase, picksCtx.selectedPoolId, 30);
      pointsByMatchCode = pointsByMatchCodeFromScoreImpactActivities(
        activity,
        picksCtx.selectedParticipant.id,
      );
    } catch {
      pointsByMatchCode = undefined;
    }
  }

  return {
    ...buildParticipantLatestRecap({
      matches,
      slots: picksCtx.initialSlots,
      teams: picksCtx.teams,
      pointsByMatchCode,
    }),
    tournamentErr: null,
  };
}
