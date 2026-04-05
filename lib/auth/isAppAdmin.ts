import type { SupabaseClient } from "@supabase/supabase-js";

/** True when `user_id` exists in `public.app_admins` (RLS: row visible only to that user). */
export async function isAppAdmin(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("app_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data != null;
}
