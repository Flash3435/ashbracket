import { createClient } from "@/lib/supabase/server";
import {
  pickDefaultAccountParticipantId,
  type AccountParticipantProfile,
} from "./resolveAccountParticipantId";
import { poolLocked } from "../pools/poolLocked";
import { leaderboardHrefForParticipantPool } from "../pool/publicLeaderboardHref";

export type SiteHeaderLeaderboardNav = {
  showLeaderboardNav: boolean;
  leaderboardHref: string | null;
};

type ParticipantPoolEmbed = {
  lock_at: string | null;
  is_public: boolean | null;
  is_simulation: boolean | null;
  archived_at: string | null;
  name: string | null;
};

/**
 * Resolves whether the site header should show a Leaderboard link for a signed-in user.
 * Uses the default account participant profile when no URL context is available.
 */
export async function loadSiteHeaderLeaderboardNav(
  userId: string,
): Promise<SiteHeaderLeaderboardNav> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("participants")
    .select(
      `
      id,
      pool_id,
      pools (
        lock_at,
        is_public,
        is_simulation,
        archived_at,
        name
      )
    `,
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error || !rows?.length) {
    return { showLeaderboardNav: false, leaderboardHref: null };
  }

  const profiles: AccountParticipantProfile[] = rows.map((row) => {
    const poolRaw = row.pools as ParticipantPoolEmbed | ParticipantPoolEmbed[] | null;
    const pool = Array.isArray(poolRaw) ? poolRaw[0] : poolRaw;
    return {
      id: row.id as string,
      pool_id: row.pool_id as string,
      pool_lock_at: pool?.lock_at ?? null,
      pool_name: pool?.name ?? undefined,
      is_simulation: Boolean(pool?.is_simulation),
      archived_at: pool?.archived_at ?? null,
    };
  });

  const defaultParticipantId = pickDefaultAccountParticipantId(profiles);
  const selected = rows.find((r) => r.id === defaultParticipantId) ?? rows[0];
  if (!selected) {
    return { showLeaderboardNav: false, leaderboardHref: null };
  }

  const poolRaw = selected.pools as ParticipantPoolEmbed | ParticipantPoolEmbed[] | null;
  const pool = Array.isArray(poolRaw) ? poolRaw[0] : poolRaw;
  const lockAt = pool?.lock_at ?? null;
  if (!poolLocked(lockAt)) {
    return { showLeaderboardNav: false, leaderboardHref: null };
  }

  const href = leaderboardHrefForParticipantPool({
    poolId: selected.pool_id as string,
    isPublic: Boolean(pool?.is_public),
    participantId: selected.id as string,
  });

  return { showLeaderboardNav: true, leaderboardHref: href };
}
