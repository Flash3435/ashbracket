import { fetchPublicTournamentProgress } from "../tournament/fetchPublicTournamentProgress";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import type { AccountKnockoutSelection } from "./loadAccountKnockoutSelection";
import {
  buildWhoToCheerFor,
  participantHasAnyPick,
  type CheerSuggestion,
  type WhoToCheerForResult,
} from "./buildWhoToCheerFor";

export type WhoToCheerForLoadResult = WhoToCheerForResult & {
  tournamentErr: string | null;
};

const emptyWhoToCheer: WhoToCheerForLoadResult = {
  suggestions: [],
  showIncompleteCta: false,
  hasAnyPick: false,
  tournamentErr: null,
};

/**
 * Read-only insight from already-loaded schedule rows (no extra Supabase round-trip).
 */
export function whoToCheerForFromSchedule(
  picksCtx: AccountKnockoutSelection | null,
  matches: TournamentMatchPublicRow[] | null | undefined,
  tournamentErr: string | null,
): WhoToCheerForLoadResult {
  if (
    !picksCtx ||
    picksCtx.loadError ||
    !picksCtx.selectedParticipant ||
    picksCtx.initialSlots.length === 0
  ) {
    return emptyWhoToCheer;
  }

  if (tournamentErr || !matches) {
    return {
      suggestions: [],
      showIncompleteCta: false,
      hasAnyPick: participantHasAnyPick(picksCtx.initialSlots),
      tournamentErr: tournamentErr ?? "Schedule unavailable",
    };
  }

  return {
    ...buildWhoToCheerFor({
      matches,
      slots: picksCtx.initialSlots,
      teams: picksCtx.teams,
      knockoutBracketPicksUnlocked: picksCtx.knockoutBracketPicksUnlocked,
    }),
    tournamentErr: null,
  };
}

/**
 * Read-only insight: official schedule + the signed-in participant's own picks.
 * Does not load or expose other participants' predictions.
 */
export async function loadWhoToCheerFor(
  picksCtx: AccountKnockoutSelection | null,
): Promise<WhoToCheerForLoadResult> {
  if (
    !picksCtx ||
    picksCtx.loadError ||
    !picksCtx.selectedParticipant ||
    picksCtx.initialSlots.length === 0
  ) {
    return emptyWhoToCheer;
  }

  const { data: tp, error: tournamentErr } = await fetchPublicTournamentProgress();
  return whoToCheerForFromSchedule(picksCtx, tp?.matches, tournamentErr);
}

export type { CheerSuggestion };
