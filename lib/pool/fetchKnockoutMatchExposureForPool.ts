import { mapPublicLeaderboardRow } from "@/lib/leaderboard/publicLeaderboard";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { LeaderboardPublicRow } from "../../types/leaderboard";
import type { LeaderboardPublicRowDb } from "../../types/leaderboard";
import {
  buildKnockoutMatchExposure,
  type KnockoutMatchExposure,
} from "./buildKnockoutMatchExposure";
import { buildLeaderboardNameContext } from "./buildNamePreview";
import { loadPoolExposureContext } from "./loadPoolExposureContext";
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

async function resolveLeaderboardRowsForExposure(
  poolId: string,
  provided?: LeaderboardPublicRow[],
): Promise<LeaderboardPublicRow[]> {
  if (provided && provided.length > 0) return provided;

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("leaderboard_public")
    .select("pool_id, pool_name, participant_id, display_name, total_points, rank")
    .eq("pool_id", poolId)
    .order("rank", { ascending: true });

  if (error || !data?.length) return [];
  return data.map((row) => mapPublicLeaderboardRow(row as LeaderboardPublicRowDb));
}

/**
 * Read-only knockout match exposure for participant-facing pages.
 * Uses service role for picks aggregation so public leaderboard works for anonymous visitors.
 * Name previews are limited to leaderboard-visible display names.
 */
export async function fetchKnockoutMatchExposureForPool(
  poolId: string,
  options?: {
    leaderboardRows?: LeaderboardPublicRow[];
  },
): Promise<FetchKnockoutMatchExposureResult> {
  const loaded = await loadPoolExposureContext(poolId);
  if (!loaded.ok) {
    if (loaded.error === "Pool picks are not locked.") {
      return {
        ok: true,
        exposure: EMPTY_EXPOSURE,
        showExposure: false,
        knockoutBracketPicksUnlocked: false,
        picksLocked: false,
      };
    }
    return { ok: false, error: loaded.error };
  }

  const { context } = loaded;
  const leaderboardRows = await resolveLeaderboardRowsForExposure(
    poolId.trim(),
    options?.leaderboardRows,
  );
  const nameContext =
    leaderboardRows.length > 0
      ? {
          ...buildLeaderboardNameContext(leaderboardRows),
          namePreviewLimit: 5,
        }
      : undefined;

  const exposure = buildKnockoutMatchExposure({
    matches: context.matches,
    completeParticipantBrackets: context.completeParticipantBrackets,
    teams: context.teams,
    incompleteCount: context.incompleteCount,
    nameContext,
  });

  const showExposure = shouldShowKnockoutMatchExposure({
    picksLocked: context.picksLocked,
    exposure,
  });

  return {
    ok: true,
    exposure,
    showExposure,
    knockoutBracketPicksUnlocked: context.knockoutBracketPicksUnlocked,
    picksLocked: context.picksLocked,
  };
}
