import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import type { AccountKnockoutSelection } from "./loadAccountKnockoutSelection";
import { buildMatchday, MATCHDAY_DASHBOARD_LIMIT, type MatchdayResult } from "./buildMatchday";
import { participantHasAnyPick } from "./buildWhoToCheerFor";

export type MatchdayLoadResult = MatchdayResult & {
  tournamentErr: string | null;
  hasAnyPick: boolean;
};

const emptyMatchday: MatchdayLoadResult = {
  suggestions: [],
  hasMatchesToday: false,
  usingUpcomingFallback: false,
  tournamentErr: null,
  hasAnyPick: false,
};

/**
 * Read-only matchday insight from already-loaded schedule rows (no extra Supabase round-trip).
 */
export function matchdayFromSchedule(
  picksCtx: AccountKnockoutSelection | null,
  matches: TournamentMatchPublicRow[] | null | undefined,
  tournamentErr: string | null,
): MatchdayLoadResult {
  if (
    !picksCtx ||
    picksCtx.loadError ||
    !picksCtx.selectedParticipant ||
    picksCtx.initialSlots.length === 0
  ) {
    return emptyMatchday;
  }

  const hasAnyPick = participantHasAnyPick(picksCtx.initialSlots);

  if (tournamentErr || !matches) {
    return {
      suggestions: [],
      hasMatchesToday: false,
      usingUpcomingFallback: false,
      hasAnyPick,
      tournamentErr: tournamentErr ?? "Schedule unavailable",
    };
  }

  return {
    ...buildMatchday({
      matches,
      slots: picksCtx.initialSlots,
      teams: picksCtx.teams,
      limit: MATCHDAY_DASHBOARD_LIMIT,
    }),
    hasAnyPick,
    tournamentErr: null,
  };
}
