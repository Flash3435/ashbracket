import type { PoolJoinMutationResult } from "@/lib/join/actions";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function joinNhlActiveEditionWithClient(
  supabase: SupabaseClient,
): Promise<PoolJoinMutationResult> {
  const { data, error } = await supabase.rpc("join_nhl_active_edition");

  if (error) {
    const msg = error.message ?? "";
    const lower = msg.toLowerCase();
    if (lower.includes("not authenticated") || lower.includes("jwt")) {
      return { ok: false, message: "You must be signed in to join the NHL competition." };
    }
    if (lower.includes("no active nhl edition")) {
      return {
        ok: false,
        message: "There is no active NHL edition to join right now. Try again when the playoffs are live.",
      };
    }
    return { ok: false, message: msg || "Could not join the NHL competition." };
  }

  const membershipId = data as string | null;
  if (!membershipId) {
    return { ok: false, message: "Could not join the NHL competition." };
  }

  return { ok: true, participantId: membershipId };
}
