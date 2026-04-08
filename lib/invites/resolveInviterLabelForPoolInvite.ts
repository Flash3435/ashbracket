import type { SupabaseClient, User } from "@supabase/supabase-js";

function trimmedString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function metadataRecord(user: User): Record<string, unknown> | null {
  const m = user.user_metadata;
  if (!m || typeof m !== "object") return null;
  return m as Record<string, unknown>;
}

/**
 * Human-readable inviter line for pool invite emails.
 *
 * Fallback order:
 * 1. `first_name` or `given_name` (auth user_metadata)
 * 2. Pool participant `display_name` for this user, else `display_name` /
 *    `full_name` / `name` from metadata, else `first` + `last` when both exist
 * 3. Account email
 * 4. Neutral phrase when nothing else is available
 */
export function resolveInviterLabelFromUserAndParticipant(input: {
  participantDisplayName: string | null | undefined;
  user: User;
}): string {
  const meta = metadataRecord(input.user);

  const firstName =
    trimmedString(meta?.first_name) ?? trimmedString(meta?.given_name);
  if (firstName) return firstName;

  const poolDisplay = trimmedString(input.participantDisplayName);
  if (poolDisplay) return poolDisplay;

  const metaDisplay =
    trimmedString(meta?.display_name) ??
    trimmedString(meta?.full_name) ??
    trimmedString(meta?.name);
  if (metaDisplay) return metaDisplay;

  const firstForCombo =
    trimmedString(meta?.first_name) ?? trimmedString(meta?.given_name);
  const last =
    trimmedString(meta?.last_name) ?? trimmedString(meta?.family_name);
  if (firstForCombo && last) return `${firstForCombo} ${last}`;
  if (last) return last;

  const email = trimmedString(input.user.email);
  if (email) return email;

  return "Your pool organizer";
}

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

  return resolveInviterLabelFromUserAndParticipant({
    participantDisplayName: part?.display_name,
    user,
  });
}
