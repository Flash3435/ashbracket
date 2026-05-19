import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for trusted server-only work (bypasses RLS on reads).
 * `replace_points_ledger_for_pool` allows `service_role` after application-level checks
 * (e.g. verified participant pick save); pool managers still use the normal server client.
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
