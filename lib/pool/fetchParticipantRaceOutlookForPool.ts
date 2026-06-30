import type { LeaderboardPublicRow } from "../../types/leaderboard";
import {
  buildParticipantRaceOutlook,
  type ParticipantRaceOutlook,
} from "./buildParticipantRaceOutlook";
import { loadPoolExposureContext } from "./loadPoolExposureContext";
import { shouldShowParticipantRaceOutlook } from "./poolExposureDisplay";

export type FetchParticipantRaceOutlookResult =
  | {
      ok: true;
      outlook: ParticipantRaceOutlook;
      showOutlook: boolean;
      knockoutBracketPicksUnlocked: boolean;
      picksLocked: boolean;
    }
  | { ok: false; error: string };

const EMPTY_OUTLOOK: ParticipantRaceOutlook = { rows: [] };

/**
 * Participant-centered knockout race outlook for leaderboard-visible participants.
 */
export async function fetchParticipantRaceOutlookForPool(
  poolId: string,
  options: {
    leaderboardRows: LeaderboardPublicRow[];
    viewerParticipantId?: string | null;
  },
): Promise<FetchParticipantRaceOutlookResult> {
  const loaded = await loadPoolExposureContext(poolId);
  if (!loaded.ok) {
    if (loaded.error === "Pool picks are not locked.") {
      return {
        ok: true,
        outlook: EMPTY_OUTLOOK,
        showOutlook: false,
        knockoutBracketPicksUnlocked: false,
        picksLocked: false,
      };
    }
    return { ok: false, error: loaded.error };
  }

  const { context } = loaded;
  const outlook = buildParticipantRaceOutlook({
    leaderboardRows: options.leaderboardRows,
    completeParticipantBrackets: context.completeParticipantBrackets,
    championPicks: context.championPicks,
    eliminatedTeamIds: context.eliminatedTeamIds,
    viewerParticipantId: options.viewerParticipantId,
  });

  const showOutlook = shouldShowParticipantRaceOutlook({
    picksLocked: context.picksLocked,
    outlook,
    totalCompletedBrackets: context.completeParticipantBrackets.length,
  });

  return {
    ok: true,
    outlook,
    showOutlook,
    knockoutBracketPicksUnlocked: context.knockoutBracketPicksUnlocked,
    picksLocked: context.picksLocked,
  };
}
