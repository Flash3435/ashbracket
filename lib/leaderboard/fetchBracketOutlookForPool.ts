import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { poolLocked } from "@/lib/pools/poolLocked";
import {
  loadParticipantNamesById,
  loadParticipantTeamPicksById,
  loadTeamNameMapForEdition,
} from "@/lib/poolActivity/scoreImpact/loadScoreImpactContext";
import {
  buildBracketOutlook,
  type BracketOutlookResult,
} from "./buildBracketOutlook";
import { loadCompletedGroupMatchesForOutlook } from "./loadCompletedGroupMatchesForOutlook";
import { fetchPoolHasAwardedLeaderboardPoints } from "./poolLeaderboardIsActive";
import {
  evaluateBracketOutlookVisibility,
  type BracketOutlookVisibilityResult,
} from "./bracketOutlookVisibility";

export type FetchBracketOutlookResult =
  | {
      ok: true;
      outlook: BracketOutlookResult | null;
      completedMatchCount: number;
      totalParticipantCount: number;
      picksLocked: boolean;
      hasAwardedPoints: boolean;
      poolName: string;
      visibility: BracketOutlookVisibilityResult;
    }
  | { ok: false; error: string };

type PoolRow = {
  id: string;
  name: string | null;
  lock_at: string | null;
  tournament_edition_id: string | null;
};

/**
 * Read-only Bracket Outlook for a pool. No DB writes.
 * Private pools require viewer membership when using the RLS client path.
 */
export async function fetchBracketOutlookForPool(
  poolId: string,
  options?: {
    supabase?: SupabaseClient;
    /** When set, verifies the user is a pool member (private outlook). */
    viewerUserId?: string | null;
    /** Skip membership check (public pool page). */
    skipMembershipCheck?: boolean;
  },
): Promise<FetchBracketOutlookResult> {
  const trimmedPoolId = poolId.trim();
  if (!trimmedPoolId) {
    return { ok: false, error: "Pool not found." };
  }

  const service = createServiceRoleClient();
  const { data: poolRow, error: poolErr } = await service
    .from("pools")
    .select("id, name, lock_at, tournament_edition_id, is_public")
    .eq("id", trimmedPoolId)
    .maybeSingle();

  if (poolErr || !poolRow) {
    return { ok: false, error: poolErr?.message ?? "Pool not found." };
  }

  const pool = poolRow as PoolRow & { is_public: boolean | null };
  const locked = poolLocked(pool.lock_at);
  if (!locked) {
    return {
      ok: true,
      outlook: null,
      completedMatchCount: 0,
      totalParticipantCount: 0,
      picksLocked: false,
      hasAwardedPoints: false,
      poolName: String(pool.name ?? "").trim() || "Pool",
      visibility: { showOutlook: false, distribution: null },
    };
  }

  const viewerUserId = options?.viewerUserId?.trim() || null;
  if (!options?.skipMembershipCheck && !pool.is_public) {
    if (!viewerUserId) {
      return { ok: false, error: "Sign in to view this pool outlook." };
    }
    const supabase = options?.supabase;
    if (!supabase) {
      return { ok: false, error: "Could not verify pool membership." };
    }
    const { data: membership, error: memErr } = await supabase
      .from("participants")
      .select("id")
      .eq("pool_id", trimmedPoolId)
      .eq("user_id", viewerUserId)
      .maybeSingle();
    if (memErr) {
      return { ok: false, error: memErr.message };
    }
    if (!membership?.id) {
      return { ok: false, error: "You are not a member of this pool." };
    }
  }

  let hasAwardedPoints = false;
  try {
    hasAwardedPoints = await fetchPoolHasAwardedLeaderboardPoints(trimmedPoolId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load pool points.";
    return { ok: false, error: message };
  }

  const poolName = String(pool.name ?? "").trim() || "Pool";
  if (hasAwardedPoints) {
    return {
      ok: true,
      outlook: null,
      completedMatchCount: 0,
      totalParticipantCount: 0,
      picksLocked: true,
      hasAwardedPoints: true,
      poolName,
      visibility: { showOutlook: false, distribution: null },
    };
  }

  const editionId = pool.tournament_edition_id?.trim() || null;
  if (!editionId) {
    return {
      ok: true,
      outlook: null,
      completedMatchCount: 0,
      totalParticipantCount: 0,
      picksLocked: true,
      hasAwardedPoints: false,
      poolName,
      visibility: { showOutlook: false, distribution: null },
    };
  }

  const [completedMatches, participantPicks, participantNames, teamNameById] =
    await Promise.all([
      loadCompletedGroupMatchesForOutlook(service, editionId),
      loadParticipantTeamPicksById(service, trimmedPoolId),
      loadParticipantNamesById(service, trimmedPoolId),
      loadTeamNameMapForEdition(service, editionId),
    ]);

  const outlook = buildBracketOutlook({
    participantPicks,
    participantNames,
    completedGroupMatches: completedMatches,
    teamNameById,
  });

  const totalParticipantCount = participantNames.size;
  const visibility = evaluateBracketOutlookVisibility({
    picksLocked: true,
    hasAwardedPoints: false,
    outlook,
    completedMatchCount: completedMatches.length,
    totalParticipantCount,
  });

  return {
    ok: true,
    outlook,
    completedMatchCount: completedMatches.length,
    totalParticipantCount,
    picksLocked: true,
    hasAwardedPoints: false,
    poolName,
    visibility,
  };
}
