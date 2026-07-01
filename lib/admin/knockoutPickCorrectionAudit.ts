import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  KnockoutPickStatusAuditChange,
  KnockoutPickStatusRestoreAuditChange,
} from "./knockoutPickCorrection";

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
  markedOutPicks?: ReadonlyArray<KnockoutPickStatusAuditChange>;
  restoredActivePicks?: ReadonlyArray<KnockoutPickStatusRestoreAuditChange>;
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

  const metadata: Record<string, unknown> = {};
  if (input.clearedPickCount != null || input.clearedSummary?.length) {
    metadata.clearedPickCount = input.clearedPickCount ?? 0;
    metadata.clearedSummary = input.clearedSummary ?? [];
  }
  if (input.markedOutPicks?.length) {
    metadata.markedOutPicks = input.markedOutPicks;
  }
  if (input.restoredActivePicks?.length) {
    metadata.restoredActivePicks = input.restoredActivePicks;
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
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
