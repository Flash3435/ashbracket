import type { SupabaseClient } from "@supabase/supabase-js";

export type KnockoutPickCorrectionAuditInput = {
  poolId: string;
  participantId: string;
  matchCode: string;
  oldTeamId: string | null;
  newTeamId: string;
  oldTeamCountryCode?: string | null;
  newTeamCountryCode?: string | null;
  reason: string;
  clearedPickCount?: number;
  clearedSummary?: string[];
};

/**
 * Append-only audit row for admin knockout pick corrections (RLS: pool managers).
 */
export async function logKnockoutPickCorrectionAudit(
  supabase: SupabaseClient,
  input: KnockoutPickCorrectionAuditInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated." };
  }

  const { error } = await supabase
    .from("participant_pick_correction_audit")
    .insert({
      pool_id: input.poolId.trim(),
      participant_id: input.participantId.trim(),
      actor_user_id: user.id,
      actor_email: user.email?.trim() ?? null,
      match_code: input.matchCode.trim().toUpperCase(),
      old_team_id: input.oldTeamId?.trim() || null,
      new_team_id: input.newTeamId.trim(),
      old_team_country_code: input.oldTeamCountryCode?.trim() || null,
      new_team_country_code: input.newTeamCountryCode?.trim() || null,
      reason: input.reason.trim(),
      metadata:
        input.clearedPickCount != null || input.clearedSummary?.length
          ? {
              clearedPickCount: input.clearedPickCount ?? 0,
              clearedSummary: input.clearedSummary ?? [],
            }
          : null,
    });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
