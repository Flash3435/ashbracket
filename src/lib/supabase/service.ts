import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client for trusted server-only work (e.g. recomputing points ledger
 * after participant picks — `replace_points_ledger_for_pool` is admin-only for normal sessions).
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for service operations.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
