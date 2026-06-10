import type { SupabaseClient } from "@supabase/supabase-js";
import { isParticipantPicksCompleteForParticipant } from "../communications/picksCompleteness";
import { canManagePool } from "../auth/permissions";
import { poolLocked } from "../pools/poolLocked";
import {
  buildPicksDeadlineBannerViewModel,
  type PicksDeadlineBannerViewModel,
} from "../picks/picksDeadlineBanner";
import { poolShareJoinUrl } from "@/lib/site-url";

/**
 * Loads viewer-aware props for the picks deadline banner for a pool.
 * Returns null when the banner should not render (no deadline, already locked, or >72h away).
 */
export async function loadPicksDeadlineBannerContext(
  supabase: SupabaseClient,
  poolId: string,
  nowMs = Date.now(),
): Promise<PicksDeadlineBannerViewModel | null> {
  const trimmedPoolId = poolId.trim();
  if (!trimmedPoolId) return null;

  const { data: poolRow, error: poolErr } = await supabase
    .from("pools")
    .select("lock_at, join_code")
    .eq("id", trimmedPoolId)
    .maybeSingle();

  if (poolErr || !poolRow) return null;

  const lockAtIso = (poolRow.lock_at as string | null)?.trim() || null;
  if (!lockAtIso) return null;

  const isLocked = poolLocked(lockAtIso);
  if (isLocked) return null;

  const joinCode = (poolRow.join_code as string | null)?.trim() || null;
  const inviteUrl = joinCode ? poolShareJoinUrl(joinCode) : null;
  const joinUrl = joinCode
    ? `/join/${encodeURIComponent(joinCode)}`
    : "/join";
  const poolUrl = `/pool/${trimmedPoolId}`;
  const adminIncompleteUrl = `/admin/pools/${trimmedPoolId}/participants#incomplete-brackets`;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let viewerRole: PicksDeadlineBannerViewModel["viewerRole"] = "signed_out";
  let picksUrl: string | null = null;

  if (user) {
    const isAdmin = await canManagePool(supabase, trimmedPoolId);
    if (isAdmin) {
      viewerRole = "admin";
    } else {
      const { data: participantRow } = await supabase
        .from("participants")
        .select("id")
        .eq("pool_id", trimmedPoolId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      const participantId = participantRow?.id as string | undefined;
      if (!participantId) {
        viewerRole = "signed_in_non_participant";
      } else {
        picksUrl = `/account/picks?participant=${participantId}`;
        const complete = await isParticipantPicksCompleteForParticipant(
          supabase,
          trimmedPoolId,
          participantId,
        );
        viewerRole = complete
          ? "participant_complete"
          : "participant_incomplete";
      }
    }
  }

  return buildPicksDeadlineBannerViewModel({
    lockAtIso,
    isLocked,
    viewerRole,
    joinUrl,
    picksUrl,
    inviteUrl,
    poolUrl,
    adminIncompleteUrl,
    nowMs,
  });
}
