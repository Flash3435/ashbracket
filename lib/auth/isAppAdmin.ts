import type { SupabaseClient } from "@supabase/supabase-js";
import { isGlobalAdmin } from "./permissions";

/** True when `user_id` exists in `public.app_admins` (global admin only). */
export async function isAppAdmin(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== userId) return false;
  return isGlobalAdmin(supabase);
}
