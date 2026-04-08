import type { SupabaseClient, User } from "@supabase/supabase-js";

function labelFromUserMetadata(
  meta: User["user_metadata"],
): string | null {
  if (!meta || typeof meta !== "object") return null;
  for (const key of ["full_name", "name", "display_name"] as const) {
    const v = meta[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Label for invite copy: pool participant display name (same pool), else auth
 * profile fields, else account email, else a neutral organizer phrase.
 */
export async function resolveInviterLabelForPoolInvite(
  supabase: SupabaseClient,
  poolId: string,
  user: User,
): Promise<string> {
  const { data: part } = await supabase
    .from("participants")
    .select("display_name")
    .eq("pool_id", poolId)
    .eq("user_id", user.id)
    .maybeSingle();

  const fromParticipant = String(part?.display_name ?? "").trim();
  if (fromParticipant) return fromParticipant;

  const fromMeta = labelFromUserMetadata(user.user_metadata);
  if (fromMeta) return fromMeta;

  const email = user.email?.trim();
  if (email) return email;

  return "Your pool organizer";
}
